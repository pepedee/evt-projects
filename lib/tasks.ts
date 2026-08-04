import type { Priority, TaskStatus } from "@/lib/types";

/**
 * Task shapes and pure helpers.
 *
 * Kept separate from lib/db/tasks.ts on purpose: client components need these
 * labels and predicates, and importing them from the db module would drag
 * next/headers and the server Supabase client into the browser bundle.
 * Nothing here may import from lib/db or lib/supabase/server.
 */

export interface TaskRow {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  estimate_hours: number | null;
  spent_hours: number;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

/** A task carrying just enough of its project to render a cross-project list. */
export type TaskWithProject = TaskRow & {
  projects: { name: string; code: string | null; currency: string } | null;
};

/** Kanban column order. Cancelled is deliberately absent — it is not a column. */
export const BOARD_COLUMNS: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** Group tasks into kanban columns, preserving the query's ordering. */
export function groupByStatus(
  tasks: TaskWithProject[],
): Record<TaskStatus, TaskWithProject[]> {
  const columns = {
    todo: [],
    in_progress: [],
    blocked: [],
    done: [],
    cancelled: [],
  } as Record<TaskStatus, TaskWithProject[]>;

  for (const task of tasks) columns[task.status].push(task);
  return columns;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(task: Pick<TaskRow, "due_date" | "status">): boolean {
  if (!task.due_date) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return task.due_date < today();
}
