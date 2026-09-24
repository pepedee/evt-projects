"use client";

import { useState, useTransition } from "react";
import { Paperclip } from "lucide-react";
import { setTaskDueDate, setTaskStatus } from "@/app/(app)/tasks/actions";
import { Input, Notice, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/card";
import { PriorityBadge } from "@/components/shared/status-badge";
import {
  attachmentCount,
  avatarAccentVar,
  BOARD_COLUMNS,
  initials,
  TASK_STATUS_LABEL,
  groupByStatus,
  isOverdue,
  type TaskWithProject,
} from "@/lib/tasks";
import { formatRelativeDays } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

/** Same status→colour meaning as TaskStatusBadge, just as a dot rather than a
 * pill — used on the column header instead of on every card, since within a
 * column every card already shares that column's status. */
const COLUMN_DOT: Record<TaskStatus, string> = {
  todo: "--muted",
  in_progress: "--primary",
  blocked: "--danger",
  done: "--success",
  cancelled: "--muted",
};

/**
 * Kanban view. Cards move with a <select>, not drag-and-drop — the same
 * reasoning as TaskList, plus a board is the view most likely to be used on a
 * phone, where dragging is worst.
 */
export function TaskBoard({
  tasks,
  canEdit,
  memberNames,
}: {
  tasks: TaskWithProject[];
  canEdit: boolean;
  /** user_id -> full_name, for the assignee avatar. Absent entirely on
   * /demo's fixtures, which carry no real workspace members. */
  memberNames?: Map<string, string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const columns = groupByStatus(tasks);

  function move(id: string, status: TaskStatus) {
    startTransition(async () => {
      const result = await setTaskStatus(id, status);
      if (!result.ok) setError(result.error);
    });
  }

  function changeDueDate(id: string, value: string) {
    startTransition(async () => {
      const result = await setTaskDueDate(id, value || null);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {error && <Notice>{error}</Notice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((column) => (
          <section
            key={column}
            className="rounded-2xl border border-border bg-surface"
            aria-label={TASK_STATUS_LABEL[column]}
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(${COLUMN_DOT[column]})` }}
                  aria-hidden
                />
                {TASK_STATUS_LABEL[column]}
              </h2>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
                {columns[column].length}
              </span>
            </header>

            <div className="space-y-2 p-3">
              {columns[column].length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">Empty</p>
              ) : (
                columns[column].map((task) => (
                  <article
                    key={task.id}
                    className="rounded-xl border border-border bg-surface-2 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium">
                        {task.title}
                      </p>
                      {task.kind === "defect" && (
                        <Badge tone="warning">Defect</Badge>
                      )}
                      <PriorityBadge priority={task.priority} />
                    </div>

                    <p className="mt-1 truncate text-xs text-muted">
                      {task.projects?.name ?? "—"}
                    </p>

                    {task.due_date && (
                      <p
                        className={
                          isOverdue(task)
                            ? "mt-1 text-xs text-danger"
                            : "mt-1 text-xs text-muted"
                        }
                      >
                        {formatRelativeDays(task.due_date)}
                      </p>
                    )}

                    {(task.assignee_id || attachmentCount(task) > 0) && (
                      <div className="mt-2 flex items-center justify-between">
                        {task.assignee_id ? (
                          <span
                            className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold"
                            style={{
                              backgroundColor: `color-mix(in srgb, var(${avatarAccentVar(task.assignee_id)}) 20%, var(--surface))`,
                              color: `var(${avatarAccentVar(task.assignee_id)})`,
                            }}
                            title={memberNames?.get(task.assignee_id) ?? undefined}
                          >
                            {initials(memberNames?.get(task.assignee_id))}
                          </span>
                        ) : (
                          <span />
                        )}
                        {attachmentCount(task) > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <Paperclip size={12} aria-hidden />
                            {attachmentCount(task)}
                          </span>
                        )}
                      </div>
                    )}

                    {canEdit && (
                      <Input
                        type="date"
                        value={task.due_date ?? ""}
                        disabled={pending}
                        onChange={(e) => changeDueDate(task.id, e.target.value)}
                        className="mt-2 text-xs"
                        aria-label={`Due date of ${task.title}`}
                      />
                    )}

                    {canEdit && (
                      <Select
                        value={task.status}
                        disabled={pending}
                        onChange={(e) => move(task.id, e.target.value as TaskStatus)}
                        className="mt-2 text-xs"
                        aria-label={`Move ${task.title}`}
                      >
                        <option value="todo">To do</option>
                        <option value="in_progress">In progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                      </Select>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
