import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { recordDocument } from "@/app/(app)/files/actions";
import { BUCKET, buildStoragePath, validateFile } from "@/lib/storage";
import { SHARED_WORKSPACE_ID } from "@/lib/auth";

/**
 * Receives a file upload and puts it in storage.
 *
 * This used to happen straight from the browser to Supabase Storage, which
 * needed a key in the page. With authentication removed the only key is the
 * service-role key, which must never leave the server — so the bytes come here
 * first and the server does the upload.
 *
 * The trade is that uploads now pass through the app rather than going direct;
 * at a 20 MB cap that is fine.
 */
export async function POST(request: Request): Promise<Response> {
  // Always passes while the app is open, but kept so restoring authentication
  // means restoring the check in lib/auth.ts rather than finding this again.
  await requireRole("member");

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

  // Checked again here, not just in the browser: the browser check is for a
  // fast message, this one is the actual limit.
  const check = validateFile(file);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const path = buildStoragePath(SHARED_WORKSPACE_ID, projectId, file.name);
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
    description: "",
  });

  if (!result.ok) {
    // Do not leave bytes behind that no row points at.
    await storage.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fileName: file.name });
}
