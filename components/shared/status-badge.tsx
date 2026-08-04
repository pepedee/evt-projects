import { Badge } from "@/components/ui/card";
import { HEALTH_LABEL } from "@/lib/health";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/tasks";
import type { Health, Priority, ProjectStatus, TaskStatus } from "@/lib/types";

type Tone = "neutral" | "success" | "warning" | "danger" | "primary";

const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planning: { label: "Planning", tone: "neutral" },
  active: { label: "Active", tone: "primary" },
  on_hold: { label: "On hold", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  todo: "neutral",
  in_progress: "primary",
  blocked: "danger",
  done: "success",
  cancelled: "neutral",
};

const PRIORITY_TONE: Record<Priority, Tone> = {
  low: "neutral",
  medium: "neutral",
  high: "warning",
  critical: "danger",
};

const HEALTH_TONE: Record<Health, Tone> = {
  on_track: "success",
  at_risk: "warning",
  off_track: "danger",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, tone } = PROJECT_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={TASK_STATUS_TONE[status]}>{TASK_STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  // Low and medium are the common case; badging them adds noise, not signal.
  if (priority === "low" || priority === "medium") return null;
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function HealthBadge({ health }: { health: Health }) {
  return <Badge tone={HEALTH_TONE[health]}>{HEALTH_LABEL[health]}</Badge>;
}

/** Thin bar used in project lists and headers. */
export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
