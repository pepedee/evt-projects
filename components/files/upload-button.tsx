"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button, Notice } from "@/components/ui/form";
import { ACCEPT_ATTRIBUTE, validateFile } from "@/lib/storage";

/**
 * Posts the file to /api/upload, which stores it and records the metadata.
 *
 * The browser no longer talks to Supabase Storage directly — with
 * authentication removed the only credential is the service-role key, and that
 * cannot be exposed to a page. The size and type check below is only for a
 * fast, clear message; the route and the bucket both enforce the real limits.
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
      <Button type="button" busy={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" />
        Upload file
      </Button>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
