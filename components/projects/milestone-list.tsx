"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createMilestone,
  deleteMilestone,
  setMilestoneStatus,
} from "@/app/(app)/projects/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import type { Milestone } from "@/lib/db/projects";
import type { MilestoneStatus } from "@/lib/types";

export function MilestoneList({
  projectId,
  milestones,
  canEdit,
  canDelete,
}: {
  projectId: string;
  milestones: Milestone[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMilestone({
        project_id: projectId,
        name,
        description: "",
        due_date: dueDate,
        status: "pending",
      });
      if (!result.ok) setError(result.error);
      else {
        setName("");
        setDueDate("");
      }
    });
  }

  function changeStatus(id: string, status: MilestoneStatus) {
    startTransition(async () => {
      const result = await setMilestoneStatus(id, projectId, status);
      if (!result.ok) setError(result.error);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteMilestone(id, projectId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="divide-y divide-border">
      {milestones.length === 0 ? (
        <EmptyState message="No milestones yet." />
      ) : (
        milestones.map((milestone) => (
          <div key={milestone.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{milestone.name}</p>
              <p className="text-xs text-muted">
                Due {formatDate(milestone.due_date)}
              </p>
            </div>

            {canEdit ? (
              <Select
                value={milestone.status}
                disabled={pending}
                onChange={(e) =>
                  changeStatus(milestone.id, e.target.value as MilestoneStatus)
                }
                className="w-36"
                aria-label={`Status of ${milestone.name}`}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </Select>
            ) : (
              <span className="text-sm text-muted">{milestone.status}</span>
            )}

            {canDelete && (
              <Tooltip label={`Delete ${milestone.name}`}>
                <button
                  type="button"
                  onClick={() => remove(milestone.id)}
                  disabled={pending}
                  aria-label={`Delete ${milestone.name}`}
                  className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              </Tooltip>
            )}
          </div>
        ))
      )}

      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 px-5 py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Milestone name"
            required
            className="min-w-40 flex-1"
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-40"
            aria-label="Due date"
          />
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
