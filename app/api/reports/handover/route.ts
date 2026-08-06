import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { imageSize } from "image-size";
import { createClient, createAuthClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { getProject } from "@/lib/db/projects";
import { listBudgetLines } from "@/lib/db/budgets";
import { listTasks } from "@/lib/db/tasks";
import { listDocuments } from "@/lib/db/documents";
import { generateSummary } from "@/lib/ai/generate";
import { isAiConfigured } from "@/lib/ai/client";
import { BUCKET } from "@/lib/storage";
import type { DocumentCategory } from "@/lib/storage";
import type { DocumentRow } from "@/lib/db/documents";
import {
  buildHandoverReport,
  packHandoverReport,
  reportFileName,
  type HandoverPhoto,
  type ImageType,
  type UnembeddablePhoto,
} from "@/lib/reports/handover";

/**
 * Downloads a project handover report as a .docx.
 *
 * GET so it can be a plain link — the browser handles the download, and
 * building a report changes nothing. See lib/reports/handover.ts for the
 * document itself; this route's only job is fetching the data (including
 * photo bytes from storage) that file needs to stay pure.
 */

const CONTRACTOR_NAME = "Evertech Cooling Co., Ltd.";
const MIME_TO_IMAGE_TYPE: Record<string, ImageType> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

const querySchema = z.object({
  projectId: z.string().uuid("Bad project id"),
  /** ?ai=0 skips the model entirely, for a faster or cheaper report. */
  ai: z.enum(["0", "1"]).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    projectId: request.nextUrl.searchParams.get("projectId") ?? undefined,
    ai: request.nextUrl.searchParams.get("ai") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { projectId } = parsed.data;
  const wantsAi = parsed.data.ai !== "0" && isAiConfigured();

  // RLS decides visibility: a project the user cannot read is a 404.
  const project = await getProject(projectId, user.workspaceId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const generatedAt = new Date();
  const fileName = reportFileName(project, generatedAt);

  try {
    const [tasks, budgetLines, documents] = await Promise.all([
      listTasks(user.workspaceId, { projectId }),
      listBudgetLines(projectId, user.workspaceId),
      listDocuments(user.workspaceId, { projectId }),
    ]);

    const completedTasks = tasks.filter(
      (t) => t.kind === "task" && t.status === "done",
    );
    const defectTasks = tasks.filter((t) => t.kind === "defect");

    const documentsByCategory: Partial<
      Record<Exclude<DocumentCategory, "photo">, DocumentRow[]>
    > = {};
    const photoDocs: DocumentRow[] = [];
    for (const doc of documents) {
      if (doc.category === "photo") photoDocs.push(doc);
      else {
        const key = doc.category as Exclude<DocumentCategory, "photo">;
        (documentsByCategory[key] ??= []).push(doc);
      }
    }

    const { photos, unembeddablePhotos } = await fetchPhotos(photoDocs);

    // A failure to write prose must not cost the user their report.
    let executiveSummary: string | null = null;
    if (wantsAi) {
      try {
        const summary = await generateSummary(
          projectId,
          "handover_summary",
          user.id,
          user.workspaceId,
        );
        executiveSummary = summary?.content ?? null;
      } catch (err) {
        console.error("handover report AI summary failed, continuing without", err);
      }
    }

    const doc = buildHandoverReport({
      project,
      contractor: CONTRACTOR_NAME,
      completedTasks,
      defectTasks,
      budgetLines,
      documentsByCategory,
      photos,
      unembeddablePhotos,
      executiveSummary,
      generatedBy: user.fullName,
      generatedAt,
    });

    const bytes = await packHandoverReport(doc);

    await recordJob(user, projectId, fileName, "completed", null);
    await logActivity(user, {
      entity: "project",
      entityId: projectId,
      action: "export",
      summary: `Generated handover report for ${project.name}`,
    });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJob(user, projectId, fileName, "failed", message);
    console.error("handover report failed", err);
    return NextResponse.json(
      { error: "Could not build the report." },
      { status: 500 },
    );
  }
}

/**
 * Downloads each photo's bytes and reads its real dimensions, so the doc
 * embeds them at a correct aspect ratio rather than stretched. Anything that
 * fails to download or isn't a docx-embeddable format (jpg/png/gif only —
 * notably not webp) is reported separately rather than dropped silently.
 */
async function fetchPhotos(
  docs: DocumentRow[],
): Promise<{ photos: HandoverPhoto[]; unembeddablePhotos: UnembeddablePhoto[] }> {
  const photos: HandoverPhoto[] = [];
  const unembeddablePhotos: UnembeddablePhoto[] = [];

  const imageType = (mime: string): ImageType | null => MIME_TO_IMAGE_TYPE[mime] ?? null;

  const storage = await createAuthClient();

  for (const doc of docs) {
    const type = imageType(doc.mime_type);
    if (!type) {
      unembeddablePhotos.push({
        fileName: doc.file_name,
        reason: `${doc.mime_type} can't be embedded in a Word document`,
      });
      continue;
    }

    const { data, error } = await storage.storage
      .from(BUCKET)
      .download(doc.storage_path);

    if (error || !data) {
      unembeddablePhotos.push({
        fileName: doc.file_name,
        reason: "could not be downloaded from storage",
      });
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const dims = imageSize(buffer);
    if (!dims.width || !dims.height) {
      unembeddablePhotos.push({
        fileName: doc.file_name,
        reason: "image dimensions could not be read",
      });
      continue;
    }

    photos.push({
      fileName: doc.file_name,
      caption: doc.description,
      data: buffer,
      width: dims.width,
      height: dims.height,
      type,
    });
  }

  return { photos, unembeddablePhotos };
}

/** Logging a report must never be the reason a report fails. */
async function recordJob(
  user: { id: string; workspaceId: string },
  projectId: string,
  fileName: string,
  status: "completed" | "failed",
  error: string | null,
): Promise<void> {
  try {
    const db = await createClient();
    await db.from("report_jobs").insert({
      workspace_id: user.workspaceId,
      project_id: projectId,
      kind: "handover",
      format: "docx",
      file_name: fileName,
      status,
      error,
      created_by: user.id,
    });
  } catch (err) {
    console.error("failed to record report job", err);
  }
}
