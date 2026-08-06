import {
  AlignmentType,
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Project } from "@/lib/db/projects";

/**
 * Word-building blocks shared by every report type (lib/reports/word.ts,
 * lib/reports/handover.ts). Kept tiny and generic on purpose — nothing here
 * knows what a project or a task is.
 */

export const SPACING = { before: 240, after: 120 };

export function h1(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: SPACING });
}

export function h2(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: SPACING });
}

export function para(
  text: string,
  options: { italics?: boolean; bold?: boolean } = {},
): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, italics: options.italics, bold: options.bold })],
  });
}

/** Model prose arrives as plain text; keep its paragraph breaks. */
export function prose(text: string): Paragraph[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  return blocks.length > 0 ? blocks.map((block) => para(block)) : [para("—")];
}

export function cell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({ children: [new TextRun({ text: text || "—", bold })] }),
    ],
  });
}

export function table(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map((h) => cell(h, true)) }),
      ...rows.map((row) => new TableRow({ children: row.map((v) => cell(v)) })),
    ],
  });
}

export function coverPage(project: Project, subtitle?: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { after: 60 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: project.name, bold: true, size: 40 })],
    }),
    new Paragraph({
      spacing: { after: 360 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text:
            subtitle ??
            [project.code, project.client_name].filter(Boolean).join(" · ") ??
            "Project report",
          italics: true,
        }),
      ],
    }),
  ];
}

/** `{code-or-name}_{suffix}_{yyyy-mm-dd}.docx`, stripped to a safe filename. */
export function reportFileName(
  project: Pick<Project, "code" | "name">,
  suffix: string,
  at: Date,
): string {
  const stamp = at.toISOString().slice(0, 10);
  const base = (project.code || project.name)
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 60);
  return `${base}_${suffix}_${stamp}.docx`;
}
