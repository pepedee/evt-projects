"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_WORKSPACE_COOKIE, requireRole, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { fail, roleAtLeast, type ActionResult } from "@/lib/types";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

/** Best guess at this deployment's own origin, for the invite email's link. */
async function siteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3006";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function inviteMember(input: {
  email: string;
  role: string;
}): Promise<ActionResult> {
  try {
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("admin");

    if (parsed.data.role === "owner" && !roleAtLeast(user.role, "owner")) {
      return { ok: false, error: "Only an owner can invite someone as owner." };
    }

    const db = await createClient();
    const { data: invite, error } = await db
      .from("workspace_invites")
      .insert({
        workspace_id: user.workspaceId,
        email: parsed.data.email,
        role: parsed.data.role,
        invited_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      // Unique index on lower(email) where accepted_at is null.
      if (error.code === "23505") {
        return { ok: false, error: "That email already has a pending invite." };
      }
      throw new Error(error.message);
    }

    // The row above is what provision_workspace() checks at signup time —
    // this call is what actually gets them there. It creates the auth.users
    // row right now (so the trigger honors the invite immediately, before
    // any email is even opened) and sends Supabase's own invite email with a
    // link to /accept-invite.
    const admin = createAdminClient();
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      parsed.data.email,
      { redirectTo: `${await siteUrl()}/accept-invite` },
    );

    if (inviteError) {
      if (inviteError.code === "email_exists") {
        // Already registered somewhere else. The pending invite row can
        // never be consumed by provision_workspace() — that only runs for a
        // brand new signup — so it would just sit there forever; remove it
        // and add them to workspace_members directly instead.
        await db.from("workspace_invites").delete().eq("id", invite.id);

        // generateLink() resolves an existing user by email without sending
        // anything or creating a duplicate — verified against this project
        // before relying on it (magiclink works for any registered email
        // regardless of how the account was originally created).
        const { data: existing, error: lookupError } =
          await admin.auth.admin.generateLink({
            type: "magiclink",
            email: parsed.data.email,
          });

        if (lookupError || !existing?.user) {
          return {
            ok: false,
            error: "That email is already registered, but it couldn't be looked up. Try again.",
          };
        }

        const fullName =
          (existing.user.user_metadata?.full_name as string | undefined)?.trim() ||
          parsed.data.email.split("@")[0];

        const { error: memberError } = await db.from("workspace_members").insert({
          workspace_id: user.workspaceId,
          user_id: existing.user.id,
          role: parsed.data.role,
          full_name: fullName,
        });

        if (memberError) {
          // Primary key on (workspace_id, user_id).
          if (memberError.code === "23505") {
            return { ok: false, error: "That person is already a member of this workspace." };
          }
          throw new Error(memberError.message);
        }

        await logActivity(user, {
          entity: "workspace_invite",
          action: "create",
          summary: `Added ${parsed.data.email} (existing account) as ${parsed.data.role}`,
          after: parsed.data,
        });

        revalidatePath("/settings");
        return {
          ok: true,
          message: `${parsed.data.email} already had an account, so they were added to this workspace directly as ${parsed.data.role}. They'll see a workspace switcher next time they sign in.`,
        };
      }

      // Any other failure (e.g. email sending misconfigured): the invite
      // row still stands, so registering with this address later still
      // works via provision_workspace() — just say so plainly.
      await logActivity(user, {
        entity: "workspace_invite",
        action: "create",
        summary: `Invited ${parsed.data.email} as ${parsed.data.role} (email failed: ${inviteError.message})`,
        after: parsed.data,
      });
      revalidatePath("/settings");
      return {
        ok: true,
        message: `Saved, but the invite email couldn't be sent (${inviteError.message}). They can still register with this exact address and will land in this workspace automatically.`,
      };
    }

    await logActivity(user, {
      entity: "workspace_invite",
      action: "create",
      summary: `Invited ${parsed.data.email} as ${parsed.data.role}`,
      after: parsed.data,
    });

    revalidatePath("/settings");
    return { ok: true, message: `Invite email sent to ${parsed.data.email}.` };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Changes which workspace getSessionUser() resolves to, for people who
 * belong to more than one. The membership check here is what makes the
 * cookie trustworthy elsewhere — getSessionUser() doesn't re-verify it, it
 * just falls back to the default if the workspace named turns out not to
 * match a real membership row.
 */
export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const db = await createClient();

    const { data: membership, error } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!membership) {
      return { ok: false, error: "You're not a member of that workspace." };
    }

    (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelInvite(id: string): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db.from("workspace_invites").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "workspace_invite",
      entityId: id,
      action: "delete",
      summary: "Cancelled a pending invite",
    });

    revalidatePath("/settings");
    return { ok: true, message: "Invite cancelled." };
  } catch (err) {
    return fail(err);
  }
}
