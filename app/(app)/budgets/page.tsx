import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import { Card, EmptyState } from "@/components/ui/card";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Budgets · AI Project Tracker" };

/**
 * Cross-project budget overview.
 *
 * There is deliberately no grand total across projects: each project owns its
 * own currency, so summing the column would silently add THB to USD. Totals
 * live inside each project, where the unit is known.
 */
export default async function BudgetsPage() {
  const { rows } = await listProjects({ pageSize: 100 });
  const withBudget = rows.filter(
    (project) => project.planned_total > 0 || project.spent_total > 0,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <p className="mt-1 text-sm text-muted">
          Planned against actual, per project.
        </p>
      </header>

      {withBudget.length === 0 ? (
        <Card>
          <EmptyState message="No project has a budget yet. Add budget lines from a project." />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Project</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Planned</th>
                  <th className="px-5 py-3 text-right font-medium">Spent</th>
                  <th className="px-5 py-3 text-right font-medium">Variance</th>
                  <th className="px-5 py-3 text-right font-medium">Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {withBudget.map((project) => {
                  const used =
                    project.planned_total > 0
                      ? Math.round(
                          (project.spent_total / project.planned_total) * 100,
                        )
                      : null;

                  return (
                    <tr key={project.id}>
                      <td className="px-5 py-3">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium hover:underline"
                        >
                          {project.name}
                        </Link>
                        {project.spent_unassigned > 0 && (
                          <p className="text-xs text-danger">
                            {formatMoney(
                              project.spent_unassigned,
                              project.currency,
                            )}{" "}
                            unbudgeted
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <ProjectStatusBadge status={project.status} />
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatMoney(project.planned_total, project.currency)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {formatMoney(project.spent_total, project.currency)}
                      </td>
                      <td
                        className={
                          project.variance < 0
                            ? "px-5 py-3 text-right tabular-nums text-danger"
                            : "px-5 py-3 text-right tabular-nums text-success"
                        }
                      >
                        {formatMoney(project.variance, project.currency)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {used === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={used > 100 ? "text-danger" : undefined}>
                            {used}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
