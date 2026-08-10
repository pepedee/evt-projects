import { LoadingAnnouncement, RowsSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading settings" />
      <Skeleton className="h-7 w-28" />
      <div className="rounded-2xl border border-border bg-surface">
        <RowsSkeleton rows={3} />
      </div>
      <div className="rounded-2xl border border-border bg-surface">
        <RowsSkeleton rows={4} />
      </div>
    </div>
  );
}
