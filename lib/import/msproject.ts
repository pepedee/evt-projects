import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { MilestoneStatus } from "@/lib/types";

/**
 * Reads MS Project's "Save As > XML" export (the documented MSPDI schema —
 * not the native .mpp binary, which has no reliable parser for this stack)
 * and pulls out just the milestones: tasks with <Milestone>1</Milestone>.
 * Deterministic, no AI involved — this format is plain, well-documented XML,
 * unlike a PDF export where the layout has to be interpreted.
 */

export interface DraftMilestone {
  name: string;
  due_date: string | null;
  status: MilestoneStatus;
}

export const draftMilestoneSchema = z.object({
  name: z.string().trim().min(1).max(200),
  due_date: z.string().trim().nullable(),
  status: z.enum(["pending", "in_progress", "done"]),
});

interface RawTask {
  Name?: unknown;
  Start?: unknown;
  Finish?: unknown;
  Milestone?: unknown;
  Summary?: unknown;
  PercentComplete?: unknown;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

/** "2026-01-05T08:00:00" -> "2026-01-05". Already-bare dates pass through. */
function toDateOnly(value: string | undefined): string | null {
  if (!value) return null;
  const datePart = value.split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

function statusFromPercentComplete(value: unknown): MilestoneStatus {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "pending";
  return n >= 100 ? "done" : "in_progress";
}

/** True for both the numeric 1 fast-xml-parser produces and a literal "1". */
function isFlagSet(value: unknown): boolean {
  return value === 1 || value === "1" || value === true;
}

export function parseMsProjectXml(xml: string): DraftMilestone[] {
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

  const milestones: DraftMilestone[] = [];
  for (const task of tasks) {
    if (!isFlagSet(task.Milestone) || isFlagSet(task.Summary)) continue;

    const name = asString(task.Name)?.trim();
    if (!name) continue;

    milestones.push({
      name,
      due_date: toDateOnly(asString(task.Finish) ?? asString(task.Start)),
      status: statusFromPercentComplete(task.PercentComplete),
    });
  }

  return milestones;
}
