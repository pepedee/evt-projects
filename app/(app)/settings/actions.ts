"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { fail, roleAtLeast, type ActionResult } from "@/lib/types";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

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
    const { error } = await db.from("workspace_invites").insert({
      workspace_id: user.workspaceId,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: user.id,
    });

    if (error) {
      // Unique index on lower(email) where accepted_at is null.
      if (error.code === "23505") {
        return { ok: false, error: "That email already has a pending invite." };
      }
      throw new Error(error.message);
    }

    await logActivity(user, {
      entity: "workspace_invite",
      action: "create",
      summary: `Invited ${parsed.data.email} as ${parsed.data.role}`,
      after: parsed.data,
    });

    revalidatePath("/settings");
    return {
      ok: true,
      message:
        "Saved. No email is sent — tell them to register with this exact address and they'll land in this workspace automatically.",
    };
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
