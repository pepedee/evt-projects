import { z } from "zod";
import { AI_MODEL, getAnthropic } from "@/lib/ai/client";

/**
 * Turns a quotation/scope-of-work PDF into a draft project.
 *
 * Uses forced tool-use rather than asking for JSON in prose: the result feeds
 * a review form directly, so it has to parse every time, not just usually.
 * Nothing here writes to the database — see createProjectFromImport in
 * app/(app)/projects/actions.ts for that. The user reviews and can edit
 * every field this returns before anything is saved.
 */

const importedBudgetLine = z.object({
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().nullable().default(null),
  planned_amount: z.number().nonnegative(),
});

const importedTask = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().nullable().default(null),
});

export const importedProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().nullable().default(null),
  client_name: z.string().trim().nullable().default(null),
  location: z.string().trim().nullable().default(null),
  // Coerced to null rather than failing the whole extraction if the model
  // returns something that isn't a clean ISO date — this field is a nice-to-
  // have the user can fill in by hand, not worth losing everything else over.
  quotation_date: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  description: z.string().trim().nullable().default(null),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase())
    .default("THB"),
  budget_lines: z.array(importedBudgetLine).default([]),
  tasks: z.array(importedTask).default([]),
});

export type ImportedProject = z.infer<typeof importedProjectSchema>;

const RECORD_PROJECT_TOOL = {
  name: "record_project",
  description:
    "Record the project extracted from the document, ready for a human to review.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description:
          "A short descriptive project name — combine the site/plant and the scope, not just the document's own title.",
      },
      code: {
        type: "string",
        description: "The document's own reference/quotation number, if printed.",
      },
      client_name: {
        type: "string",
        description:
          "Who is actually being billed (the vendor/customer field on the document) — not necessarily the end site owner if they differ.",
      },
      location: {
        type: "string",
        description: "The site name and/or address the work happens at.",
      },
      quotation_date: {
        type: "string",
        description:
          "The date printed on the document itself (issue date, not a due/validity date), as YYYY-MM-DD.",
      },
      description: {
        type: "string",
        description:
          "A paragraph covering scope, key terms (validity, payment terms, warranty), and dates — the same level of detail a person would write by hand after reading the document.",
      },
      currency: {
        type: "string",
        description: "3-letter currency code, e.g. THB or USD.",
      },
      budget_lines: {
        type: "array",
        description: "One entry per priced line item on the document.",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            description: { type: "string" },
            planned_amount: {
              type: "number",
              description: "The line's total price, before VAT, in the stated currency.",
            },
          },
          required: ["category", "planned_amount"],
        },
      },
      tasks: {
        type: "array",
        description: "One entry per distinct scope-of-work item.",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["title"],
        },
      },
    },
    required: ["name", "currency", "budget_lines", "tasks"],
  },
};

const SYSTEM_PROMPT = `
You extract structured project data from a quotation, purchase order, or
scope-of-work document for an industrial mechanical contractor (cooling
towers, tanks, structural repair and installation work).

Rules:
- Use only what is actually printed in the document. Never invent a figure,
  date, or name that is not there.
- Leave a field out entirely if the document does not state it, rather than
  guessing.
- budget_lines should mirror the document's own priced line items — do not
  invent a breakdown that is not on the page.
- tasks should mirror distinct scope-of-work items, not a re-statement of the
  budget lines.
`.trim();

export async function extractProjectFromPdf(
  base64Pdf: string,
): Promise<ImportedProject> {
  const response = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [RECORD_PROJECT_TOOL],
    tool_choice: { type: "tool", name: "record_project" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
          },
          {
            type: "text",
            text: "Extract this document into a draft project.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "record_project",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("The model did not return structured data for this document.");
  }

  const parsed = importedProjectSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(
      `Extracted data didn't match the expected shape: ${parsed.error.issues[0].message}`,
    );
  }
  return parsed.data;
}
