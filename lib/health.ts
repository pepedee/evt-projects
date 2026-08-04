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

/**
 * Health is computed here rather than stored, because it changes as dates pass
 * with no row being written — a stored column would quietly go stale. A human
 * can still overrule the arithmetic via health_override.
 */
export function deriveHealth(project: HealthInput): Health {
  if (project.health_override) return project.health_override;

  // A finished or abandoned project is not "at risk" of anything.
  if (project.status === "completed" || project.status === "cancelled") {
    return "on_track";
  }

  const overdueShare =
    project.task_total > 0 ? project.task_overdue / project.task_total : 0;

  if (overdueShare > OFF_TRACK_OVERDUE_SHARE) return "off_track";

  if (project.target_date) {
    const days = daysUntil(project.target_date);
    if (days < 0) return "off_track";
    if (days <= RUN_UP_DAYS && project.progress_pct < RUN_UP_MIN_PROGRESS) {
      return "at_risk";
    }
  }

  if (project.task_overdue > 0) return "at_risk";

  return "on_track";
}

export const HEALTH_LABEL: Record<Health, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};
