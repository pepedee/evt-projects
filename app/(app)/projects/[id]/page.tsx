import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { getProject, listMilestones } from "@/lib/db/projects";
import { listTasks } from "@/lib/db/tasks";
import { Card } from "@/components/ui/card";
import {
  HealthBadge,
  PriorityBadge,
  ProgressBar,
  ProjectStatusBadge,
} from "@/components/shared/status-badge";
import { MilestoneList } from "@/components/projects/milestone-list";
import { TaskList } from "@/components/tasks/task-list";
import { ArchiveProjectButton } from "@/components/projects/archive-button";
import { formatDate } from "@/lib/format";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const project = await getProject(id);
  if (!project) notFound();

  const [milestones, tasks] = await Promise.all([
    listMilestones(id),
    listTasks({ projectId: id }),
  ]);

  const canEdit = can(user, "member");
  const canDelete = can(user, "admin");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/projects" className="text-sm text-muted hover:underline">
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {project.code ? `${project.code} · ` : ""}
            {project.client_name ?? "No client"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            <HealthBadge health={project.health} />
            {project.health_override && (
              <span className="text-xs text-muted">(health set manually)</span>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/projects/${project.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2"
            >
              <Pencil className="size-4" />
              Edit
            </Link>
            {canDelete && <ArchiveProjectButton projectId={project.id} />}
          </div>
        )}
      </header>

      {project.description && (
        <Card className="p-5">
          <p className="whitespace-pre-wrap text-sm">{project.description}</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Progress" value={`${project.progress_pct}%`}>
          <ProgressBar value={project.progress_pct} />
        </Stat>
        <Stat
          label="Tasks"
          value={`${project.task_done}/${project.task_total}`}
        />
        <Stat
          label="Overdue"
          value={String(project.task_overdue)}
          tone={project.task_overdue > 0 ? "danger" : undefined}
        />
        <Stat label="Target date" value={formatDate(project.target_date)} />
      </div>

      <Card
        title="Milestones"
        description="The checkpoints this project is measured against."
      >
        <MilestoneList
          projectId={project.id}
          milestones={milestones}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </Card>

      <Card
        title="Tasks"
        description="Progress above is recomputed from these by the database."
      >
        <TaskList
          projectId={project.id}
          tasks={tasks}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone?: "danger";
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={
          tone === "danger"
            ? "mt-2 text-2xl font-semibold tabular-nums text-danger"
            : "mt-2 text-2xl font-semibold tabular-nums"
        }
      >
        {value}
      </p>
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}
