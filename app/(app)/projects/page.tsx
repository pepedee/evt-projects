import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { listProjects, type Project } from "@/lib/db/projects";
import { needsAttention } from "@/lib/health";
import { cn } from "@/lib/utils";
import { AttentionMark } from "@/components/projects/attention-mark";
import { listPaymentTermsByProject } from "@/lib/db/payments";
import { summarizePayments, type PaymentSummary } from "@/lib/payments";
import { PaymentStatus } from "@/components/payments/payment-status";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/auth";
import { Card, EmptyState } from "@/components/ui/card";
import { FilterBar } from "@/components/shared/filter-bar";
import { ProjectCardActions } from "@/components/projects/project-card-actions";
import { DoneMark } from "@/components/projects/done-mark";
import {
  HealthBadge,
  ProgressBar,
  PriorityBadge,
  ProjectStatusBadge,
} from "@/components/shared/status-badge";
import { formatDate } from "@/lib/format";
import type { PoStatus, Priority, ProjectStatus } from "@/lib/types";
import { PoBadge } from "@/components/projects/po-status";

export const metadata = { title: "Projects · AI Project Tracker" };

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const PO_OPTIONS = [
  { value: "all", label: "Any" },
  { value: "received", label: "PO received" },
  { value: "waiting", label: "Waiting for PO" },
  { value: "lost", label: "LOST" },
];

const HEALTH_OPTIONS = [
  { value: "all", label: "Any health" },
  { value: "attention", label: "Needing attention" },
];

const SORT_OPTIONS = [
  { value: "all", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "code", label: "Quotation number" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const single = (key: string) =>
    (Array.isArray(params[key]) ? params[key][0] : params[key]) ?? undefined;

  const sortParam = single("sort");
  const { rows, total, pageCount } = await listProjects(user.workspaceId, {
    search: single("q"),
    status: single("status") as ProjectStatus | "all" | undefined,
    priority: single("priority") as Priority | "all" | undefined,
    sort: sortParam === "name" || sortParam === "code" ? sortParam : undefined,
    attention: single("health") === "attention",
    po: single("po") as PoStatus | "all" | undefined,
    page: Number(single("page") ?? 1),
  });

  const paymentTerms = await listPaymentTermsByProject(
    user.workspaceId,
    rows.map((p) => p.id),
  );

  const canEdit = can(user, "member");
  const canDelete = can(user, "admin");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            {total} {total === 1 ? "project" : "projects"}
          </p>
        </div>
        {can(user, "member") && (
          <div className="flex gap-2">
            <Link
              href="/projects/import"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-surface-2"
            >
              <Upload className="size-4" />
              Import
            </Link>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:opacity-90"
            >
              <Plus className="size-4" />
              New project
            </Link>
          </div>
        )}
      </header>

      <FilterBar
        basePath="/projects"
        searchPlaceholder="Name, code or client"
        selects={[
          { name: "status", label: "Status", options: STATUS_OPTIONS },
          { name: "priority", label: "Priority", options: PRIORITY_OPTIONS },
          { name: "po", label: "Customer PO", options: PO_OPTIONS },
          { name: "health", label: "Health", options: HEALTH_OPTIONS },
          { name: "sort", label: "Sort by", options: SORT_OPTIONS },
        ]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No projects match these filters." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              payments={summarizePayments(paymentTerms.get(project.id) ?? [])}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <Pagination
          page={Number(single("page") ?? 1)}
          pageCount={pageCount}
          params={params}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  payments,
  canEdit,
  canDelete,
}: {
  project: Project;
  payments: PaymentSummary;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const attention = needsAttention(project);
  const tone = project.health === "off_track" ? "danger" : "warning";

  return (
    // A button inside an <a> is invalid HTML, so rather than wrapping the
    // card in one link, the title link is stretched over the card
    // (after:inset-0) and the Edit/Delete icons sit above it (z-10).
    <Card
      className={cn(
        "relative h-full p-5 transition hover:border-primary",
        attention && (tone === "danger" ? "border-danger/60" : "border-warning/60"),
        // Lost quotations stay findable but step back visually.
        project.po_status === "lost" && "opacity-60 hover:opacity-100",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {project.status === "completed" && <DoneMark />}
            {attention && (
              <AttentionMark health={project.health} reason={project.health_reason} />
            )}
            <h2 className="min-w-0 truncate font-semibold">
              <Link
                href={`/projects/${project.id}`}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {project.name}
              </Link>
            </h2>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">
            {project.code ? `${project.code} · ` : ""}
            {project.client_name ?? "No client"}
          </p>
        </div>
        <HealthBadge health={project.health} />
        <ProjectCardActions
          projectId={project.id}
          projectName={project.name}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PoBadge status={project.po_status} number={project.po_number} />
        <ProjectStatusBadge status={project.status} />
        <PriorityBadge priority={project.priority} />
      </div>

      {/* Spelled out, not only in the icon's tooltip — there's no hover on a
          phone. */}
      {attention && project.health_reason && (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            tone === "danger" ? "text-danger" : "text-warning",
          )}
        >
          {project.health_reason}
        </p>
      )}

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

      <div className="mt-3">
        <PaymentStatus summary={payments} currency={project.currency} />
      </div>

      <p className="mt-3 text-xs text-muted">
        Target {formatDate(project.target_date)}
      </p>
    </Card>
  );
}

function Pagination({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | string[] | undefined>;
}) {
  const href = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "page") next.set(key, value);
    }
    next.set("page", String(target));
    return `/projects?${next.toString()}`;
  };

  return (
    <nav className="flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="text-primary hover:underline">
          Previous
        </Link>
      ) : (
        <span className="text-muted">Previous</span>
      )}
      <span className="text-muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="text-primary hover:underline">
          Next
        </Link>
      ) : (
        <span className="text-muted">Next</span>
      )}
    </nav>
  );
}
