import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { getProject, listMilestones } from "@/lib/db/projects";
import { listBudgetLines } from "@/lib/db/budgets";
import { listTasks } from "@/lib/db/tasks";
import { generateSummary } from "@/lib/ai/generate";
import { isAiConfigured } from "@/lib/ai/client";
import {
  buildProjectReport,
  packReport,
  reportFileName,
} from "@/lib/reports/word";

/**
 * Downloads a project report as a .docx.
 *
 * GET so it can be a plain link — the browser handles the download and there
 * is no client-side blob juggling. Nothing here mutates project data, so GET
 * is also the honest verb.
 */

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
  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const generatedAt = new Date();
  const fileName = reportFileName(project, generatedAt);

  try {
    const [milestones, tasks, budgetLines] = await Promise.all([
      listMilestones(projectId),
      listTasks({ projectId }),
      listBudgetLines(projectId),
    ]);

    // A failure to write prose must not cost the user their report, so the AI
    // sections are best-effort: on any error the document is built without
    // them rather than the download failing.
    let executiveSummary: string | null = null;
    let risks: string | null = null;

    if (wantsAi) {
      try {
        const [intro, risk] = await Promise.all([
          generateSummary(projectId, "report_intro", user.id),
          generateSummary(projectId, "risk_scan", user.id),
        ]);
        executiveSummary = intro?.content ?? null;
        risks = risk?.content ?? null;
      } catch (err) {
        console.error("report AI sections failed, continuing without", err);
      }
    }

    const doc = buildProjectReport({
      project,
      milestones,
      tasks,
      budgetLines,
      executiveSummary,
      risks,
      generatedBy: user.fullName,
      generatedAt,
    });

    const bytes = await packReport(doc);

    await recordJob(user, projectId, fileName, "completed", null);
    await logActivity(user, {
      entity: "project",
      entityId: projectId,
      action: "export",
      summary: `Generated Word report for ${project.name}`,
    });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        // The filename is derived from the project code/name and stripped to
        // [A-Za-z0-9._-], so it cannot break out of this header.
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordJob(user, projectId, fileName, "failed", message);
    console.error("word report failed", err);
    return NextResponse.json(
      { error: "Could not build the report." },
      { status: 500 },
    );
  }
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
      kind: "project_status",
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
