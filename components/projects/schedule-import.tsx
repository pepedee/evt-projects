"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { importSchedule } from "@/app/(app)/projects/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/card";
import type {
  DraftScheduleItem,
  ScheduleItemKind,
  ScheduleProgress,
} from "@/lib/import/schedule";

/** Vercel rejects request bodies over 4.5MB before the route even runs. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Upload an MS Project XML export or a schedule PDF, review every row it
 * found, then save the ones kept as tasks and milestones. Two stages in
 * memory, like the project import — nothing is written until the review is
 * confirmed, so a bad read costs nothing to throw away. Rows that already
 * exist in the project start unticked, so re-importing an updated plan
 * doesn't double everything up.
 */
export function ScheduleImport({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<DraftScheduleItem[] | null>(null);
  const [included, setIncluded] = useState<boolean[]>([]);
  const [source, setSource] = useState<"msproject" | "pdf" | null>(null);
  const [reading, setReading] = useState<"xml" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setDone(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        "That file is over 4MB. For MS Project, Save As XML is usually far smaller than a PDF; for a PDF, print only the schedule pages.",
      );
      return;
    }

    setReading(file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "xml");
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch(`/api/projects/${projectId}/schedule`, {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? `Couldn't read that file (${response.status}).`);
        return;
      }
      const found = payload.items as DraftScheduleItem[];
      setItems(found);
      setIncluded(found.map((i) => !i.existing));
      setSource(payload.source);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setReading(null);
    }
  }

  function update(i: number, patch: Partial<DraftScheduleItem>) {
    setItems((prev) => prev!.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  function setKind(i: number, kind: ScheduleItemKind) {
    const item = items![i];
    // A milestone is a single date; keep the finish date (or the start, if
    // that's all there was) rather than silently dropping both.
    update(
      i,
      kind === "milestone"
        ? { kind, start_date: null, due_date: item.due_date ?? item.start_date }
        : { kind },
    );
  }

  function toggle(i: number, checked: boolean) {
    setIncluded((prev) => prev.map((v, idx) => (idx === i ? checked : v)));
  }

  function cancel() {
    setItems(null);
    setIncluded([]);
    setSource(null);
    setError(null);
  }

  function confirm() {
    if (!items) return;
    const kept = items.filter((_, i) => included[i]);
    startTransition(async () => {
      const result = await importSchedule(projectId, kept);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      cancel();
      setDone(result.message ?? "Imported.");
    });
  }

  if (!items) {
    return (
      <div className="space-y-2 border-t border-border px-5 py-4">
        <input
          ref={inputRef}
          type="file"
          accept=".xml,.pdf,.mpp,application/pdf,text/xml,application/xml"
          onChange={onPick}
          className="hidden"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            busy={reading !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {reading === "pdf"
              ? "Reading the PDF with AI…"
              : reading === "xml"
                ? "Reading file…"
                : "Import schedule"}
          </Button>
          <p className="text-xs text-muted">
            {reading === "pdf"
              ? "This can take up to a minute for a long schedule."
              : "MS Project (File › Save As › XML) or any schedule / Gantt PDF — creates tasks and milestones with their dates."}
          </p>
        </div>
        {error && <Notice>{error}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}
      </div>
    );
  }

  const keptCount = included.filter(Boolean).length;
  const taskCount = items.filter((i, idx) => included[idx] && i.kind === "task").length;
  const milestoneCount = keptCount - taskCount;
  const existingCount = items.filter((i) => i.existing).length;
  const undatedCount = items.filter(
    (i, idx) => included[idx] && !i.start_date && !i.due_date,
  ).length;
  const allChecked = keptCount === items.length;

  return (
    <div className="space-y-3 border-t border-border px-5 py-4">
      <div className="space-y-1 text-sm">
        <p>
          Found {items.length} row{items.length === 1 ? "" : "s"}
          {source === "pdf" ? " (read by AI — check the dates)" : ""}. Untick
          anything you don&apos;t want, fix any name or date, then import.
        </p>
        {existingCount > 0 && (
          <p className="text-muted">
            {existingCount} already exist in this project and start unticked.
          </p>
        )}
        {undatedCount > 0 && (
          <p className="text-muted">
            {undatedCount} ticked row{undatedCount === 1 ? " has" : "s have"} no
            dates — {undatedCount === 1 ? "it" : "they"}&apos;ll be added, but
            won&apos;t appear on the timeline until dated.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => setIncluded(items.map(() => e.target.checked))}
            className="size-4"
          />
          Select all
        </label>
        <span className="hidden sm:block">Start · Finish · Progress</span>
      </div>

      <div className="max-h-[32rem] divide-y divide-border overflow-y-auto pr-1">
        {items.map((item, i) => {
          const off = !included[i];
          return (
            // Two groups that wrap as whole units, so on a narrow screen the
            // dates never get split apart from each other.
            <div key={i} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5">
              <div className="flex min-w-64 flex-1 items-start gap-2">
                <input
                  type="checkbox"
                  checked={included[i]}
                  onChange={(e) => toggle(i, e.target.checked)}
                  aria-label={`Include ${item.name}`}
                  className="mt-2.5 size-4 shrink-0"
                />
                <Select
                  value={item.kind}
                  onChange={(e) => setKind(i, e.target.value as ScheduleItemKind)}
                  disabled={off}
                  aria-label={`Type of ${item.name}`}
                  className="w-28 shrink-0"
                >
                  <option value="task">Task</option>
                  <option value="milestone">Milestone</option>
                </Select>
                <div className="min-w-0 flex-1">
                  <Input
                    value={item.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    disabled={off}
                    aria-label={`Name of row ${i + 1}`}
                    className="w-full"
                  />
                  {(item.phase || item.existing) && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {item.existing && <Badge tone="warning">Already in project</Badge>}
                      {item.phase && <span className="truncate">{item.phase}</span>}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-6 sm:pl-0">
                {item.kind === "task" ? (
                  <Input
                    type="date"
                    value={item.start_date ?? ""}
                    onChange={(e) => update(i, { start_date: e.target.value || null })}
                    disabled={off}
                    aria-label={`Start date of ${item.name}`}
                    className="w-36"
                  />
                ) : (
                  // Keeps milestone dates lined up under task finish dates.
                  <span className="hidden w-36 sm:block" aria-hidden />
                )}
                <Input
                  type="date"
                  value={item.due_date ?? ""}
                  onChange={(e) => update(i, { due_date: e.target.value || null })}
                  disabled={off}
                  aria-label={`${item.kind === "task" ? "Finish" : "Due"} date of ${item.name}`}
                  className="w-36"
                />
                <Select
                  value={item.progress}
                  onChange={(e) => update(i, { progress: e.target.value as ScheduleProgress })}
                  disabled={off}
                  aria-label={`Progress of ${item.name}`}
                  className="w-36"
                >
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" busy={pending} disabled={keptCount === 0} onClick={confirm}>
          Import {taskCount} task{taskCount === 1 ? "" : "s"}
          {milestoneCount > 0 &&
            ` + ${milestoneCount} milestone${milestoneCount === 1 ? "" : "s"}`}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
      </div>

      {error && <Notice>{error}</Notice>}
    </div>
  );
}
