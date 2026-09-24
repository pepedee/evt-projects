/**
 * Shared vocabulary. The unions here mirror the CHECK constraints in
 * supabase/migrations — if you add a value in one place, add it in the other.
 */

export type Role = "owner" | "admin" | "member" | "viewer";

/** Mirrors tracker.role_rank(). Higher outranks lower. */
const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

/** Whether the customer has committed with a PO — see 0022_project_po_status.sql. */
export type PoStatus = "waiting" | "received" | "lost";

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  waiting: "Waiting for PO",
  received: "PO received",
  lost: "LOST",
};

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export type MilestoneStatus = "pending" | "in_progress" | "done";

export type Priority = "low" | "medium" | "high" | "critical";

/** Never stored except as a manual override — see 0002_projects.sql. */
export type Health = "on_track" | "at_risk" | "off_track";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  workspaceId: string;
  workspaceName: string;
  role: Role;
}

/**
 * What every server action returns. A discriminated union so the caller has
 * to look at `ok` before reading anything else.
 */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** Turn a thrown value into a result the UI can show in a toast. */
export function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}
