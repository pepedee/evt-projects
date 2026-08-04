import { requireUser } from "@/lib/auth";
import { Card, EmptyState } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/types";

export const metadata = { title: "Dashboard · AI Project Tracker" };

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Welcome back, {user.fullName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {user.workspaceName} · signed in as {ROLE_LABEL[user.role]}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Active projects", "Open tasks", "Overdue", "Budget used"].map(
          (label) => (
            <Card key={label} className="p-5">
              <p className="text-sm text-muted">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">—</p>
            </Card>
          ),
        )}
      </div>

      <Card
        title="Recent activity"
        description="Every create, update and delete lands here."
      >
        <EmptyState message="Nothing yet. Charts and activity arrive in phase 7." />
      </Card>
    </div>
  );
}
