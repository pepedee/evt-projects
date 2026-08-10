import {
  CardSkeleton,
  LoadingAnnouncement,
  RowsSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading dashboard" />
      <div>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <Skeleton className="h-4 w-32" />
            </div>
            <RowsSkeleton rows={3} />
          </div>
        ))}
      </div>
    </div>
  );
}
