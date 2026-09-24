import { createClient } from "@/lib/supabase/server";
import { listProjects, type Project } from "@/lib/db/projects";
import { needsAttention } from "@/lib/health";
import { today, type TaskWithProject } from "@/lib/tasks";

/** How far ahead the "what's coming" list looks. */
const UPCOMING_DAYS = 14;

export interface ActivityEntry {
  id: number;
  entity: string;
  action: string;
  summary: string | null;
  created_at: string;
}

export interface DashboardData {
  activeProjects: number;
  openTasks: number;
  overdueTasks: number;
  atRiskProjects: number;
  /** Every live project with at least one task, most complete first. */
  progress: Project[];
  upcoming: TaskWithProject[];
  activity: ActivityEntry[];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getDashboard(workspaceId: string): Promise<DashboardData> {
  const db = await createClient();
  const now = today();

  // One pass over projects covers the counts and the progress chart —
  // project_overview already carries every aggregate.
  const { rows: projects } = await listProjects(workspaceId, { pageSize: 200 });

  // Lost quotations are out too: their tasks and budgets will never move.
  const live = projects.filter(
    (p) =>
      p.status !== "completed" && p.status !== "cancelled" && p.po_status !== "lost",
  );

  const [upcomingResult, activityResult] = await Promise.all([
    db
      .from("tasks")
      .select(
        "id, project_id, milestone_id, title, description, status, priority, " +
          "assignee_id, estimate_hours, spent_hours, start_date, due_date, " +
          "completed_at, sort_order, created_at, projects(name, code, currency)",
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .not("status", "in", "(done,cancelled)")
      .not("due_date", "is", null)
      .lte("due_date", addDays(now, UPCOMING_DAYS))
      .order("due_date")
      .limit(12)
      .returns<TaskWithProject[]>(),

    db
      .from("activity_logs")
      .select("id, entity, action, summary, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<ActivityEntry[]>(),
  ]);

  if (upcomingResult.error) throw new Error(upcomingResult.error.message);
  if (activityResult.error) throw new Error(activityResult.error.message);

  return {
    activeProjects: projects.filter((p) => p.status === "active").length,
    openTasks: live.reduce((sum, p) => sum + p.task_open, 0),
    overdueTasks: live.reduce((sum, p) => sum + p.task_overdue, 0),
    atRiskProjects: projects.filter(needsAttention).length,
    progress: live
      .filter((p) => p.task_total > 0)
      .sort((a, b) => b.progress_pct - a.progress_pct),
    upcoming: upcomingResult.data ?? [],
    activity: activityResult.data ?? [],
  };
}
