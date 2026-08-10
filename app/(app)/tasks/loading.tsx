import { LoadingAnnouncement, Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading tasks" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-16 w-full" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2 p-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
