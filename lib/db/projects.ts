import { createClient } from "@/lib/supabase/server";
import { deriveHealth } from "@/lib/health";
import type {
  Health,
  MilestoneStatus,
  Priority,
  ProjectStatus,
} from "@/lib/types";

/** Row shape of tracker.project_overview (see 0009_project_overview.sql). */
export interface ProjectRow {
  id: string;
  workspace_id: string;
  code: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  health_override: Health | null;
  progress_pct: number;
  client_name: string | null;
  currency: string;
  start_date: string | null;
  target_date: string | null;
  actual_end_date: string | null;
  owner_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  task_total: number;
  task_done: number;
  task_open: number;
  task_overdue: number;
  task_blocked: number;
}

/** A project with its computed health folded in, ready to render. */
export type Project = ProjectRow & { health: Health };

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
}

export interface ProjectFilters {
  search?: string;
  status?: ProjectStatus | "all";
  priority?: Priority | "all";
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

function withHealth(row: ProjectRow): Project {
  return { ...row, health: deriveHealth(row) };
}

export async function listProjects(filters: ProjectFilters = {}): Promise<{
  rows: Project[];
  total: number;
  pageCount: number;
}> {
  const db = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

  let query = db
    .from("project_overview")
    .select("*", { count: "exact" })
    .is("deleted_at", null);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }
  if (filters.search?.trim()) {
    // Escape the PostgREST or() delimiters so a comma or paren in the search
    // box cannot break out of the filter expression.
    const term = filters.search.trim().replace(/[,()]/g, " ");
    query = query.or(
      `name.ilike.%${term}%,code.ilike.%${term}%,client_name.ilike.%${term}%`,
    );
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
    .returns<ProjectRow[]>();

  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    rows: (data ?? []).map(withHealth),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("project_overview")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<ProjectRow>();

  if (error) throw new Error(error.message);
  return data ? withHealth(data) : null;
}

export async function listMilestones(projectId: string): Promise<Milestone[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("milestones")
    .select("id, project_id, name, description, due_date, status, sort_order")
    .eq("project_id", projectId)
    .order("sort_order")
    .returns<Milestone[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Counts for the dashboard and the projects header. */
export async function projectStatusCounts(): Promise<Record<string, number>> {
  const db = await createClient();
  const { data, error } = await db
    .from("projects")
    .select("status")
    .is("deleted_at", null)
    .returns<{ status: ProjectStatus }[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
}
