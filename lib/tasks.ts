import type { Priority, TaskStatus } from "@/lib/types";

/**
 * Task shapes and pure helpers.
 *
 * Kept separate from lib/db/tasks.ts on purpose: client components need these
 * labels and predicates, and importing them from the db module would drag
 * next/headers and the server Supabase client into the browser bundle.
 * Nothing here may import from lib/db or lib/supabase/server.
 */

export type TaskKind = "task" | "defect";

export interface TaskRow {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  kind: TaskKind;
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
  /** PostgREST's embedded-count shape: an array with one row, `{ count }`.
   * Optional so fixtures (app/demo) that predate this field still type-check. */
  documents?: { count: number }[];
};

export function attachmentCount(task: Pick<TaskWithProject, "documents">): number {
  return task.documents?.[0]?.count ?? 0;
}

/** Deterministic accent per person, cycling through tokens already validated
 * for every theme (see stat-tile.tsx) — no new colours to maintain, and
 * stable across renders/reloads since it's derived from the id, not order. */
const AVATAR_ACCENTS = ["--primary", "--chart-1", "--warning", "--danger"] as const;

export function avatarAccentVar(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_ACCENTS[hash % AVATAR_ACCENTS.length];
}

export function initials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

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
