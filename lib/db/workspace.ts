import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export interface Member {
  user_id: string;
  role: Role;
  full_name: string | null;
  created_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface MyWorkspace {
  workspace_id: string;
  role: Role;
  name: string;
}

export interface ActivityRow {
  id: number;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  summary: string | null;
  created_at: string;
}

export async function listMembers(workspaceId: string): Promise<Member[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("workspace_members")
    .select("user_id, role, full_name, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at")
    .returns<Member[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Every workspace this user belongs to, not just the active one — almost
 * always a list of one. RLS's workspace_members_read policy is satisfied by
 * a user's own membership rows regardless of which workspace_id they carry,
 * so this needs no special-casing beyond filtering to their own user_id.
 * (The one function here that's deliberately NOT scoped to a single
 * workspace — that's the whole point of it.)
 */
export async function listMyWorkspaces(userId: string): Promise<MyWorkspace[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId)
    .order("created_at")
    .returns<{ workspace_id: string; role: Role; workspaces: { name: string } | null }[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    workspace_id: row.workspace_id,
    role: row.role,
    name: row.workspaces?.name ?? "Workspace",
  }));
}

export async function listPendingInvites(workspaceId: string): Promise<PendingInvite[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("workspace_invites")
    .select("id, email, role, created_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .order("created_at")
    .returns<PendingInvite[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

const ACTIVITY_PAGE_SIZE = 50;

export async function listActivity(
  workspaceId: string,
  page = 1,
): Promise<{
  rows: ActivityRow[];
  total: number;
  pageCount: number;
}> {
  const db = await createClient();
  const current = Math.max(1, page);

  const { data, count, error } = await db
    .from("activity_logs")
    .select("id, actor_id, entity, entity_id, action, summary, created_at", {
      count: "exact",
    })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(
      (current - 1) * ACTIVITY_PAGE_SIZE,
      current * ACTIVITY_PAGE_SIZE - 1,
    )
    .returns<ActivityRow[]>();

  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    rows: data ?? [],
    total,
    pageCount: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)),
  };
}
