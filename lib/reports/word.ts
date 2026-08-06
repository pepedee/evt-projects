import { Document, Packer, Paragraph, Table } from "docx";
import { formatDate, formatMoney } from "@/lib/format";
import { HEALTH_LABEL } from "@/lib/health";
import { TASK_STATUS_LABEL, isOverdue, type TaskWithProject } from "@/lib/tasks";
import type { BudgetLine } from "@/lib/db/budgets";
import type { Milestone, Project } from "@/lib/db/projects";
import {
  coverPage,
  h1,
  h2,
  para,
  prose,
  table,
  reportFileName as sharedReportFileName,
} from "@/lib/reports/shared";

/**
 * Builds the project status report as a Word document.
 *
 * Generated from code rather than filled into a template: there is no .docx
 * asset to keep in sync, and the section list is visible right here.
 * Everything printed comes from the caller's data — nothing is fetched or
 * invented in this file, which keeps it pure and easy to eyeball.
 *
 * This is the "how's it going" report. For the end-of-project completion
 * document (as-built drawings, certificates, defects, warranties, O&M
 * manuals, photos), see lib/reports/handover.ts — a different document for a
 * different reader, not a variant of this one.
 */

export interface ReportData {
  project: Project;
  milestones: Milestone[];
  tasks: TaskWithProject[];
  budgetLines: BudgetLine[];
  /** AI executive summary. Omitted entirely when AI is not configured. */
  executiveSummary: string | null;
  /** AI risk scan. Omitted entirely when AI is not configured. */
  risks: string | null;
  generatedBy: string;
  generatedAt: Date;
}

export function reportFileName(project: Project, at: Date): string {
  return sharedReportFileName(project, "report", at);
}

export function buildProjectReport(data: ReportData): Document {
  const { project } = data;
  const children: (Paragraph | Table)[] = [...coverPage(project)];

  // -------------------------------------------------------------- summary
  if (data.executiveSummary) {
    children.push(h1("Executive summary"), ...prose(data.executiveSummary));
  }

  if (project.description) {
    children.push(h1("Background"), ...prose(project.description));
  }

  // --------------------------------------------------------------- status
  children.push(
    h1("Status"),
    table(
      ["Field", "Value"],
      [
        ["Status", project.status.replace("_", " ")],
        ["Priority", project.priority],
        [
          "Health",
          HEALTH_LABEL[project.health] +
            (project.health_override ? " (set manually)" : ""),
        ],
        ["Progress", `${project.progress_pct}%`],
        ["Tasks complete", `${project.task_done} of ${project.task_total}`],
        ["Overdue tasks", String(project.task_overdue)],
        ["Start date", formatDate(project.start_date)],
        ["Target date", formatDate(project.target_date)],
      ],
    ),
  );

  // ----------------------------------------------------------- milestones
  children.push(h1("Milestones"));
  children.push(
    data.milestones.length === 0
      ? para("No milestones recorded.", { italics: true })
      : table(
          ["Milestone", "Due", "Status"],
          data.milestones.map((m) => [
            m.name,
            formatDate(m.due_date),
            m.status.replace("_", " "),
          ]),
        ),
  );

  // ---------------------------------------------------------------- tasks
  const openTasks = data.tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );

  children.push(h1("Outstanding work"));
  children.push(
    openTasks.length === 0
      ? para("No outstanding tasks.", { italics: true })
      : table(
          ["Task", "Status", "Priority", "Due"],
          openTasks.map((t) => [
            t.title,
            TASK_STATUS_LABEL[t.status],
            t.priority,
            t.due_date
              ? formatDate(t.due_date) + (isOverdue(t) ? " (overdue)" : "")
              : "—",
          ]),
        ),
  );

  // --------------------------------------------------------------- budget
  children.push(h1("Budget"));
  if (data.budgetLines.length === 0 && project.planned_total === 0) {
    children.push(para("No budget recorded.", { italics: true }));
  } else {
    const money = (n: number) => formatMoney(n, project.currency);

    const rows = data.budgetLines.map((line) => [
      line.category,
      money(line.planned_amount),
      money(line.spent_total),
      money(line.variance),
    ]);

    // Unbudgeted spend is real money against no plan — never fold it silently
    // into the total.
    if (project.spent_unassigned > 0) {
      rows.push([
        "Unbudgeted",
        "—",
        money(project.spent_unassigned),
        money(-project.spent_unassigned),
      ]);
    }

    rows.push([
      "Total",
      money(project.planned_total),
      money(project.spent_total),
      money(project.variance),
    ]);

    children.push(table(["Category", "Planned", "Spent", "Variance"], rows));
    children.push(
      para(`All figures in ${project.currency}.`, { italics: true }),
    );
  }

  // ---------------------------------------------------------------- risks
  if (data.risks) {
    children.push(h1("Risks"), ...prose(data.risks));
  }

  // --------------------------------------------------------------- footer
  children.push(
    h2("About this report"),
    para(
      `Generated by ${data.generatedBy} on ${formatDate(data.generatedAt)} from the project record. ` +
        (data.executiveSummary || data.risks
          ? "The executive summary and risk sections were written by Claude from the same record and should be reviewed before circulation."
          : ""),
      { italics: true },
    ),
  );

  return new Document({ sections: [{ children }] });
}

/** ArrayBuffer rather than Buffer — it hands straight to a web Response. */
export async function packReport(doc: Document): Promise<ArrayBuffer> {
  return Packer.toArrayBuffer(doc);
}
