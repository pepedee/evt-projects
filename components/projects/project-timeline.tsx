import { EmptyState } from "@/components/ui/card";
import { formatDate, todayISO } from "@/lib/format";
import type { Milestone } from "@/lib/db/projects";
import type { TaskWithProject } from "@/lib/tasks";

/**
 * A read-only Gantt-lite view of one project's schedule: milestones (a single
 * point) and tasks (a bar when both start_date and due_date are set, else a
 * point at due_date) plotted on one shared, proportionally-scaled date axis.
 *
 * Deliberately not drag-to-reschedule — same reasoning TaskBoard's own doc
 * comment gives for not being drag-and-drop: this is the view most likely
 * read on a phone, where dragging a date bar precisely is worst of all.
 * Editing a date still happens where it already does (task/milestone lists).
 */

type Row = {
  id: string;
  label: string;
  colorVar: string;
} & (
  | { kind: "point"; pct: number }
  | { kind: "bar"; startPct: number; widthPct: number }
);

const MILESTONE_COLOR: Record<Milestone["status"], string> = {
  pending: "--muted",
  in_progress: "--primary",
  done: "--success",
};

const TASK_COLOR: Record<TaskWithProject["status"], string> = {
  todo: "--muted",
  in_progress: "--primary",
  blocked: "--danger",
  done: "--success",
  cancelled: "--muted",
};

function toMs(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

export function ProjectTimeline({
  milestones,
  tasks,
  projectStartDate,
  projectTargetDate,
}: {
  milestones: Milestone[];
  tasks: TaskWithProject[];
  projectStartDate: string | null;
  projectTargetDate: string | null;
}) {
  const allDates = [
    projectStartDate,
    projectTargetDate,
    ...milestones.map((m) => m.due_date),
    ...tasks.flatMap((t) => [t.start_date, t.due_date]),
  ].filter((d): d is string => Boolean(d));

  const undatedTaskCount = tasks.filter((t) => !t.start_date && !t.due_date).length;

  if (allDates.length === 0) {
    return (
      <EmptyState message="No dates set yet — add a start/target date, a milestone due date, or task dates to see a timeline." />
    );
  }

  let rangeStartMs = Math.min(...allDates.map(toMs));
  let rangeEndMs = Math.max(...allDates.map(toMs));

  // A single-day or very short range would place every marker on top of
  // itself — pad both ends so the chart has room to actually show anything.
  const MIN_SPAN_MS = 14 * 86_400_000;
  if (rangeEndMs - rangeStartMs < MIN_SPAN_MS) {
    const mid = (rangeStartMs + rangeEndMs) / 2;
    rangeStartMs = mid - MIN_SPAN_MS / 2;
    rangeEndMs = mid + MIN_SPAN_MS / 2;
  }
  const span = rangeEndMs - rangeStartMs;

  const pct = (ms: number) =>
    Math.max(0, Math.min(100, ((ms - rangeStartMs) / span) * 100));

  const rows: Row[] = [
    ...milestones
      .filter((m) => m.due_date)
      .map((m): Row => ({
        id: `m-${m.id}`,
        label: m.name,
        colorVar: MILESTONE_COLOR[m.status],
        kind: "point",
        pct: pct(toMs(m.due_date!)),
      })),
    ...tasks
      .filter((t) => t.start_date || t.due_date)
      .map((t): Row => {
        const colorVar = TASK_COLOR[t.status];
        if (t.start_date && t.due_date) {
          const startPct = pct(toMs(t.start_date));
          const endPct = pct(toMs(t.due_date));
          return {
            id: `t-${t.id}`,
            label: t.title,
            colorVar,
            kind: "bar",
            startPct,
            // A same-day or reversed range still needs a visible sliver.
            widthPct: Math.max(1, endPct - startPct),
          };
        }
        return {
          id: `t-${t.id}`,
          label: t.title,
          colorVar,
          kind: "point",
          pct: pct(toMs((t.due_date ?? t.start_date)!)),
        };
      }),
  ].sort((a, b) => {
    const posA = a.kind === "point" ? a.pct : a.startPct;
    const posB = b.kind === "point" ? b.pct : b.startPct;
    return posA - posB;
  });

  const todayMs = toMs(todayISO());
  const showToday = todayMs >= rangeStartMs && todayMs <= rangeEndMs;
  const todayPct = showToday ? pct(todayMs) : null;

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = rangeStartMs + (span * i) / (tickCount - 1);
    return { pct: (i / (tickCount - 1)) * 100, label: formatDate(new Date(t)) };
  });

  const LEGEND: { label: string; colorVar: string }[] = [
    { label: "To do / pending", colorVar: "--muted" },
    { label: "In progress", colorVar: "--primary" },
    { label: "Blocked", colorVar: "--danger" },
    { label: "Done", colorVar: "--success" },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-4 text-xs text-muted">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: `var(${l.colorVar})` }}
              aria-hidden
            />
            {l.label}
          </span>
        ))}
      </div>

      <div className="flex min-w-[560px] gap-3 p-5">
        <div className="w-32 shrink-0 sm:w-40">
          <div className="h-6" />
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex h-9 items-center truncate text-xs"
              title={r.label}
            >
              {r.label}
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="relative h-6 border-b border-border">
            {ticks.map((t) => (
              <span
                key={t.pct}
                className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted"
                style={{ left: `${t.pct}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>

          {todayPct !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-primary/50"
              style={{ left: `${todayPct}%` }}
              aria-hidden
            />
          )}

          {rows.map((r) => (
            <div key={r.id} className="relative h-9 border-t border-border/60">
              {r.kind === "bar" ? (
                <div
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${r.startPct}%`,
                    width: `${r.widthPct}%`,
                    backgroundColor: `var(${r.colorVar})`,
                  }}
                />
              ) : (
                <div
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45"
                  style={{
                    left: `${r.pct}%`,
                    backgroundColor: `var(${r.colorVar})`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {undatedTaskCount > 0 && (
        <p className="px-5 pb-4 text-xs text-muted">
          {undatedTaskCount} task{undatedTaskCount === 1 ? "" : "s"} with no
          start or due date not shown here.
        </p>
      )}
    </div>
  );
}
