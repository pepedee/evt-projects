import type { Role, SessionUser } from "@/lib/types";

/**
 * Identity — or rather, the absence of one.
 *
 * The app has no authentication. Every visitor is the same anonymous operator
 * working in one shared workspace, so these functions return a fixed identity
 * instead of resolving a session.
 *
 * They are kept (rather than deleted and their call sites rewritten) because
 * every screen and server action already calls them, and because putting
 * authentication back later means changing this file and little else.
 */

/** Must match the workspace inserted by 0012_open_access.sql. */
export const SHARED_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

const ANONYMOUS: SessionUser = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "",
  fullName: "Team",
  workspaceId: SHARED_WORKSPACE_ID,
  workspaceName: "Shared workspace",
  // Everyone has full rights: with no sign-in there is nobody to distinguish.
  role: "owner",
};

export async function getSessionUser(): Promise<SessionUser | null> {
  return ANONYMOUS;
}

export async function requireUser(): Promise<SessionUser> {
  return ANONYMOUS;
}

/**
 * Always succeeds. Kept so the call sites in every actions.ts keep compiling
 * and keep documenting which operations were privileged — restoring auth means
 * restoring the check here, not hunting through thirty files.
 */
export async function requireRole(minimum: Role): Promise<SessionUser> {
  void minimum;
  return ANONYMOUS;
}

export function can(user: SessionUser | null, minimum: Role): boolean {
  void user;
  void minimum;
  return true;
}
