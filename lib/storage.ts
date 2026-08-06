/**
 * The storage seam.
 *
 * Everything the app knows about where bytes live is in this file. Swapping
 * Supabase Storage for S3 or R2 later means rewriting this and nothing else.
 *
 * Client-safe: pure constants and functions, no server imports.
 */

export const BUCKET = "project-files";

/** Must stay in step with file_size_limit in 0011_storage.sql. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Must stay in step with allowed_mime_types in 0011_storage.sql. */
export const ACCEPTED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/zip",
] as const;

/** For the file input's accept attribute. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_MIME.join(",");

/**
 * What a document is *for*, in handover-report terms. Drives which report
 * section it lands in — see lib/reports/handover.ts. Must stay in step with
 * the check constraint added in 0014_handover_report.sql.
 */
export const DOCUMENT_CATEGORIES = [
  "photo",
  "as_built_drawing",
  "inspection_certificate",
  "warranty",
  "om_manual",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  photo: "Photo",
  as_built_drawing: "As-built drawing",
  inspection_certificate: "Inspection / acceptance certificate",
  warranty: "Warranty / guarantee",
  om_manual: "O&M manual",
  other: "Other",
};

/**
 * Reduce a filename to an object key that is safe everywhere.
 *
 * The allowlist is the security boundary: anything outside [A-Za-z0-9._-]
 * becomes an underscore, which covers path separators, control characters,
 * spaces and non-ASCII in a single pass. Leading dots are stripped so nothing
 * is hidden and ".." can never survive to walk a path.
 *
 * This flattens Thai and other non-Latin filenames. That is fine: the original
 * is stored verbatim in documents.file_name and is what the UI shows. Only the
 * storage key is romanised.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : "file";
}

/**
 * {workspace}/{project|general}/{timestamp}-{name}
 *
 * The workspace must be the first segment: the storage RLS policies in
 * 0011_storage.sql read it from there to decide who may touch the object.
 */
export function buildStoragePath(
  workspaceId: string,
  projectId: string | null,
  fileName: string,
): string {
  const scope = projectId ?? "general";
  return `${workspaceId}/${scope}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

export interface FileRejection {
  ok: false;
  error: string;
}

/** Checked in the browser for a fast, clear message; the bucket enforces it too. */
export function validateFile(file: File): { ok: true } | FileRejection {
  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `${formatBytes(file.size)} is over the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`,
    };
  }
  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
    return {
      ok: false,
      error: `${file.type || "That file type"} is not accepted.`,
    };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
