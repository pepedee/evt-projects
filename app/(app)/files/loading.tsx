import { LoadingAnnouncement, RowsSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function FilesLoading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading files" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-16 w-full" />
      <div className="rounded-2xl border border-border bg-surface">
        <RowsSkeleton rows={6} />
      </div>
    </div>
  );
}
