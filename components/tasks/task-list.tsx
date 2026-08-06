"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createTask,
  deleteTask,
  setTaskDueDate,
  setTaskStatus,
} from "@/app/(app)/tasks/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import { EmptyState, Badge } from "@/components/ui/card";
import { PriorityBadge } from "@/components/shared/status-badge";
import { isOverdue, type TaskWithProject } from "@/lib/tasks";
import { formatRelativeDays } from "@/lib/format";
import type { Priority, TaskStatus } from "@/lib/types";

/**
 * Task list with inline add. Status is a <select> rather than drag-and-drop:
 * it is keyboard accessible, works on a phone, and needs no extra dependency.
 */
export function TaskList({
  projectId,
  tasks,
  canEdit,
  canDelete,
  showProject = false,
}: {
  projectId?: string;
  tasks: TaskWithProject[];
  canEdit: boolean;
  canDelete: boolean;
  showProject?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [isDefect, setIsDefect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setError(null);
    startTransition(async () => {
      const result = await createTask({
        project_id: projectId,
        title,
        description: "",
        status: "todo",
        priority,
        kind: isDefect ? "defect" : "task",
        estimate_hours: null,
        spent_hours: null,
        start_date: "",
        due_date: dueDate,
      });
      if (!result.ok) setError(result.error);
      else {
        setTitle("");
        setDueDate("");
        setIsDefect(false);
      }
    });
  }

  function changeStatus(id: string, status: TaskStatus) {
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

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteTask(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="divide-y divide-border">
      {tasks.length === 0 ? (
        <EmptyState message="No tasks yet." />
      ) : (
        tasks.map((task) => (
          <div key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-48 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className={
                    task.status === "done"
                      ? "truncate text-sm text-muted line-through"
                      : "truncate text-sm font-medium"
                  }
                >
                  {task.title}
                </p>
                {task.kind === "defect" && <Badge tone="warning">Defect</Badge>}
                <PriorityBadge priority={task.priority} />
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {showProject && task.projects
                  ? `${task.projects.name} · `
                  : ""}
                {task.due_date ? (
                  <span className={isOverdue(task) ? "text-danger" : undefined}>
                    {formatRelativeDays(task.due_date)}
                  </span>
                ) : (
                  "No due date"
                )}
              </p>
            </div>

            {canEdit ? (
              <Input
                type="date"
                value={task.due_date ?? ""}
                disabled={pending}
                onChange={(e) => changeDueDate(task.id, e.target.value)}
                className="w-40"
                aria-label={`Due date of ${task.title}`}
              />
            ) : (
              task.due_date && <span className="text-sm text-muted">{task.due_date}</span>
            )}

            {canEdit ? (
              <Select
                value={task.status}
                disabled={pending}
                onChange={(e) => changeStatus(task.id, e.target.value as TaskStatus)}
                className="w-36"
                aria-label={`Status of ${task.title}`}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            ) : (
              <span className="text-sm text-muted">{task.status}</span>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => remove(task.id)}
                disabled={pending}
                aria-label={`Archive ${task.title}`}
                className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))
      )}

      {canEdit && projectId && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 px-5 py-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            required
            className="min-w-40 flex-1"
          />
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-32"
            aria-label="Priority"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-40"
            aria-label="Due date"
          />
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={isDefect}
              onChange={(e) => setIsDefect(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Defect
          </label>
          <Button type="submit" size="sm" busy={pending}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </form>
      )}

      {error && (
        <div className="px-5 py-3">
          <Notice>{error}</Notice>
        </div>
      )}
    </div>
  );
}
