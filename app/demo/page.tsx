import Link from "next/link";
import {
  Sparkles,
  FolderKanban,
  ListChecks,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BudgetMeters, ProgressChart } from "@/components/dashboard/charts";
import {
  HealthBadge,
  PriorityBadge,
  ProgressBar,
  ProjectStatusBadge,
} from "@/components/shared/status-badge";
import { TaskBoard } from "@/components/tasks/task-board";
import { BudgetLines } from "@/components/budgets/budget-lines";
import { isOverdue } from "@/lib/tasks";
import { formatDate, formatMoney, formatRelativeDays } from "@/lib/format";
import {
  activity,
  budgetLines,
  demoSummary,
  milestones,
  projects,
  tasks,
  upcoming,
} from "./fixtures";

export const metadata = { title: "Demo · AI Project Tracker" };

// Forces per-request rendering instead of the default static prerender.
// fixtures.ts computes several dates as an offset from `new Date()` at
// module-evaluation time — fine for a single request, but a *statically*
// prerendered page evaluates that module once at build time and bakes the
// result into the HTML, while the client bundle re-evaluates the same
// module (with a fresh `new Date()`) during hydration. Any real time
// elapsed between build and a visitor loading the page — which for a
// rarely-deployed fallback page can be weeks — made the two disagree,
// producing a genuine, reproducible hydration mismatch (React error #418)
// on every load. Confirmed live in production 2026-09-15, weeks after the
// last deploy. Forcing dynamic rendering makes both evaluations happen
// within the same request, so there's nothing left to disagree about.
export const dynamic = "force-dynamic";

/**
 * UI showcase, built from fixture data in ./fixtures.ts.
 *
 * Exists so the interface can be reviewed while the database is unreachable
 * (see AGENTS.md's Supabase auto-pause note — this page needs no database at
 * all). Every component here is the real one the app uses — only the data is
 * invented. Interactive controls are rendered read-only (`canEdit={false}`)
 * because their server actions would need a database.
 *
 * `proxy.ts` explicitly exempts this path via `PUBLIC_PATHS`, so it's
 * reachable without signing in even though auth is otherwise required
 * everywhere. To remove: delete this folder and drop it from `PUBLIC_PATHS`.
 */
export default function DemoPage() {
  const ct = projects[0];

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <header className="rounded-2xl border border-warning/40 bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warning">Demo</Badge>
          <h1 className="text-xl font-semibold">AI Project Tracker — UI preview</h1>
        </div>
        <p className="mt-2 text-sm text-muted">
          Real components, invented data. No database is involved, so nothing
          here is editable and none of these projects exist. The live app needs
          a Supabase connection.
        </p>
        <p className="mt-2 text-sm text-muted">
          <Link href="/dashboard" className="text-primary hover:underline">
            Go to the live app →
          </Link>
        </p>
      </header>

      {/* ------------------------------------------------------ dashboard */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Dashboard</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Active projects"
            value={2}
            icon={FolderKanban}
            accent="primary"
          />
          <StatTile
            label="Open tasks"
            value={22}
            icon={ListChecks}
            accent="info"
          />
          <StatTile
            label="Overdue"
            value={4}
            tone="critical"
            icon={AlertTriangle}
            accent="danger"
          />
          <StatTile
            label="Needing attention"
            value={2}
            hint="At risk or off track"
            tone="critical"
            icon={ShieldAlert}
            accent="warning"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Project progress"
            description="Share of tasks done, computed by the database."
          >
            <ProgressChart projects={projects} />
          </Card>

          <Card
            title="Budget usage"
            description="Spent against planned, per project."
          >
            <BudgetMeters projects={projects} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Due soon" description="Overdue and due in the next two weeks.">
            <ul className="divide-y divide-border">
              {upcoming.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <p className="truncate text-xs text-muted">
                      {task.projects?.name}
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
          </Card>

          <Card title="Recent activity" description="Every create, update and delete.">
            <ul className="divide-y divide-border">
              {activity.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <p className="text-sm">{entry.summary}</p>
                  <p className="text-xs text-muted">{entry.at}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* -------------------------------------------------------- projects */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id} className="h-full p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{project.name}</h3>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {project.code ? `${project.code} · ` : ""}
                    {project.client_name}
                  </p>
                </div>
                <HealthBadge health={project.health} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <PriorityBadge priority={project.priority} />
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span>
                    {project.task_done}/{project.task_total} tasks
                    {project.task_overdue > 0 && ` · ${project.task_overdue} overdue`}
                  </span>
                  <span className="tabular-nums">{project.progress_pct}%</span>
                </div>
                <ProgressBar value={project.progress_pct} />
              </div>

              <p className="mt-3 text-xs text-muted">
                Target {formatDate(project.target_date)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- project detail */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Project detail — {ct.code}</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm text-muted">Budget planned</p>
            <p className="mt-2 text-2xl font-semibold">
              {formatMoney(ct.planned_total, ct.currency)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">Spent</p>
            <p className="mt-2 text-2xl font-semibold">
              {formatMoney(ct.spent_total, ct.currency)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">Variance</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--chart-critical)]">
              {formatMoney(ct.variance, ct.currency)}
            </p>
          </Card>
        </div>

        <Card
          title="AI summary"
          description="Written from the project's own record. Read-only — it never changes anything."
        >
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary">
                Status summary
              </span>
              {["Risk scan", "Standup update", "Executive summary"].map((label) => (
                <span
                  key={label}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted"
                >
                  {label}
                </span>
              ))}
              <Badge tone="neutral">Cached</Badge>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {demoSummary}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted">
              <Sparkles className="size-3.5" />
              Example output. The real panel streams this as it is written.
            </p>
          </div>
        </Card>

        <Card title="Milestones" description="The checkpoints this project is measured against.">
          <div className="divide-y divide-border">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted">Due {formatDate(m.due_date)}</p>
                </div>
                <Badge
                  tone={
                    m.status === "done"
                      ? "success"
                      : m.status === "in_progress"
                        ? "primary"
                        : "neutral"
                  }
                >
                  {m.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Budget" description={`Planned against actual, all in ${ct.currency}.`}>
          <BudgetLines
            projectId={ct.id}
            currency={ct.currency}
            lines={budgetLines}
            spentUnassigned={ct.spent_unassigned}
            canEdit={false}
            canDelete={false}
          />
        </Card>

        <Card title="Files" description="Private storage with links that expire after five minutes.">
          <EmptyState message="File uploads need a live storage bucket, so this is empty in the demo." />
        </Card>
      </section>

      {/* ----------------------------------------------------------- tasks */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Tasks — board</h2>
        <TaskBoard tasks={tasks} canEdit={false} />
      </section>

      <footer className="border-t border-border pt-6 text-center text-xs text-muted">
        Demo page — fixture data only. Delete <code>app/demo/</code> to remove it.
      </footer>
    </main>
  );
}
