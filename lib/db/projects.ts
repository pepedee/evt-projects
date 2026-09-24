import { createClient } from "@/lib/supabase/server";
import { assessHealth, needsAttention } from "@/lib/health";
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
  location: string | null;
  currency: string;
  quotation_date: string | null;
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
  // Postgres numeric arrives as a string often enough that trusting it to be
  // a number here would be a silent bug. Normalised in withHealth().
  planned_total: number | string;
  spent_total: number | string;
  spent_unassigned: number | string;
}

/**
 * A project ready to render: health computed, money coerced to numbers.
 */
export type Project = Omit<
  ProjectRow,
  "planned_total" | "spent_total" | "spent_unassigned"
> & {
  health: Health;
  /** Why health isn't on track, e.g. "3 of 8 tasks overdue"; null when it is. */
  health_reason: string | null;
  planned_total: number;
  spent_total: number;
  spent_unassigned: number;
  /** Positive means under budget, negative means over. */
  variance: number;
};

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
}

export type ProjectSort = "updated" | "name" | "code";

export interface ProjectFilters {
  search?: string;
  status?: ProjectStatus | "all";
  priority?: Priority | "all";
  sort?: ProjectSort;
  /** Only projects that are at risk or off track (see needsAttention). */
  attention?: boolean;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

/** Postgres numeric may serialise as a string; never let one reach arithmetic. */
export function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function withHealth(row: ProjectRow): Project {
  const planned_total = toNumber(row.planned_total);
  const spent_total = toNumber(row.spent_total);
  const { health, reason } = assessHealth(row);

  return {
    ...row,
    health,
    health_reason: reason,
    planned_total,
    spent_total,
    spent_unassigned: toNumber(row.spent_unassigned),
    variance: planned_total - spent_total,
  };
}

export async function listProjects(
  workspaceId: string,
  filters: ProjectFilters = {},
): Promise<{
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
    .eq("workspace_id", workspaceId)
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

  // Code is optional, so a code sort puts uncoded projects last regardless
  // of anything else — there's no meaningful rank for "no quotation number".
  if (filters.sort === "code") {
    query = query.order("code", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "name") {
    query = query.order("name", { ascending: true });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  const pageOf = (total: number) => Math.max(1, Math.ceil(total / pageSize));

  // Health is derived in code from dates that keep moving (see lib/health),
  // so there's no column to filter on in the query: fetch the workspace's
  // projects, keep the ones needing attention, then page in memory. Fine at
  // this app's scale (tens of projects, not tens of thousands).
  if (filters.attention) {
    const { data, error } = await query.returns<ProjectRow[]>();
    if (error) throw new Error(error.message);
    const matching = (data ?? []).map(withHealth).filter(needsAttention);
    return {
      rows: matching.slice((page - 1) * pageSize, page * pageSize),
      total: matching.length,
      pageCount: pageOf(matching.length),
    };
  }

  const { data, count, error } = await query
    .range((page - 1) * pageSize, page * pageSize - 1)
    .returns<ProjectRow[]>();

  if (error) throw new Error(error.message);

  const total = count ?? 0;
  return {
    rows: (data ?? []).map(withHealth),
    total,
    pageCount: pageOf(total),
  };
}

export async function getProject(
  id: string,
  workspaceId: string,
): Promise<Project | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("project_overview")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle<ProjectRow>();

  if (error) throw new Error(error.message);
  return data ? withHealth(data) : null;
}

export async function listMilestones(
  projectId: string,
  workspaceId: string,
): Promise<Milestone[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("milestones")
    .select("id, project_id, name, description, due_date, status, sort_order")
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .returns<Milestone[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Counts for the dashboard and the projects header. */
export async function projectStatusCounts(
  workspaceId: string,
): Promise<Record<string, number>> {
  const db = await createClient();
  const { data, error } = await db
    .from("projects")
    .select("status")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .returns<{ status: ProjectStatus }[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
}
