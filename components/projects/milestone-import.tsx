"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { importMilestones, parseMsProjectMilestones } from "@/app/(app)/projects/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import type { DraftMilestone } from "@/lib/import/msproject";
import type { MilestoneStatus } from "@/lib/types";

/**
 * Upload an MS Project "Save As > XML" export, review the milestones it
 * found, then save. Two stages in memory, like ImportForm's project import —
 * nothing is written until the review is confirmed, so a bad parse costs
 * nothing to throw away and re-try.
 */
export function MilestoneImport({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<DraftMilestone[] | null>(null);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setParsing(true);

    const body = new FormData();
    body.set("file", file);

    try {
      const result = await parseMsProjectMilestones(body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDrafts(result.milestones);
      setIncluded(result.milestones.map(() => true));
    } finally {
      setParsing(false);
    }
  }

  function updateDraft(i: number, patch: Partial<DraftMilestone>) {
    setDrafts((prev) => prev!.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function toggleIncluded(i: number, checked: boolean) {
    setIncluded((prev) => prev.map((v, idx) => (idx === i ? checked : v)));
  }

  function cancel() {
    setDrafts(null);
    setIncluded([]);
    setError(null);
  }

  function confirm() {
    if (!drafts) return;
    const toImport = drafts.filter((_, i) => included[i]);
    startTransition(async () => {
      const result = await importMilestones(projectId, toImport);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      cancel();
    });
  }

  if (!drafts) {
    return (
      <div className="border-t border-border px-5 py-4">
        <input
          ref={inputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={onPick}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          busy={parsing}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {parsing ? "Reading file…" : "Import from MS Project (XML)"}
        </Button>
        {error && (
          <div className="mt-2">
            <Notice>{error}</Notice>
          </div>
        )}
      </div>
    );
  }

  const includedCount = included.filter(Boolean).length;

  return (
    <div className="space-y-3 border-t border-border px-5 py-4">
      <p className="text-sm text-muted">
        {drafts.length} milestone{drafts.length === 1 ? "" : "s"} found — uncheck
        any you don&apos;t want, edit the rest, then import.
      </p>

      <div className="space-y-2">
        {drafts.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={included[i]}
              onChange={(e) => toggleIncluded(i, e.target.checked)}
              aria-label={`Include ${d.name}`}
              className="size-4 shrink-0"
            />
            <Input
              value={d.name}
              onChange={(e) => updateDraft(i, { name: e.target.value })}
              disabled={!included[i]}
              aria-label={`Name for milestone ${i + 1}`}
              className="min-w-40 flex-1"
            />
            <Input
              type="date"
              value={d.due_date ?? ""}
              onChange={(e) => updateDraft(i, { due_date: e.target.value || null })}
              disabled={!included[i]}
              aria-label={`Due date for ${d.name}`}
              className="w-40"
            />
            <Select
              value={d.status}
              onChange={(e) => updateDraft(i, { status: e.target.value as MilestoneStatus })}
              disabled={!included[i]}
              aria-label={`Status for ${d.name}`}
              className="w-36"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" busy={pending} disabled={includedCount === 0} onClick={confirm}>
          Import {includedCount} milestone{includedCount === 1 ? "" : "s"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={cancel}>
          Cancel
        </Button>
      </div>

      {error && <Notice>{error}</Notice>}
    </div>
  );
}
