"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAuthClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { BUCKET, ACCEPTED_MIME, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { fail, type ActionResult } from "@/lib/types";

/** How long a download link stays valid. Long enough to click, not to share. */
const SIGNED_URL_SECONDS = 300;

const documentSchema = z.object({
  project_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  file_name: z.string().trim().min(1).max(300),
  storage_path: z.string().trim().min(1),
  mime_type: z.enum(ACCEPTED_MIME),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  description: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

export type DocumentInput = z.input<typeof documentSchema>;

/**
 * Second half of the upload: the browser has already put the bytes in the
 * bucket, this records what they are.
 *
 * If this fails the caller deletes the object it just uploaded, so a rejected
 * upload does not leave an orphan blob behind.
 */
export async function recordDocument(
  input: DocumentInput,
): Promise<ActionResult> {
  try {
    const parsed = documentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    const values = parsed.data;

    const user = await requireRole("member");
    const db = await createClient();

    // Re-uploading the same name against the same project supersedes rather
    // than overwrites: the previous row stays, this one points back at it.
    // NULL project_id needs .is(), not .eq() — SQL equality against NULL is
    // never true, so .eq would silently match nothing and restart at v1.
    const previousQuery = db
      .from("documents")
      .select("id, version")
      .eq("file_name", values.file_name)
      .eq("workspace_id", user.workspaceId);

    const { data: previous } = await (
      values.project_id === null
        ? previousQuery.is("project_id", null)
        : previousQuery.eq("project_id", values.project_id)
    )
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; version: number }>();

    const { error } = await db.from("documents").insert({
      ...values,
      workspace_id: user.workspaceId,
      version: (previous?.version ?? 0) + 1,
      replaces_id: previous?.id ?? null,
      uploaded_by: user.id,
    });

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "document",
      entityId: values.project_id,
      action: "upload",
      summary: `Uploaded ${values.file_name}`,
    });

    revalidatePath("/files");
    if (values.project_id) revalidatePath(`/projects/${values.project_id}`);
    return { ok: true, message: "File uploaded." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * A short-lived signed URL. The bucket is private, so this is the only way to
 * read an object — there is no public URL to leak.
 */
export async function getDocumentUrl(
  id: string,
  download = false,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requireUser();
    const db = await createClient();

    // RLS decides whether this row is visible; if it is not, there is no path
    // to sign and the caller gets a plain not-found.
    const { data: doc, error } = await db
      .from("documents")
      .select("storage_path, file_name")
      .eq("id", id)
      .maybeSingle<{ storage_path: string; file_name: string }>();

    if (error) throw new Error(error.message);
    if (!doc) return { ok: false, error: "File not found." };

    // Storage lives in the default schema, so it needs the auth client.
    const storage = await createAuthClient();
    const { data, error: signError } = await storage.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS, {
        download: download ? doc.file_name : undefined,
      });

    if (signError) throw new Error(signError.message);
    return { ok: true, url: data.signedUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Remove the row first, then the object.
 *
 * If the object removal fails afterwards we are left with an unreferenced blob
 * — invisible, costing only storage. The other order would leave a row
 * pointing at bytes that no longer exist, which breaks the UI for everyone.
 */
export async function deleteDocument(id: string): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { data: doc } = await db
      .from("documents")
      .select("storage_path, file_name, project_id")
      .eq("id", id)
      .maybeSingle<{
        storage_path: string;
        file_name: string;
        project_id: string | null;
      }>();

    if (!doc) return { ok: false, error: "File not found." };

    const { error } = await db.from("documents").delete().eq("id", id);
    if (error) throw new Error(error.message);

    const storage = await createAuthClient();
    const { error: removeError } = await storage.storage
      .from(BUCKET)
      .remove([doc.storage_path]);

    if (removeError) {
      console.error("orphaned storage object", doc.storage_path, removeError);
    }

    await logActivity(user, {
      entity: "document",
      entityId: id,
      action: "delete",
      summary: `Deleted ${doc.file_name}`,
    });

    revalidatePath("/files");
    if (doc.project_id) revalidatePath(`/projects/${doc.project_id}`);
    return { ok: true, message: "File deleted." };
  } catch (err) {
    return fail(err);
  }
}
