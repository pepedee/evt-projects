import { z } from "zod";
import { AI_MODEL, getAnthropic } from "@/lib/ai/client";
import {
  progressFromPercent,
  toDateOnly,
  type DraftScheduleItem,
} from "@/lib/import/schedule";

/**
 * Turns a schedule PDF (a Gantt chart printout, a "Project Plan" table, an
 * MS Project "Print to PDF") into draft tasks and milestones.
 *
 * Forced tool-use, like lib/ai/import.ts: the result feeds a review list
 * directly, so it has to parse every time. Nothing is written here — the
 * person reviews every row first, and importSchedule saves only what they
 * keep. Dates the model can't read cleanly come back as null rather than
 * failing the whole extraction; a missing date is fixable in the review,
 * a failed import is not.
 */

const extractedItem = z.object({
  kind: z.enum(["task", "milestone"]).catch("task"),
  name: z.string().trim().min(1),
  start_date: z.string().nullish(),
  due_date: z.string().nullish(),
  percent_complete: z.number().nullish(),
  phase: z.string().trim().nullish(),
});

const extractedSchedule = z.object({
  items: z.array(z.unknown()).default([]),
});

const RECORD_SCHEDULE_TOOL = {
  name: "record_schedule",
  description:
    "Record every scheduled work item and milestone found in the document, ready for a human to review.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        description: "One entry per scheduled row, in the order they appear.",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["task", "milestone"],
              description:
                "milestone for a zero-duration checkpoint (a diamond marker, a single date, or a row the document itself calls a milestone); task for anything with duration.",
            },
            name: { type: "string", description: "The row's name exactly as printed." },
            start_date: {
              type: "string",
              description: "Start date as YYYY-MM-DD, Gregorian (CE) year.",
            },
            due_date: {
              type: "string",
              description:
                "Finish/end date as YYYY-MM-DD, Gregorian (CE) year. For a milestone, its date.",
            },
            percent_complete: {
              type: "number",
              description: "0-100, only if the document states it.",
            },
            phase: {
              type: "string",
              description:
                "The summary/phase/group heading this row sits under, if any.",
            },
          },
          required: ["kind", "name"],
        },
      },
    },
    required: ["items"],
  },
};

const SYSTEM_PROMPT = `
You extract a project schedule from a document for an industrial mechanical
contractor in Thailand (cooling towers, tanks, structural repair and
installation work). The document may be a Gantt chart, a project plan table,
or an MS Project printout, in English or Thai.

Rules:
- Use only what is actually printed. Never invent a row, date, or percentage.
- Summary/phase/group heading rows are NOT items themselves — record their
  name as the "phase" of the rows beneath them instead. A row with indented
  rows beneath it is a heading even if it shows its own dates or duration
  (MS Project prints summary rows in bold); the project-title row at the top
  is not a phase at all.
- Dates: output YYYY-MM-DD with a Gregorian (CE) year. Thai documents often
  use the Buddhist Era (e.g. 2569) — subtract 543 (2569 -> 2026). Numeric
  dates like 05/03/26 are day/month/year unless the document clearly uses
  another order.
- If a row's dates can only be read off bar positions on a chart axis, read
  them as precisely as the axis allows. If a date truly can't be determined,
  leave it out rather than guessing.
- Skip header rows, legends, totals, signatures, and page furniture.
`.trim();

export async function extractScheduleFromPdf(
  base64Pdf: string,
): Promise<DraftScheduleItem[]> {
  const response = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    tools: [RECORD_SCHEDULE_TOOL],
    tool_choice: { type: "tool", name: "record_schedule" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
          },
          { type: "text", text: "Extract this document's schedule." },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "record_schedule",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model did not return a schedule for this document.");
  }

  const parsed = extractedSchedule.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error("The extracted schedule wasn't in the expected shape.");
  }

  // Validate row by row so one malformed row is dropped, not the whole file.
  const items: DraftScheduleItem[] = [];
  for (const raw of parsed.data.items) {
    const row = extractedItem.safeParse(raw);
    if (!row.success) continue;
    const { kind, name, start_date, due_date, percent_complete, phase } = row.data;

    let start = toDateOnly(start_date);
    let due = toDateOnly(due_date);
    if (kind === "milestone") {
      due = due ?? start;
      start = null;
    } else if (start && due && start > due) {
      [start, due] = [due, start];
    }

    items.push({
      kind,
      name: name.slice(0, 200),
      start_date: start,
      due_date: due,
      progress: progressFromPercent(percent_complete),
      phase: phase ? phase.slice(0, 300) : null,
    });
  }
  return items;
}
