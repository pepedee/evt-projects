import { Document, ImageRun, Packer, Paragraph, Table } from "docx";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { TASK_STATUS_LABEL, type TaskWithProject } from "@/lib/tasks";
import type { DocumentCategory } from "@/lib/storage";
import type { BudgetLine } from "@/lib/db/budgets";
import type { Project } from "@/lib/db/projects";
import type { DocumentRow } from "@/lib/db/documents";
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
 * Builds the project handover / completion report as a Word document.
 *
 * A different document for a different reader than lib/reports/word.ts's
 * status report: this one goes to the client at close-out, structured around
 * what a construction handover package actually contains — scope delivered,
 * as-built drawings, acceptance sign-off, outstanding defects, warranties,
 * O&M manuals, and the final account. See TASKS.md phase 11.
 *
 * Photos are embedded inline (that's the point of a handover report — visual
 * proof of completed work). Other documents (drawings, certificates,
 * warranties, manuals) are listed by name rather than embedded: they are
 * usually PDFs, and "embedding" a whole PDF as an image is not meaningful.
 */

export type ImageType = "jpg" | "png" | "gif" | "bmp";

export interface HandoverPhoto {
  fileName: string;
  caption: string | null;
  data: Buffer;
  width: number;
  height: number;
  type: ImageType;
}

/** A photo whose bytes couldn't be embedded (unsupported format, fetch failure). */
export interface UnembeddablePhoto {
  fileName: string;
  reason: string;
}

export interface HandoverData {
  project: Project;
  contractor: string;
  /** kind === 'task', status === 'done'. */
  completedTasks: TaskWithProject[];
  /** kind === 'defect', any status. */
  defectTasks: TaskWithProject[];
  budgetLines: BudgetLine[];
  documentsByCategory: Partial<Record<Exclude<DocumentCategory, "photo">, DocumentRow[]>>;
  photos: HandoverPhoto[];
  unembeddablePhotos: UnembeddablePhoto[];
  /** AI-drafted overview/scope narrative. Omitted entirely when AI is not configured. */
  executiveSummary: string | null;
  generatedBy: string;
  generatedAt: Date;
}

export function reportFileName(project: Project, at: Date): string {
  return sharedReportFileName(project, "handover", at);
}

/** Scale to a max width, preserving aspect ratio, so photos don't overflow the page. */
const MAX_PHOTO_WIDTH = 500;
const MAX_PHOTO_HEIGHT = 650;

function fitPhoto(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(MAX_PHOTO_WIDTH / width, MAX_PHOTO_HEIGHT / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function documentListSection(
  title: string,
  docs: DocumentRow[] | undefined,
): (Paragraph | Table)[] {
  const rows = docs ?? [];
  return [
    h1(title),
    rows.length === 0
      ? para("None uploaded.", { italics: true })
      : table(
          ["File", "Uploaded", "Notes"],
          rows.map((d) => [
            d.file_name,
            formatDate(d.created_at),
            d.description ?? "—",
          ]),
        ),
  ];
}

export function buildHandoverReport(data: HandoverData): Document {
  const { project } = data;
  const children: (Paragraph | Table)[] = [
    ...coverPage(project, "Project Completion / Handover Report"),
  ];

  // ------------------------------------------------------- project overview
  children.push(
    h1("Project Overview"),
    table(
      ["Field", "Value"],
      [
        ["Project name", project.name],
        ["Location", project.location ?? "—"],
        ["Client", project.client_name ?? "—"],
        ["Contractor", data.contractor],
        ["Start date", formatDate(project.start_date)],
        [
          "Completion date",
          formatDate(project.actual_end_date ?? project.target_date),
        ],
      ],
    ),
  );
  if (data.executiveSummary) {
    children.push(...prose(data.executiveSummary));
  }

  // ------------------------------------------------------------ scope of work
  children.push(
    h1("Scope of Work"),
    para(
      "Summary of completed tasks and contractual obligations, drawn from the project record.",
      { italics: true },
    ),
  );
  children.push(
    data.completedTasks.length === 0
      ? para("No tasks are recorded as complete yet.", { italics: true })
      : table(
          ["Task", "Completed"],
          data.completedTasks.map((t) => [
            t.title,
            t.completed_at ? formatDate(t.completed_at) : "—",
          ]),
        ),
  );

  // ----------------------------------------------- as-built drawings, certs
  children.push(
    ...documentListSection(
      "As-Built Drawings and Specifications",
      data.documentsByCategory.as_built_drawing,
    ),
  );
  children.push(
    ...documentListSection(
      "Inspection and Acceptance Certificates",
      data.documentsByCategory.inspection_certificate,
    ),
  );

  // ------------------------------------------------------------- defects
  children.push(h1("Defect / Snag List and Rectification"));
  if (data.defectTasks.length === 0) {
    children.push(para("No defects recorded.", { italics: true }));
  } else {
    children.push(
      table(
        ["Item", "Status", "Notes"],
        data.defectTasks.map((t) => [
          t.title,
          t.status === "done" ? "Rectified" : "Open — " + TASK_STATUS_LABEL[t.status],
          t.description ?? "—",
        ]),
      ),
    );
  }

  // ----------------------------------------------------------- warranties
  children.push(
    ...documentListSection(
      "Warranties and Guarantees",
      data.documentsByCategory.warranty,
    ),
  );
  children.push(
    ...documentListSection(
      "Operation and Maintenance Manuals",
      data.documentsByCategory.om_manual,
    ),
  );

  // ------------------------------------------------------------- financial
  children.push(h1("Financial and Final Account Summary"));
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
    rows.push([
      "Total",
      money(project.planned_total),
      money(project.spent_total),
      money(project.variance),
    ]);
    children.push(table(["Category", "Contract sum", "Billed", "Variance"], rows));
    children.push(para(`All figures in ${project.currency}.`, { italics: true }));
  }

  // --------------------------------------------------------- photo appendix
  children.push(h1("Photo Record"));
  if (data.photos.length === 0 && data.unembeddablePhotos.length === 0) {
    children.push(para("No photos uploaded.", { italics: true }));
  } else {
    for (const photo of data.photos) {
      const { width, height } = fitPhoto(photo.width, photo.height);
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: photo.type,
              data: photo.data,
              transformation: { width, height },
            }),
          ],
        }),
        para(photo.caption ?? photo.fileName, { italics: true }),
      );
    }
    for (const skipped of data.unembeddablePhotos) {
      children.push(
        para(`${skipped.fileName} — not shown (${skipped.reason}); see Files tab.`, {
          italics: true,
        }),
      );
    }
  }

  // --------------------------------------------------------------- footer
  children.push(
    h2("About this report"),
    para(
      `Generated by ${data.generatedBy} on ${formatDateTime(data.generatedAt)} from the project record.` +
        (data.executiveSummary
          ? " The overview narrative was written by Claude from the same record and should be reviewed before circulation."
          : ""),
      { italics: true },
    ),
  );

  return new Document({ sections: [{ children }] });
}

export async function packHandoverReport(doc: Document): Promise<ArrayBuffer> {
  return Packer.toArrayBuffer(doc);
}
