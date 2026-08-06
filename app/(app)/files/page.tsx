import { can, requireUser } from "@/lib/auth";
import { listDocuments } from "@/lib/db/documents";
import { Card } from "@/components/ui/card";
import { FilterBar } from "@/components/shared/filter-bar";
import { UploadButton } from "@/components/files/upload-button";
import { DocumentList } from "@/components/files/document-list";
import { formatBytes, MAX_UPLOAD_BYTES } from "@/lib/storage";

export const metadata = { title: "Files · AI Project Tracker" };

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const search = Array.isArray(params.q) ? params.q[0] : params.q;
  const documents = await listDocuments(user.workspaceId, { search });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Files</h1>
          <p className="mt-1 text-sm text-muted">
            Private storage. Downloads use links that expire after five minutes.
            Up to {formatBytes(MAX_UPLOAD_BYTES)} per file.
          </p>
        </div>
        {can(user, "member") && (
          <UploadButton workspaceId={user.workspaceId} />
        )}
      </header>

      <FilterBar basePath="/files" searchPlaceholder="File name" />

      <Card>
        <DocumentList
          documents={documents}
          canDelete={can(user, "admin")}
          showProject
        />
      </Card>
    </div>
  );
}
