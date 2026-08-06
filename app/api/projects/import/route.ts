import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { describeAiError, isAiConfigured } from "@/lib/ai/client";
import { extractProjectFromPdf } from "@/lib/ai/import";

/**
 * Reads an uploaded quotation/scope-of-work PDF and returns a draft project.
 *
 * Nothing is saved here — this only returns data for the review form to
 * pre-fill. The actual write happens in createProjectFromImport once the
 * user has reviewed (and possibly edited) what came back.
 */

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  await requireRole("member");

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI import is not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
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
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files can be imported right now." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That PDF is too large." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const draft = await extractProjectFromPdf(bytes.toString("base64"));
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    return NextResponse.json({ error: describeAiError(err) }, { status: 500 });
  }
}
