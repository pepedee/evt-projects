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

export interface ActivityRow {
  id: number;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  summary: string | null;
  created_at: string;
}

export async function listMembers(): Promise<Member[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("workspace_members")
    .select("user_id, role, full_name, created_at")
    .order("created_at")
    .returns<Member[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("workspace_invites")
    .select("id, email, role, created_at")
    .is("accepted_at", null)
    .order("created_at")
    .returns<PendingInvite[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

const ACTIVITY_PAGE_SIZE = 50;

export async function listActivity(page = 1): Promise<{
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
