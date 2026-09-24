import { XMLParser } from "fast-xml-parser";
import {
  progressFromPercent,
  toDateOnly,
  type DraftScheduleItem,
} from "@/lib/import/schedule";

/**
 * Reads MS Project's "Save As > XML" export (the documented MSPDI schema —
 * not the native .mpp binary, which has no reliable parser for this stack).
 * Deterministic, no AI involved — this format is plain, well-documented XML,
 * unlike a PDF export where the layout has to be interpreted.
 *
 * Summary rows (phases) are not emitted as items: they have no work of their
 * own, and this app derives progress from real tasks. Their names are kept as
 * each child's `phase` instead, so the grouping isn't lost.
 */

interface RawTask {
  Name?: unknown;
  Start?: unknown;
  Finish?: unknown;
  Milestone?: unknown;
  Summary?: unknown;
  PercentComplete?: unknown;
  OutlineLevel?: unknown;
  Active?: unknown;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

/** True for both the numeric 1 fast-xml-parser produces and a literal "1". */
function isFlagSet(value: unknown): boolean {
  return value === 1 || value === "1" || value === true;
}

export function parseMsProjectXml(xml: string): DraftScheduleItem[] {
  const parser = new XMLParser({
    // Only Task repeats meaningfully here; forcing it to always parse as an
    // array means the code below never has to special-case "just one task".
    isArray: (name) => name === "Task",
  });

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new Error("That file isn't valid XML.");
  }

  const project = (doc as { Project?: { Tasks?: { Task?: RawTask[] } } })?.Project;
  const tasks = project?.Tasks?.Task;
  if (!Array.isArray(tasks)) {
    throw new Error(
      "No <Project><Tasks> found — is this really an MS Project XML export (File > Save As > XML), not the native .mpp file?",
    );
  }

  // summaryAt[n] = name of the most recent summary row at outline level n+1.
  // MSPDI lists tasks in outline order, so the current ancestors of any row
  // are exactly the entries above its own level.
  const summaryAt: string[] = [];
  const items: DraftScheduleItem[] = [];

  for (const task of tasks) {
    const level = Number(task.OutlineLevel ?? 1);
    // Level 0 is the project's own summary row, not a phase.
    if (level === 0) continue;
    // Inactive tasks are ones the planner switched off; they aren't the plan.
    if (task.Active !== undefined && !isFlagSet(task.Active)) continue;

    const name = asString(task.Name)?.trim();
    summaryAt.length = Math.max(0, level - 1);
    if (!name) continue;

    if (isFlagSet(task.Summary)) {
      summaryAt[level - 1] = name;
      continue;
    }

    const phase = summaryAt.filter(Boolean).join(" › ").slice(0, 300) || null;
    const start = toDateOnly(asString(task.Start));
    const finish = toDateOnly(asString(task.Finish));

    if (isFlagSet(task.Milestone)) {
      items.push({
        kind: "milestone",
        name: name.slice(0, 200),
        start_date: null,
        due_date: finish ?? start,
        progress: progressFromPercent(task.PercentComplete),
        phase,
      });
    } else {
      items.push({
        kind: "task",
        name: name.slice(0, 200),
        start_date: start,
        due_date: finish,
        progress: progressFromPercent(task.PercentComplete),
        phase,
      });
    }
  }

  return items;
}
