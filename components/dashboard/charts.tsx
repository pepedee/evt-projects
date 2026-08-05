import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { Project } from "@/lib/db/projects";

/**
 * Charts are plain HTML and CSS — no charting library.
 *
 * Both forms here are horizontal bars, which CSS draws exactly, so they render
 * on the server with no hydration and no client bundle. Marks follow the
 * dataviz spec: thin bars, 4px rounded data-end anchored square to the
 * baseline, recessive track, selective direct labels.
 *
 * Colour: --chart-1 is categorical slot 1, --chart-critical is the reserved
 * status step. Both validated against this app's surfaces in both modes.
 */

/**
 * Project progress.
 *
 * Nominal categories (project names) carrying one measure, so every bar takes
 * the same slot-1 hue and there is no legend — the title names the series.
 * Colouring these by value would spend the identity channel re-encoding what
 * bar length already shows.
 */
export function ProgressChart({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return <EmptyState message="No project has tasks yet." />;
  }

  return (
    <ul className="space-y-3 p-5">
      {projects.map((project) => (
        <li key={project.id}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            {/* min-w-0 is what makes `truncate` work: a flex child defaults
                to min-width:auto and refuses to shrink below its own text, so
                without it a long project name widens the row and the whole
                page scrolls sideways on a phone. */}
            <Link
              href={`/projects/${project.id}`}
              className="min-w-0 flex-1 truncate text-sm hover:underline"
            >
              {project.name}
            </Link>
            {/* Direct label: every bar is labelled, so the sub-3:1 relief
                rule is satisfied and no value depends on reading the fill. */}
            <span className="shrink-0 text-sm text-muted">
              {project.progress_pct}%
              <span className="ml-2 text-xs">
                {project.task_done}/{project.task_total}
              </span>
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-surface-2"
            role="img"
            aria-label={`${project.name}: ${project.progress_pct}% complete, ${project.task_done} of ${project.task_total} tasks done`}
          >
            <div
              className="h-full rounded-r-[4px] bg-[var(--chart-1)]"
              style={{ width: `${Math.max(project.progress_pct, 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Budget usage.
 *
 * A single ratio against a limit per project, so this is a meter, not a chart.
 * Over 100% the overflow is drawn in the reserved critical step and carries an
 * icon and the word "over" — a status colour never means anything on its own.
 */
export function BudgetMeters({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return <EmptyState message="No project has a budget yet." />;
  }

  return (
    <ul className="space-y-4 p-5">
      {projects.map((project) => {
        const used = Math.round(
          (project.spent_total / project.planned_total) * 100,
        );
        const over = project.spent_total > project.planned_total;

        // Under budget the track is the plan and the fill is the share used.
        //
        // Over budget there is no room left in the track, so its meaning
        // switches: the whole track becomes the total spent, split into the
        // part that was planned and the part that was not. The two shares are
        // computed against spend so they always sum to 100 — sizing them
        // 100 + overrun would make them flex children competing for a full
        // track, and they would silently shrink to fit, drawing 400% and 130%
        // almost identically. The percentage in the label carries the truth.
        const fill = over
          ? (project.planned_total / project.spent_total) * 100
          : used;
        const overflow = over ? 100 - fill : 0;

        return (
          <li key={project.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <Link
                href={`/projects/${project.id}`}
                // min-w-0 is what makes `truncate` work here: a flex child
              // defaults to min-width:auto and refuses to shrink below its
              // text, so without it a long project name widens the whole row
              // and the page scrolls sideways on a phone.
              className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {project.name}
              </Link>
              <span className="shrink-0 text-sm text-muted">
                {formatMoney(project.spent_total, project.currency)}
                <span className="mx-1">of</span>
                {formatMoney(project.planned_total, project.currency)}
              </span>
            </div>

            <div
              className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
              role="img"
              aria-label={`${project.name}: ${used}% of budget used${over ? ", over budget" : ""}`}
            >
              <div
                className="h-full shrink-0 rounded-r-[4px] bg-[var(--chart-1)]"
                style={{ width: `${fill}%` }}
              />
              {overflow > 0 && (
                <div
                  className="h-full shrink-0 rounded-r-[4px] bg-[var(--chart-critical)]"
                  style={{ width: `${overflow}%` }}
                />
              )}
            </div>

            <p className="mt-1 text-xs text-muted">
              {over ? (
                <span className="inline-flex items-center gap-1 text-[var(--chart-critical)]">
                  <AlertTriangle className="size-3" aria-hidden />
                  {used}% used — over budget
                </span>
              ) : (
                `${used}% used`
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
