import type { BudgetLine } from "@/lib/db/budgets";
import type { Milestone, Project } from "@/lib/db/projects";
import type { TaskWithProject } from "@/lib/tasks";

/**
 * Fixture data for the /demo route.
 *
 * Invented, not real: no database is touched and nothing here corresponds to a
 * live record. It exists so the UI can be reviewed while the Supabase project
 * is unreachable. Delete this folder to remove the route.
 *
 * The numbers are deliberately awkward — an overdue project, one over budget,
 * a blocked task, spend outside any budget line — because those are the states
 * a happy-path mockup hides.
 */

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const baseProject = {
  workspace_id: "demo-workspace",
  description: null,
  location: null,
  quotation_date: null,
  health_override: null,
  actual_end_date: null,
  owner_id: null,
  tags: [] as string[],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  task_overdue: 0,
  task_blocked: 0,
  spent_unassigned: 0,
};

export const projects: Project[] = [
  {
    ...baseProject,
    id: "p1",
    code: "CT-02",
    name: "Cooling Tower CT-02 pipe support remediation",
    description:
      "Replace corroded pipe supports on cooling tower CT-02 and re-certify the assembly. Work is staged around the plant shutdown window.",
    status: "active",
    priority: "high",
    progress_pct: 62,
    client_name: "Northern Refinery",
    currency: "THB",
    start_date: day(-45),
    target_date: day(-3),
    task_total: 13,
    task_done: 8,
    task_open: 5,
    task_overdue: 3,
    task_blocked: 1,
    health: "off_track",
    planned_total: 600000,
    spent_total: 781500,
    spent_unassigned: 42500,
    variance: -181500,
  },
  {
    ...baseProject,
    id: "p2",
    code: "YHB-01",
    name: "Yellow House Bakery fit-out",
    status: "active",
    priority: "medium",
    progress_pct: 40,
    client_name: "Yellow House",
    currency: "THB",
    start_date: day(-20),
    target_date: day(25),
    task_total: 10,
    task_done: 4,
    task_open: 6,
    health: "on_track",
    planned_total: 600000,
    spent_total: 420000,
    variance: 180000,
  },
  {
    ...baseProject,
    id: "p3",
    code: "GK-14",
    name: "Gunkul humid pack housing supply",
    status: "planning",
    priority: "critical",
    progress_pct: 8,
    client_name: "Gunkul",
    currency: "THB",
    start_date: day(-4),
    target_date: day(6),
    task_total: 12,
    task_done: 1,
    task_open: 11,
    task_overdue: 1,
    health: "at_risk",
    planned_total: 240000,
    spent_total: 61000,
    variance: 179000,
  },
];

export const milestones: Milestone[] = [
  {
    id: "m1",
    project_id: "p1",
    name: "Survey and load calculations signed off",
    description: null,
    due_date: day(-30),
    status: "done",
    sort_order: 0,
  },
  {
    id: "m2",
    project_id: "p1",
    name: "Supports fabricated",
    description: null,
    due_date: day(-7),
    status: "in_progress",
    sort_order: 1,
  },
  {
    id: "m3",
    project_id: "p1",
    name: "Re-certification issued",
    description: null,
    due_date: day(14),
    status: "pending",
    sort_order: 2,
  },
];

const mkTask = (
  id: string,
  projectId: string,
  projectName: string,
  title: string,
  status: TaskWithProject["status"],
  priority: TaskWithProject["priority"],
  due: string | null,
): TaskWithProject => ({
  id,
  project_id: projectId,
  milestone_id: null,
  title,
  description: null,
  status,
  priority,
  kind: "task",
  assignee_id: null,
  estimate_hours: null,
  spent_hours: 0,
  start_date: null,
  due_date: due,
  completed_at: status === "done" ? new Date().toISOString() : null,
  sort_order: 0,
  created_at: new Date().toISOString(),
  projects: { name: projectName, code: null, currency: "THB" },
});

const CT = "Cooling Tower CT-02";
const YH = "Yellow House Bakery fit-out";
const GK = "Gunkul humid pack housing";

export const tasks: TaskWithProject[] = [
  mkTask("t1", "p1", CT, "Strip corroded supports on the north face", "done", "high", day(-20)),
  mkTask("t2", "p1", CT, "Fabricate replacement brackets", "in_progress", "critical", day(-5)),
  mkTask("t3", "p1", CT, "Await stainless stock from supplier", "blocked", "high", day(-2)),
  mkTask("t4", "p1", CT, "Re-torque and inspect", "todo", "medium", day(9)),
  mkTask("t5", "p1", CT, "Issue re-certification pack", "todo", "low", null),
  mkTask("t6", "p2", YH, "Confirm counter dimensions with joiner", "done", "medium", day(-12)),
  mkTask("t7", "p2", YH, "Order oven and proofer", "in_progress", "high", day(3)),
  mkTask("t8", "p2", YH, "Electrical first fix", "todo", "medium", day(11)),
  mkTask("t9", "p3", GK, "Send drawings for approval", "in_progress", "critical", day(-1)),
  mkTask("t10", "p3", GK, "Quote housing fabrication", "todo", "high", day(4)),
];

export const budgetLines: BudgetLine[] = [
  {
    id: "b1",
    project_id: "p1",
    category: "Materials",
    description: "Stainless brackets and fixings",
    planned_amount: 380000,
    spent_total: 512000,
    expense_count: 6,
    sort_order: 0,
    variance: -132000,
  },
  {
    id: "b2",
    project_id: "p1",
    category: "Labour",
    description: null,
    planned_amount: 220000,
    spent_total: 227000,
    expense_count: 4,
    sort_order: 1,
    variance: -7000,
  },
];

export const upcoming = tasks.filter(
  (t) => t.due_date && t.status !== "done" && t.status !== "cancelled",
);

export const activity = [
  { id: 1, summary: 'Moved "Fabricate replacement brackets" to in_progress', at: "2 hours ago" },
  { id: 2, summary: "Recorded expense “Stainless sheet — batch 3”", at: "5 hours ago" },
  { id: 3, summary: "Generated status summary for Cooling Tower CT-02", at: "yesterday" },
  { id: 4, summary: "Uploaded CT-02_load_calcs_R2.pdf", at: "yesterday" },
  { id: 5, summary: "Added budget line “Labour”", at: "3 days ago" },
];

export const demoSummary = `Cooling Tower CT-02 remediation is materially complete on the structural scope but has passed its target date and is over budget.

Eight of thirteen tasks are finished. Fabrication is held by a stainless stock shortage, and spend has reached 130% of the approved budget — of which THB 42,500 sits outside any budget line. The re-certification milestone is still two weeks out and has not started.

The date has already slipped, so the decision now is whether to expedite stainless at a premium or re-baseline the target with the client.`;
