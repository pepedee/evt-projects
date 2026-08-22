import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listProjects, type Project } from "@/lib/db/projects";
import { Card, EmptyState } from "@/components/ui/card";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Budgets · AI Project Tracker" };

type SortKey = "name" | "status" | "planned" | "spent" | "variance" | "used";

const COLUMNS: { key: SortKey; label: string; align?: "right"; defaultDir: "asc" | "desc" }[] = [
  { key: "name", label: "Project", defaultDir: "asc" },
  { key: "status", label: "Status", defaultDir: "asc" },
  { key: "planned", label: "Planned", align: "right", defaultDir: "desc" },
  { key: "spent", label: "Spent", align: "right", defaultDir: "desc" },
  { key: "variance", label: "Variance", align: "right", defaultDir: "asc" },
  { key: "used", label: "Used", align: "right", defaultDir: "desc" },
];

function usedPct(project: Project): number | null {
  return project.planned_total > 0
    ? Math.round((project.spent_total / project.planned_total) * 100)
    : null;
}

function sortValue(project: Project, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return project.name.toLowerCase();
    case "status":
      return project.status;
    case "planned":
      return project.planned_total;
    case "spent":
      return project.spent_total;
    case "variance":
      return project.variance;
    case "used":
      return usedPct(project);
  }
}

/**
 * Cross-project budget overview.
 *
 * There is deliberately no grand total across projects: each project owns its
 * own currency, so summing the column would silently add THB to USD. Sorting
 * the money columns has the same limitation — Planned/Spent/Variance sort by
 * raw number, which only ranks correctly when every row shares a currency.
 * With one workspace-wide currency (the common case) that's exact; a mixed
 * workspace will see amounts ranked by number, not real value.
 */
export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const { rows } = await listProjects(user.workspaceId, { pageSize: 100 });
  const withBudget = rows.filter(
    (project) => project.planned_total > 0 || project.spent_total > 0,
  );

  const sortKey = COLUMNS.some((c) => c.key === params.sort)
    ? (params.sort as SortKey)
    : null;
  const sortDir = params.dir === "asc" ? "asc" : "desc";

  const sorted = sortKey
    ? [...withBudget].sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        // Nulls (no planned budget yet, so no "used" ratio) always sort last,
        // regardless of direction — there's no meaningful rank for "n/a".
        if (av === null) return bv === null ? 0 : 1;
        if (bv === null) return -1;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : withBudget;

  function sortHref(column: (typeof COLUMNS)[number]) {
    const nextDir =
      sortKey === column.key ? (sortDir === "asc" ? "desc" : "asc") : column.defaultDir;
    return `/budgets?sort=${column.key}&dir=${nextDir}`;
  }

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
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "px-5 py-3 font-medium",
                        column.align === "right" && "text-right",
                      )}
                    >
                      <Link
                        href={sortHref(column)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          column.align === "right" && "flex-row-reverse",
                          sortKey === column.key && "text-foreground",
                        )}
                      >
                        {column.label}
                        {sortKey === column.key &&
                          (sortDir === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden />
                          ))}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((project) => {
                  const used = usedPct(project);

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
