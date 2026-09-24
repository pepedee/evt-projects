import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Pencil } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { getProject, listMilestones } from "@/lib/db/projects";
import { listTasks } from "@/lib/db/tasks";
import { listBudgetLines, listExpenses } from "@/lib/db/budgets";
import { listDocuments } from "@/lib/db/documents";
import { listPaymentTerms } from "@/lib/db/payments";
import { PaymentTerms } from "@/components/payments/payment-terms";
import { DoneMark } from "@/components/projects/done-mark";
import { BudgetLines } from "@/components/budgets/budget-lines";
import { ExpenseList } from "@/components/budgets/expense-list";
import { UploadButton } from "@/components/files/upload-button";
import { DocumentList } from "@/components/files/document-list";
import { SummaryPanel } from "@/components/ai/summary-panel";
import { isAiConfigured } from "@/lib/ai/client";
import { formatMoney } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui/card";
import {
  HealthBadge,
  PriorityBadge,
  ProgressBar,
  ProjectStatusBadge,
} from "@/components/shared/status-badge";
import { MilestoneList } from "@/components/projects/milestone-list";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { ScheduleImport } from "@/components/projects/schedule-import";
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

  const project = await getProject(id, user.workspaceId);
  if (!project) notFound();

  const [milestones, tasks, budgetLines, expenses, documents, paymentTerms] =
    await Promise.all([
      listMilestones(id, user.workspaceId),
      listTasks(user.workspaceId, { projectId: id }),
      listBudgetLines(id, user.workspaceId),
      listExpenses(id, user.workspaceId),
      listDocuments(user.workspaceId, { projectId: id }),
      listPaymentTerms(id, user.workspaceId),
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
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            {project.status === "completed" && <DoneMark size="lg" />}
            <span className="min-w-0">{project.name}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {project.code ? `${project.code} · ` : ""}
            {project.client_name ?? "No client"}
            {project.quotation_date
              ? ` · Quotation ${formatDate(project.quotation_date)}`
              : ""}
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

        <div className="flex flex-wrap gap-2">
          {/* A plain link: the browser handles the download, and the route is
              a GET because building a report changes nothing. */}
          <a
            href={`/api/reports/word?projectId=${project.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2"
          >
            <FileDown className="size-4" />
            Word report
          </a>
          <a
            href={`/api/reports/handover?projectId=${project.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2"
          >
            <FileDown className="size-4" />
            Handover report
          </a>
          {canEdit && (
            <Link
              href={`/projects/${project.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2"
            >
              <Pencil className="size-4" />
              Edit
            </Link>
          )}
          {canDelete && <ArchiveProjectButton projectId={project.id} />}
        </div>
      </header>

      {project.description && (
        <Card className="p-5">
          <p className="whitespace-pre-wrap text-sm">{project.description}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Budget planned"
          value={formatMoney(project.planned_total, project.currency)}
        />
        <Stat
          label="Spent"
          value={formatMoney(project.spent_total, project.currency)}
        />
        <Stat
          label="Variance"
          value={formatMoney(project.variance, project.currency)}
          tone={project.variance < 0 ? "danger" : undefined}
        />
      </div>

      <Card
        title="Timeline"
        description="Milestones and dated tasks on one schedule — read-only; edit dates from the lists below."
      >
        <ProjectTimeline
          milestones={milestones}
          tasks={tasks}
          projectStartDate={project.start_date}
          projectTargetDate={project.target_date}
        />
        {canEdit && <ScheduleImport projectId={project.id} />}
      </Card>

      <Card
        title="AI summary"
        description="Written from this project's own record. Read-only — it never changes anything."
      >
        {isAiConfigured() ? (
          <SummaryPanel projectId={project.id} />
        ) : (
          <EmptyState message="Set ANTHROPIC_API_KEY in .env.local to enable AI summaries." />
        )}
      </Card>

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

      <Card
        title="Budget"
        description={`Planned against actual, all in ${project.currency}.`}
      >
        <BudgetLines
          projectId={project.id}
          currency={project.currency}
          lines={budgetLines}
          spentUnassigned={project.spent_unassigned}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </Card>

      <Card title="Expenses" description="What has actually been spent.">
        <ExpenseList
          projectId={project.id}
          currency={project.currency}
          expenses={expenses}
          lines={budgetLines}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </Card>

      <Card
        title="Payments"
        description="What the client pays and when — before VAT, same basis as the budget."
      >
        <PaymentTerms
          projectId={project.id}
          currency={project.currency}
          contractValue={project.planned_total}
          terms={paymentTerms}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </Card>

      <Card
        title="Files"
        description="Drawings, quotes, receipts. Private, with expiring links."
        action={
          canEdit ? (
            <UploadButton
              workspaceId={user.workspaceId}
              projectId={project.id}
            />
          ) : undefined
        }
      >
        <DocumentList documents={documents} canDelete={canDelete} />
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
      {/* Standalone figure: proportional numerals. tabular-nums is for
          columns that must align vertically, not for a lone value. */}
      <p
        className={
          tone === "danger"
            ? "mt-2 text-2xl font-semibold text-[var(--chart-critical)]"
            : "mt-2 text-2xl font-semibold"
        }
      >
        {value}
      </p>
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}
