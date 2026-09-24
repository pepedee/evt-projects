import type { Health, ProjectStatus } from "@/lib/types";

/** Days before the target date that a project starts being scrutinised. */
const RUN_UP_DAYS = 7;

/** Share of open tasks overdue that tips a project from at risk to off track. */
const OFF_TRACK_OVERDUE_SHARE = 0.25;

/** Progress a project should have reached by the time it enters the run-up. */
const RUN_UP_MIN_PROGRESS = 80;

export interface HealthInput {
  status: ProjectStatus;
  target_date: string | null;
  progress_pct: number;
  task_total: number;
  task_overdue: number;
  health_override: Health | null;
}

function daysUntil(date: string): number {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round(
    (startOfDay(new Date(date)) - startOfDay(new Date())) / 86_400_000,
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Health is computed here rather than stored, because it changes as dates pass
 * with no row being written — a stored column would quietly go stale. A human
 * can still overrule the arithmetic via health_override.
 *
 * Returns the reason alongside the verdict, from the same branch that decided
 * it, so the explanation shown to a person can never disagree with the rule.
 */
export function assessHealth(project: HealthInput): {
  health: Health;
  reason: string | null;
} {
  if (project.health_override) {
    return {
      health: project.health_override,
      reason:
        project.health_override === "on_track"
          ? null
          : `Set to ${HEALTH_LABEL[project.health_override]} manually`,
    };
  }

  // A finished or abandoned project is not "at risk" of anything.
  if (project.status === "completed" || project.status === "cancelled") {
    return { health: "on_track", reason: null };
  }

  const overdueShare =
    project.task_total > 0 ? project.task_overdue / project.task_total : 0;

  if (overdueShare > OFF_TRACK_OVERDUE_SHARE) {
    return {
      health: "off_track",
      reason: `${project.task_overdue} of ${project.task_total} tasks overdue`,
    };
  }

  if (project.target_date) {
    const days = daysUntil(project.target_date);
    if (days < 0) {
      return {
        health: "off_track",
        reason: `Target date passed ${plural(-days, "day")} ago`,
      };
    }
    if (days <= RUN_UP_DAYS && project.progress_pct < RUN_UP_MIN_PROGRESS) {
      return {
        health: "at_risk",
        reason: `Target date ${days === 0 ? "is today" : `in ${plural(days, "day")}`}, only ${project.progress_pct}% done`,
      };
    }
  }

  if (project.task_overdue > 0) {
    return { health: "at_risk", reason: `${plural(project.task_overdue, "task")} overdue` };
  }

  return { health: "on_track", reason: null };
}

export function deriveHealth(project: HealthInput): Health {
  return assessHealth(project).health;
}

/**
 * The one definition of "needing attention" — the dashboard tile counts
 * with it and the Projects page filters with it, so the number on the tile
 * and the list it opens can't disagree.
 */
export function needsAttention(project: { status: ProjectStatus; health: Health }): boolean {
  return (
    project.health !== "on_track" &&
    project.status !== "completed" &&
    project.status !== "cancelled"
  );
}

export const HEALTH_LABEL: Record<Health, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};
