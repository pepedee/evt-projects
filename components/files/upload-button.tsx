"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createAuthClient } from "@/lib/supabase/client";
import { recordDocument } from "@/app/(app)/files/actions";
import { Button, Notice, Select } from "@/components/ui/form";
import {
  ACCEPT_ATTRIBUTE,
  validateFile,
  buildStoragePath,
  BUCKET,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  type DocumentCategory,
} from "@/lib/storage";

/**
 * Uploads straight from the browser to Supabase Storage, then calls
 * recordDocument to log the metadata — not a round trip through a Vercel
 * function. That used to be a POST to /api/upload, which proxied the file
 * bytes through a serverless function; Vercel's Node.js runtime caps a
 * function's request body at 4.5 MB regardless of what this app's own
 * 20 MB limit (lib/storage.ts, matching the bucket's file_size_limit) says,
 * so anything in between failed with a 413 the app's own validation never
 * even got a chance to reject cleanly. Storage RLS (0011_storage.sql) reads
 * workspace membership out of the object path exactly the same way whether
 * the request comes from the browser or a server — that boundary was never
 * the reason to proxy through the server in the first place.
 */
export function UploadButton({
  workspaceId,
  projectId = null,
}: {
  workspaceId: string;
  projectId?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<DocumentCategory>("photo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be picked again after a failure.
    event.target.value = "";
    if (!file) return;

    setError(null);

    const check = validateFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setBusy(true);

    const path = buildStoragePath(workspaceId, projectId, file.name);
    const supabase = createAuthClient();

    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        return;
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
        await supabase.storage.from(BUCKET).remove([path]);
        setError(result.error);
        return;
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        onChange={onPick}
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as DocumentCategory)}
          className="w-56"
          aria-label="Document category"
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        <Button type="button" busy={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          Upload file
        </Button>
      </div>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
