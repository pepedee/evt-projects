"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button, Notice, Select } from "@/components/ui/form";
import {
  ACCEPT_ATTRIBUTE,
  validateFile,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  type DocumentCategory,
} from "@/lib/storage";

/**
 * Posts the file to /api/upload, which stores it and records the metadata.
 *
 * The category picked here decides which section of the handover report
 * (lib/reports/handover.ts) the file lands in — see 0014_handover_report.sql.
 * Uploads go through the server rather than straight to Supabase Storage so
 * validation and the category tag both happen in one place.
 */
export function UploadButton({
  projectId = null,
}: {
  /** Accepted for call-site compatibility; the server decides the workspace. */
  workspaceId?: string;
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

    const body = new FormData();
    body.set("file", file);
    body.set("category", category);
    if (projectId) body.set("projectId", projectId);

    try {
      const response = await fetch("/api/upload", { method: "POST", body });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? `Upload failed (${response.status})`);
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
