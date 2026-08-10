import {
  CardSkeleton,
  LoadingAnnouncement,
  RowsSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function ProjectDetailLoading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading project" />
      <div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-8 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/3" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-4 w-28" />
          </div>
          <RowsSkeleton rows={3} />
        </div>
      ))}
    </div>
  );
}
