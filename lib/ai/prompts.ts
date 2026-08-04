import type { Health, Priority, ProjectStatus, TaskStatus } from "@/lib/types";
import type { SummaryKind } from "@/lib/summaries";

/**
 * Prompt construction. Pure — no SDK, no database.
 *
 * The snapshot is the only thing the model ever sees. It is assembled by
 * lib/ai/summarize.ts from the same lib/db queries the screens use, so a
 * summary can never describe data the signed-in user is not allowed to read.
 */

export interface SnapshotTask {
  title: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  overdue: boolean;
}

export interface SnapshotMilestone {
  name: string;
  due_date: string | null;
  status: string;
}

export interface SnapshotBudgetLine {
  category: string;
  planned: number;
  spent: number;
}

export interface ProjectSnapshot {
  /** The date the snapshot was taken — the model has no clock of its own. */
  as_of: string;
  name: string;
  code: string | null;
  client: string | null;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  health: Health;
  health_is_manual: boolean;
  progress_pct: number;
  start_date: string | null;
  target_date: string | null;
  currency: string;
  task_total: number;
  task_done: number;
  task_open: number;
  task_overdue: number;
  task_blocked: number;
  planned_total: number;
  spent_total: number;
  spent_unassigned: number;
  milestones: SnapshotMilestone[];
  tasks: SnapshotTask[];
  budget_lines: SnapshotBudgetLine[];
}

const SHARED_RULES = `
You are summarising a project management record for the team running the work.

Rules:
- Use only the facts in the snapshot. If something is not in it, say it is not
  recorded rather than guessing. Never invent dates, names, or figures.
- Money is in the project's stated currency. Never convert it, and never add
  figures that do not share a currency.
- "Today" is the as_of date in the snapshot.
- Write plain prose for a busy reader. No preamble, no restating the question,
  no markdown headings unless asked for them.
- Lead with the thing the reader would ask for if they said "just the summary".
`.trim();

export const SYSTEM_PROMPT = SHARED_RULES;

interface PromptSpec {
  instruction: string;
  /** Deliberately small: these are summaries, not documents. */
  maxTokens: number;
  /**
   * Effort is the main cost lever. `medium` handles narrative summarising of a
   * snapshot well; the risk scan gets `high` because it has to reason about
   * dates and budget arithmetic rather than restate the record.
   */
  effort: "low" | "medium" | "high" | "xhigh" | "max";
}

const SPECS: Record<SummaryKind, PromptSpec> = {
  project_status: {
    instruction: `Write a status summary a stakeholder could read in under a minute.
Cover: where the project stands, what has been completed, what is outstanding,
and whether the budget and target date look achievable. Three short paragraphs
at most. State the health verdict and why it follows from the numbers.`,
    maxTokens: 16000,
    effort: "medium",
  },
  risk_scan: {
    instruction: `List what is going wrong or about to. Consider overdue tasks,
blocked tasks, the target date against current progress, budget lines that are
overspent, and money spent outside any budget line.
Give at most five risks, most serious first, each one line: the risk, then the
specific evidence from the snapshot. If nothing is wrong, say so in one sentence
and stop — do not manufacture risks to fill the list.`,
    maxTokens: 16000,
    effort: "high",
  },
  standup: {
    instruction: `Write a standup update: what is done, what is in progress,
what is blocked, and what is due next. Short bullet lines, no headings.
Name specific tasks rather than describing them in general terms.`,
    maxTokens: 16000,
    effort: "medium",
  },
  report_intro: {
    instruction: `Write an executive summary for the opening page of a written
report. Two paragraphs, complete sentences, no bullets and no markdown — this
text is inserted directly into a Word document. State the project's purpose and
current position, then its outlook on schedule and budget.`,
    maxTokens: 16000,
    effort: "medium",
  },
};

export function specFor(kind: SummaryKind): PromptSpec {
  return SPECS[kind];
}

export function buildUserPrompt(
  kind: SummaryKind,
  snapshot: ProjectSnapshot,
): string {
  return [
    specFor(kind).instruction,
    "",
    "Project snapshot:",
    "```json",
    JSON.stringify(snapshot, null, 2),
    "```",
  ].join("\n");
}

export type { SummaryKind };
