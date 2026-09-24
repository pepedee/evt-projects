import { z } from "zod";

/**
 * One row of an imported schedule, from either source (MS Project XML or a
 * PDF read by AI), before anything is saved. Deliberately source-neutral:
 * `progress` rather than a task or milestone status, because the reviewer
 * can flip an item between task and milestone and the two tables use
 * different status vocabularies — the mapping happens once, at save time.
 */

export type ScheduleItemKind = "task" | "milestone";
export type ScheduleProgress = "not_started" | "in_progress" | "done";

export interface DraftScheduleItem {
  kind: ScheduleItemKind;
  name: string;
  start_date: string | null;
  due_date: string | null;
  progress: ScheduleProgress;
  /** The summary/phase row this item sits under, if the source had one. */
  phase: string | null;
  /** Set by the parse route: an item with this name already exists here. */
  existing?: boolean;
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD")
  .nullable();

export const draftScheduleItemSchema = z
  .object({
    kind: z.enum(["task", "milestone"]),
    name: z.string().trim().min(1, "Every item needs a name").max(200),
    start_date: isoDate,
    due_date: isoDate,
    progress: z.enum(["not_started", "in_progress", "done"]),
    phase: z.string().trim().max(300).nullable(),
  })
  .refine((i) => !i.start_date || !i.due_date || i.start_date <= i.due_date, {
    message: "An item's start date is after its finish date",
  });

export function progressFromPercent(value: unknown): ScheduleProgress {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "not_started";
  return n >= 100 ? "done" : "in_progress";
}

/** "2026-01-05T08:00:00" -> "2026-01-05". Anything else -> null. */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const datePart = value.trim().split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}
