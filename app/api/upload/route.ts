import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { recordDocument } from "@/app/(app)/files/actions";
import {
  BUCKET,
  buildStoragePath,
  validateFile,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/storage";

/**
 * Receives a file upload and puts it in storage.
 *
 * Goes through the server rather than uploading straight from the browser so
 * validation happens in one place; storage RLS (0011_storage.sql) is the
 * real gate, keyed off the signed-in user's own workspace.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await requireRole("member");

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

  const rawProjectId = form.get("projectId");
  const projectId =
    typeof rawProjectId === "string" && rawProjectId.length > 0
      ? rawProjectId
      : null;

  const rawCategory = form.get("category");
  const category: DocumentCategory =
    typeof rawCategory === "string" &&
    DOCUMENT_CATEGORIES.includes(rawCategory as DocumentCategory)
      ? (rawCategory as DocumentCategory)
      : "other";

  // Checked again here, not just in the browser: the browser check is for a
  // fast message, this one is the actual limit.
  const check = validateFile(file);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const path = buildStoragePath(user.workspaceId, projectId, file.name);
  const storage = await createAuthClient();

  const { error: uploadError } = await storage.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const result = await recordDocument({
    project_id: projectId ?? "",
    file_name: file.name,
    storage_path: path,
    mime_type: file.type as Parameters<typeof recordDocument>[0]["mime_type"],
    size_bytes: file.size,
    category,
    description: "",
  });

  if (!result.ok) {
    // Do not leave bytes behind that no row points at.
    await storage.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fileName: file.name });
}
