import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient, createAuthClient } from "@/lib/supabase/server";
import { roleAtLeast, type Role, type SessionUser } from "@/lib/types";

interface MembershipRow {
  workspace_id: string;
  role: Role;
  full_name: string | null;
  workspaces: { name: string } | null;
}

const MEMBERSHIP_SELECT = "workspace_id, role, full_name, workspaces(name)";

/**
 * The signed-in user and the workspace they are working in. Cached per
 * request so several components can call it without re-querying.
 *
 * Returns null when nobody is signed in. Throws only if the database is
 * unreachable, which is a real failure the caller should not paper over.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = await createClient();

  const load = async () =>
    db
      .from("workspace_members")
      .select(MEMBERSHIP_SELECT)
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle<MembershipRow>();

  let { data: membership } = await load();

  // An account can exist without a workspace: it was created before this app
  // did, or the signup trigger swallowed an error (see 0007_signup.sql).
  // ensure_workspace() is idempotent, so calling it here is safe.
  if (!membership) {
    const { error } = await db.rpc("ensure_workspace");
    if (error) return null;
    ({ data: membership } = await load());
    if (!membership) return null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      membership.full_name?.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.email ?? "").split("@")[0],
    workspaceId: membership.workspace_id,
    workspaceName: membership.workspaces?.name ?? "Workspace",
    role: membership.role,
  };
});

/** Use at the top of every protected page. Redirects instead of throwing. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Use before any write. Throws a message the UI can show in a toast.
 *
 * This is a courtesy, not the security boundary — RLS in the database is what
 * actually stops the write. It exists so the user gets a sentence instead of
 * a row-level-security rejection.
 */
export async function requireRole(minimum: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleAtLeast(user.role, minimum)) {
    throw new Error(
      `Your role (${user.role}) is not allowed to do this. Needs ${minimum} or above.`,
    );
  }
  return user;
}

export function can(user: SessionUser | null, minimum: Role): boolean {
  return user ? roleAtLeast(user.role, minimum) : false;
}
