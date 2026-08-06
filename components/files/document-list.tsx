"use client";

import { useState, useTransition } from "react";
import { Download, FileText, Trash2 } from "lucide-react";
import { deleteDocument, getDocumentUrl } from "@/app/(app)/files/actions";
import { Notice } from "@/components/ui/form";
import { EmptyState, Badge } from "@/components/ui/card";
import { formatBytes, DOCUMENT_CATEGORY_LABEL } from "@/lib/storage";
import { formatDateTime } from "@/lib/format";
import type { DocumentRow } from "@/lib/db/documents";

export function DocumentList({
  documents,
  canDelete,
  showProject = false,
}: {
  documents: DocumentRow[];
  canDelete: boolean;
  showProject?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * The bucket is private, so a download is: ask the server to sign a URL,
   * then follow it. The link is valid for five minutes and is never rendered
   * into the page, so it cannot be scraped from the HTML.
   */
  function download(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await getDocumentUrl(id, true);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.url;
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteDocument(id);
      if (!result.ok) setError(result.error);
    });
  }

  if (documents.length === 0) {
    return <EmptyState message="No files yet." />;
  }

  return (
    <div>
      <div className="divide-y divide-border">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
            <FileText className="size-4 shrink-0 text-muted" />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{doc.file_name}</p>
                <Badge>{DOCUMENT_CATEGORY_LABEL[doc.category]}</Badge>
                {doc.version > 1 && <Badge>v{doc.version}</Badge>}
              </div>
              <p className="truncate text-xs text-muted">
                {showProject && doc.projects ? `${doc.projects.name} · ` : ""}
                {formatBytes(doc.size_bytes)} · {formatDateTime(doc.created_at)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => download(doc.id)}
              disabled={pending}
              aria-label={`Download ${doc.file_name}`}
              className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
            >
              <Download className="size-4" />
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => remove(doc.id)}
                disabled={pending}
                aria-label={`Delete ${doc.file_name}`}
                className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="px-5 py-3">
          <Notice>{error}</Notice>
        </div>
      )}
    </div>
  );
}
