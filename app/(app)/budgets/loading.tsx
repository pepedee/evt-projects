import { LoadingAnnouncement, RowsSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function BudgetsLoading() {
  return (
    <div className="space-y-6">
      <LoadingAnnouncement label="Loading budgets" />
      <Skeleton className="h-7 w-32" />
      <div className="rounded-2xl border border-border bg-surface">
        <RowsSkeleton rows={6} />
      </div>
    </div>
  );
}
