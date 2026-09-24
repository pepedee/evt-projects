import { NextResponse } from "next/server";
import { can, requireUser } from "@/lib/auth";
import { describeAiError, isAiConfigured } from "@/lib/ai/client";
import { extractScheduleFromPdf } from "@/lib/ai/schedule";
import { getProject } from "@/lib/db/projects";
import { parseMsProjectXml } from "@/lib/import/msproject";
import type { DraftScheduleItem } from "@/lib/import/schedule";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads an uploaded schedule — an MS Project "Save As > XML" export or a PDF
 * — and returns draft tasks/milestones for the review screen. Nothing is
 * saved here; importSchedule does that once the person has reviewed.
 *
 * A route handler rather than a server action because server actions cap
 * request bodies at 1MB by default, and a real MSPDI export (resources,
 * calendars and assignments all ride along) passes that easily. Vercel's own
 * 4.5MB function body limit still applies — the upload component checks for
 * that before sending, since Vercel rejects an oversized body before this
 * code ever runs.
 */

// A long schedule PDF can take the model a minute or more to read.
export const maxDuration = 300;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/schedule">,
): Promise<Response> {
  const user = await requireUser();
  if (!can(user, "member")) {
    return NextResponse.json({ error: "Your role can't import schedules." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const project = await getProject(id, user.workspaceId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than 4MB." }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  let items: DraftScheduleItem[];
  let source: "msproject" | "pdf" | null = null;

  try {
    if (name.endsWith(".xml") || file.type.includes("xml")) {
      source = "msproject";
      items = parseMsProjectXml(await file.text());
    } else if (name.endsWith(".pdf") || file.type === "application/pdf") {
      if (!isAiConfigured()) {
        return NextResponse.json(
          { error: "Reading PDFs needs AI, which isn't configured. Set ANTHROPIC_API_KEY." },
          { status: 503 },
        );
      }
      source = "pdf";
      const bytes = Buffer.from(await file.arrayBuffer());
      items = await extractScheduleFromPdf(bytes.toString("base64"));
    } else if (name.endsWith(".mpp")) {
      return NextResponse.json(
        {
          error:
            "The native .mpp file can't be read directly. In MS Project use File > Save As > XML (or print the Gantt chart to PDF) and upload that.",
        },
        { status: 400 },
      );
    } else {
      return NextResponse.json(
        { error: "Upload an MS Project XML export or a PDF." },
        { status: 400 },
      );
    }
  } catch (err) {
    if (source === "pdf") {
      return NextResponse.json({ error: describeAiError(err) }, { status: 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No tasks or milestones were found in that file." },
      { status: 400 },
    );
  }

  // Flag rows that already exist in this project so the review screen can
  // leave them unticked — re-importing an updated plan shouldn't double up.
  const db = await createClient();
  const [{ data: tasks }, { data: milestones }] = await Promise.all([
    db
      .from("tasks")
      .select("title")
      .eq("project_id", id)
      .eq("workspace_id", user.workspaceId)
      .is("deleted_at", null),
    db
      .from("milestones")
      .select("name")
      .eq("project_id", id)
      .eq("workspace_id", user.workspaceId),
  ]);
  const key = (s: string) => s.trim().toLowerCase();
  const existingTasks = new Set((tasks ?? []).map((t) => key(t.title)));
  const existingMilestones = new Set((milestones ?? []).map((m) => key(m.name)));

  for (const item of items) {
    item.existing =
      item.kind === "task"
        ? existingTasks.has(key(item.name))
        : existingMilestones.has(key(item.name));
  }

  return NextResponse.json({ ok: true, source, items });
}
