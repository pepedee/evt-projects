import { createClient } from "@/lib/supabase/server";
import { today, type TaskWithProject } from "@/lib/tasks";
import type { Priority, TaskStatus } from "@/lib/types";

/**
 * Task queries. Server-only — the shapes and pure helpers live in lib/tasks.ts
 * so client components can import those without pulling this file in.
 */

export interface TaskFilters {
  projectId?: string;
  status?: TaskStatus | "all";
  priority?: Priority | "all";
  search?: string;
  /** Only tasks past their due date and not finished. */
  overdueOnly?: boolean;
}

const TASK_COLUMNS =
  "id, project_id, milestone_id, title, description, status, priority, " +
  "assignee_id, estimate_hours, spent_hours, start_date, due_date, " +
  "completed_at, sort_order, created_at";

const TASK_WITH_PROJECT = `${TASK_COLUMNS}, projects(name, code, currency)`;

export async function listTasks(
  filters: TaskFilters = {},
): Promise<TaskWithProject[]> {
  const db = await createClient();

  let query = db.from("tasks").select(TASK_WITH_PROJECT).is("deleted_at", null);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.priority && filters.priority !== "all") {
    query = query.eq("priority", filters.priority);
  }
  if (filters.search?.trim()) {
    query = query.ilike("title", `%${filters.search.trim()}%`);
  }
  if (filters.overdueOnly) {
    query = query
      .not("due_date", "is", null)
      .lt("due_date", today())
      .not("status", "in", "(done,cancelled)");
  }

  const { data, error } = await query
    .order("sort_order")
    .order("created_at")
    .returns<TaskWithProject[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTask(id: string): Promise<TaskWithProject | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("tasks")
    .select(TASK_WITH_PROJECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<TaskWithProject>();

  if (error) throw new Error(error.message);
  return data;
}
