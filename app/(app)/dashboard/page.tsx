import Link from "next/link";
import { FolderKanban, ListChecks, AlertTriangle, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/db/dashboard";
import { listPaymentsDue } from "@/lib/db/payments";
import { isPaymentOverdue, PAYMENT_STATUS_LABEL } from "@/lib/payments";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BudgetMeters } from "@/components/dashboard/charts";
import { ProgressFilter } from "@/components/dashboard/progress-filter";
import { PriorityBadge } from "@/components/shared/status-badge";
import { isOverdue } from "@/lib/tasks";
import { formatDateTime, formatMoney, formatRelativeDays } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/types";

export const metadata = { title: "Dashboard · AI Project Tracker" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [data, paymentsDue] = await Promise.all([
    getDashboard(user.workspaceId),
    listPaymentsDue(user.workspaceId),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Welcome back, {user.fullName}</h1>
        <p className="mt-1 text-sm text-muted">
          {user.workspaceName} · signed in as {ROLE_LABEL[user.role]}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Active projects"
          value={data.activeProjects}
          href="/projects?status=active"
          icon={FolderKanban}
          accent="primary"
        />
        <StatTile
          label="Open tasks"
          value={data.openTasks}
          href="/tasks"
          icon={ListChecks}
          accent="info"
        />
        <StatTile
          label="Overdue"
          value={data.overdueTasks}
          href="/tasks?overdue=1"
          tone={data.overdueTasks > 0 ? "critical" : undefined}
          icon={AlertTriangle}
          accent="danger"
        />
        <StatTile
          label="Needing attention"
          value={data.atRiskProjects}
          hint="At risk or off track"
          href="/projects?health=attention"
          tone={data.atRiskProjects > 0 ? "critical" : undefined}
          icon={ShieldAlert}
          accent="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Project progress"
          description="Share of tasks done, computed by the database."
        >
          <ProgressFilter projects={data.progress} />
        </Card>

        <Card
          title="Budget usage"
          description="Spent against planned, per project."
        >
          <BudgetMeters projects={data.budgets} />
        </Card>
      </div>

      <Card
        title="Payments due"
        description="Unpaid instalments that are overdue or due in the next 30 days."
      >
        {paymentsDue.length === 0 ? (
          <EmptyState message="Nothing to collect in the next 30 days." />
        ) : (
          <ul className="divide-y divide-border">
            {paymentsDue.map((term) => {
              const overdue = isPaymentOverdue(term);
              return (
                <li key={term.id}>
                  <Link
                    href={`/projects/${term.project_id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {term.projects?.code ? `${term.projects.code} · ` : ""}
                        {term.label}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {term.projects?.name ?? "—"}
                        {term.status === "invoiced" &&
                          ` · ${PAYMENT_STATUS_LABEL.invoiced}${term.invoice_no ? ` ${term.invoice_no}` : ""}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(term.amount, term.projects?.currency ?? "THB")}
                      </p>
                      {overdue ? (
                        <Badge tone="danger">{formatRelativeDays(term.due_date)}</Badge>
                      ) : (
                        <p className="text-xs text-muted">{formatRelativeDays(term.due_date)}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Due soon"
          description="Overdue and due in the next two weeks."
        >
          {data.upcoming.length === 0 ? (
            <EmptyState message="Nothing due in the next two weeks." />
          ) : (
            <ul className="divide-y divide-border">
              {data.upcoming.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {task.title}
                      </p>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <p className="truncate text-xs text-muted">
                      {task.projects?.name ?? "—"}
                    </p>
                  </div>
                  <span
                    className={
                      isOverdue(task)
                        ? "shrink-0 text-xs text-[var(--chart-critical)]"
                        : "shrink-0 text-xs text-muted"
                    }
                  >
                    {formatRelativeDays(task.due_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent activity"
          description="Every create, update and delete, in order."
        >
          {data.activity.length === 0 ? (
            <EmptyState message="Nothing has happened yet." />
          ) : (
            <ul className="divide-y divide-border">
              {data.activity.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <p className="text-sm">
                    {entry.summary ?? `${entry.action} ${entry.entity}`}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-center text-xs text-muted">
        <Link href="/projects" className="hover:underline">
          See all projects
        </Link>
      </p>
    </div>
  );
}
