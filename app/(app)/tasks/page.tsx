import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { listTasks } from "@/lib/db/tasks";
import { Card, EmptyState } from "@/components/ui/card";
import { FilterBar } from "@/components/shared/filter-bar";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { cn } from "@/lib/utils";
import type { Priority, TaskStatus } from "@/lib/types";

export const metadata = { title: "Tasks · AI Project Tracker" };

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const single = (key: string) =>
    (Array.isArray(params[key]) ? params[key][0] : params[key]) ?? undefined;

  const view = single("view") === "list" ? "list" : "board";
  const overdueOnly = single("overdue") === "1";

  const tasks = await listTasks({
    search: single("q"),
    status: single("status") as TaskStatus | "all" | undefined,
    priority: single("priority") as Priority | "all" | undefined,
    overdueOnly,
  });

  const canEdit = can(user, "member");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="mt-1 text-sm text-muted">
            {tasks.length} across every project
          </p>
        </div>

        <div className="flex rounded-lg border border-border p-0.5">
          <ViewTab href="/tasks?view=board" active={view === "board"} label="Board" />
          <ViewTab href="/tasks?view=list" active={view === "list"} label="List" />
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <FilterBar
          basePath="/tasks"
          searchPlaceholder="Task title"
          selects={[
            { name: "status", label: "Status", options: STATUS_OPTIONS },
            { name: "priority", label: "Priority", options: PRIORITY_OPTIONS },
          ]}
        />
        <Link
          href={overdueOnly ? "/tasks" : "/tasks?overdue=1"}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm transition",
            overdueOnly
              ? "border-danger text-danger"
              : "border-border text-muted hover:bg-surface-2",
          )}
        >
          Overdue only
        </Link>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <EmptyState message="No tasks match these filters. Add tasks from a project." />
        </Card>
      ) : view === "board" ? (
        <TaskBoard tasks={tasks} canEdit={canEdit} />
      ) : (
        <Card>
          <TaskList
            tasks={tasks}
            canEdit={canEdit}
            canDelete={can(user, "admin")}
            showProject
          />
        </Card>
      )}
    </div>
  );
}

function ViewTab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2",
      )}
    >
      {label}
    </Link>
  );
}
