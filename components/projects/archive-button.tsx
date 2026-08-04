"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { deleteProject } from "@/app/(app)/projects/actions";
import { Button, Notice } from "@/components/ui/form";

/**
 * Archiving is a soft delete, but it still removes the project from every
 * list, so it asks first rather than acting on a single click.
 */
export function ArchiveProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function archive() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/projects");
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button variant="outline" onClick={() => setConfirming(true)}>
        <Archive className="size-4" />
        Archive
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <Notice>{error}</Notice>}
      <span className="text-sm text-muted">Archive this project?</span>
      <Button variant="danger" size="sm" busy={pending} onClick={archive}>
        Yes, archive
      </Button>
      <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
