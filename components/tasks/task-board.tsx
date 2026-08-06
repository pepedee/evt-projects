"use client";

import { useState, useTransition } from "react";
import { setTaskDueDate, setTaskStatus } from "@/app/(app)/tasks/actions";
import { Input, Notice, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/card";
import { PriorityBadge } from "@/components/shared/status-badge";
import {
  BOARD_COLUMNS,
  TASK_STATUS_LABEL,
  groupByStatus,
  isOverdue,
  type TaskWithProject,
} from "@/lib/tasks";
import { formatRelativeDays } from "@/lib/format";
import type { TaskStatus } from "@/lib/types";

/**
 * Kanban view. Cards move with a <select>, not drag-and-drop — the same
 * reasoning as TaskList, plus a board is the view most likely to be used on a
 * phone, where dragging is worst.
 */
export function TaskBoard({
  tasks,
  canEdit,
}: {
  tasks: TaskWithProject[];
  canEdit: boolean;
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((column) => (
          <section
            key={column}
            className="rounded-2xl border border-border bg-surface"
            aria-label={TASK_STATUS_LABEL[column]}
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">
                {TASK_STATUS_LABEL[column]}
              </h2>
              <span className="text-xs tabular-nums text-muted">
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
