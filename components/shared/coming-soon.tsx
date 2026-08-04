import { Card, EmptyState } from "@/components/ui/card";

/**
 * Stands in for a module that has a sidebar entry but is not built yet, so
 * navigation never dead-ends on a 404. Delete each use as its phase lands.
 */
export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <EmptyState message={`Arrives in phase ${phase}. See TASKS.md.`} />
      </Card>
    </div>
  );
}
