/**
 * Renders the Word report from fabricated data, without a database.
 *
 * buildProjectReport is pure — data in, Document out — so the layout can be
 * checked by opening the file, which is the only way to catch a broken table
 * or a section that renders empty. Run after any change to lib/reports/word.ts:
 *
 *   npm run report:preview
 *
 * The fixture deliberately includes the awkward cases: an overdue task, an
 * over-budget line, unbudgeted spend, and a project with no milestones.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildProjectReport,
  packReport,
  reportFileName,
} from "../lib/reports/word";
import type { Project, Milestone } from "../lib/db/projects";
import type { BudgetLine } from "../lib/db/budgets";
import type { TaskWithProject } from "../lib/tasks";

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const project: Project = {
  id: "11111111-1111-1111-1111-111111111111",
  workspace_id: "22222222-2222-2222-2222-222222222222",
  code: "CT-02",
  name: "Cooling Tower CT-02 pipe support remediation",
  description:
    "Replace corroded pipe supports on cooling tower CT-02 and re-certify the assembly.\n\nWork is staged around the plant shutdown window.",
  location: "Northern Refinery site, Rayong",
  quotation_date: day(-60),
  status: "active",
  priority: "high",
  health_override: null,
  progress_pct: 62,
  client_name: "Northern Refinery",
  currency: "THB",
  start_date: day(-45),
  target_date: day(-3), // already past, so health derives to off_track
  actual_end_date: null,
  owner_id: null,
  tags: ["shutdown", "structural"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
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
};

const milestones: Milestone[] = [
  {
    id: "m1",
    project_id: project.id,
    name: "Survey and load calculations signed off",
    description: null,
    due_date: day(-30),
    status: "done",
    sort_order: 0,
  },
  {
    id: "m2",
    project_id: project.id,
    name: "Supports fabricated",
    description: null,
    due_date: day(-7),
    status: "in_progress",
    sort_order: 1,
  },
  {
    id: "m3",
    project_id: project.id,
    name: "Re-certification issued",
    description: null,
    due_date: day(14),
    status: "pending",
    sort_order: 2,
  },
];

const task = (
  id: string,
  title: string,
  status: TaskWithProject["status"],
  priority: TaskWithProject["priority"],
  due: string | null,
): TaskWithProject => ({
  id,
  project_id: project.id,
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
  projects: { name: project.name, code: project.code, currency: project.currency },
});

const tasks: TaskWithProject[] = [
  task("t1", "Strip corroded supports on the north face", "done", "high", day(-20)),
  task("t2", "Fabricate replacement brackets", "in_progress", "critical", day(-5)),
  task("t3", "Await stainless stock from supplier", "blocked", "high", day(-2)),
  task("t4", "Re-torque and inspect", "todo", "medium", day(9)),
  task("t5", "Issue re-certification pack", "todo", "low", null),
];

const budgetLines: BudgetLine[] = [
  {
    id: "b1",
    project_id: project.id,
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
    project_id: project.id,
    category: "Labour",
    description: null,
    planned_amount: 220000,
    spent_total: 227000,
    expense_count: 4,
    sort_order: 1,
    variance: -7000,
  },
];

// Wrapped in main() rather than using top-level await: package.json has no
// "type": "module", so this file transpiles to CommonJS.
async function main() {
  const generatedAt = new Date();

  const doc = buildProjectReport({
    project,
    milestones,
    tasks,
    budgetLines,
    executiveSummary:
      "CT-02 remediation is materially complete on the structural scope but has passed its target date and is over budget.\n\nEight of thirteen tasks are finished. Fabrication is held by a stainless stock shortage, and spend has reached 130% of the approved budget, of which THB 42,500 sits outside any budget line.",
    risks:
      "Target date passed three days ago with five tasks open — evidence: target_date is in the past and task_open is 5.\nSpend is 130% of plan — evidence: spent_total 781,500 against planned_total 600,000.\nOne task is blocked on supplier stock — evidence: 'Await stainless stock from supplier' has status blocked.",
    generatedBy: "Preview fixture",
    generatedAt,
  });

  const out = path.resolve(
    process.argv[2] ??
      path.join(process.cwd(), reportFileName(project, generatedAt)),
  );

  const bytes = await packReport(doc);
  writeFileSync(out, Buffer.from(bytes));
  console.log(`Wrote ${out} (${bytes.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
