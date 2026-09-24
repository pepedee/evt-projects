"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteProject } from "@/app/(app)/projects/actions";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Icon-only Edit/Delete on a project card. Sits above the card's stretched
 * title link (relative z-10) so clicks here don't also open the project.
 * Delete is the same soft delete as the detail page's Archive button, and
 * asks first for the same reason — one stray click on a small icon
 * shouldn't make a project vanish from every list.
 */
export function ProjectCardActions({
  projectId,
  projectName,
  canEdit,
  canDelete,
}: {
  projectId: string;
  projectName: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit && !canDelete) return null;

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const iconButton =
    "flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground";

  if (confirming) {
    return (
      <div className="relative z-10 flex items-center gap-1.5 text-xs">
        <span className={error ? "text-danger" : "text-muted"}>
          {error ?? "Delete?"}
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-md bg-danger px-2 py-1 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "…" : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={pending}
          className="rounded-md border border-border px-2 py-1 transition hover:bg-surface-2"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex items-center">
      {canEdit && (
        <Tooltip label="Edit project">
          <Link
            href={`/projects/${projectId}/edit`}
            aria-label={`Edit ${projectName}`}
            className={iconButton}
          >
            <Pencil className="size-4" />
          </Link>
        </Tooltip>
      )}
      {canDelete && (
        <Tooltip label="Delete project">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${projectName}`}
            className={`${iconButton} hover:text-danger`}
          >
            <Trash2 className="size-4" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
