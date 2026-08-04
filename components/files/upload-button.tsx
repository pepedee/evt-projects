"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createAuthClient } from "@/lib/supabase/client";
import { recordDocument } from "@/app/(app)/files/actions";
import { Button, Notice } from "@/components/ui/form";
import {
  ACCEPT_ATTRIBUTE,
  BUCKET,
  buildStoragePath,
  validateFile,
} from "@/lib/storage";

/**
 * Uploading is two steps: the browser sends the bytes straight to storage
 * (so they never pass through the server), then a server action records the
 * metadata row.
 *
 * The failure that matters is step two failing after step one succeeded, which
 * would leave a blob nobody can see or delete. So the object is removed again
 * before the error is shown.
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
    const supabase = createAuthClient();
    const path = buildStoragePath(workspaceId, projectId, file.name);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setError(
        uploadError.message.includes("row-level security")
          ? "You do not have permission to upload to this workspace."
          : uploadError.message,
      );
      setBusy(false);
      return;
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
      await supabase.storage.from(BUCKET).remove([path]);
      setError(result.error);
      setBusy(false);
      return;
    }

    setBusy(false);
    router.refresh();
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
      <Button
        type="button"
        busy={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        Upload file
      </Button>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
