import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getProject, listMilestones } from "@/lib/db/projects";
import { listBudgetLines } from "@/lib/db/budgets";
import { listTasks } from "@/lib/db/tasks";
import { isOverdue, today } from "@/lib/tasks";
import { AI_MODEL, PROMPT_VERSION } from "@/lib/ai/client";
import type { ProjectSnapshot } from "@/lib/ai/prompts";
import type { SummaryKind } from "@/lib/summaries";

/** Enough context to summarise without dumping every row into the prompt. */
const MAX_TASKS_IN_SNAPSHOT = 60;

/**
 * Assemble what the model is allowed to see.
 *
 * Everything comes through lib/db, which runs as the signed-in user, so RLS
 * decides the contents. A user who cannot read a project cannot summarise it.
 */
export async function buildProjectSnapshot(
  projectId: string,
  workspaceId: string,
): Promise<ProjectSnapshot | null> {
  const project = await getProject(projectId, workspaceId);
  if (!project) return null;

  const [milestones, tasks, budgetLines] = await Promise.all([
    listMilestones(projectId, workspaceId),
    listTasks(workspaceId, { projectId }),
    listBudgetLines(projectId, workspaceId),
  ]);

  // Open work first, and overdue before the rest — if the list is truncated,
  // what gets dropped should be finished tasks, not the problems.
  const ranked = [...tasks].sort((a, b) => {
    const score = (t: (typeof tasks)[number]) =>
      (isOverdue(t) ? 0 : 2) + (t.status === "done" || t.status === "cancelled" ? 2 : 0);
    return score(a) - score(b);
  });

  return {
    as_of: today(),
    name: project.name,
    code: project.code,
    client: project.client_name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    health: project.health,
    health_is_manual: project.health_override !== null,
    progress_pct: project.progress_pct,
    start_date: project.start_date,
    target_date: project.target_date,
    currency: project.currency,
    task_total: project.task_total,
    task_done: project.task_done,
    task_open: project.task_open,
    task_overdue: project.task_overdue,
    task_blocked: project.task_blocked,
    planned_total: project.planned_total,
    spent_total: project.spent_total,
    spent_unassigned: project.spent_unassigned,
    milestones: milestones.map((m) => ({
      name: m.name,
      due_date: m.due_date,
      status: m.status,
    })),
    tasks: ranked.slice(0, MAX_TASKS_IN_SNAPSHOT).map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      overdue: isOverdue(t),
    })),
    budget_lines: budgetLines.map((b) => ({
      category: b.category,
      planned: b.planned_amount,
      spent: b.spent_total,
    })),
  };
}

/**
 * Canonical JSON: keys sorted at every level.
 *
 * The hash is the cache key, so serialisation has to be stable. Plain
 * JSON.stringify preserves insertion order, which means an unrelated
 * refactor that reorders a field would silently invalidate every cached
 * summary and re-bill the whole workspace.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);

  return `{${entries.join(",")}}`;
}

/**
 * Identifies "this exact snapshot, summarised this exact way".
 *
 * The model and prompt version are part of it: changing either should produce
 * a fresh summary rather than serving one written under the old rules.
 */
export function snapshotHash(
  kind: SummaryKind,
  snapshot: ProjectSnapshot,
): string {
  return createHash("sha256")
    .update(`${PROMPT_VERSION}|${AI_MODEL}|${kind}|${canonical(snapshot)}`)
    .digest("hex");
}

export interface StoredSummary {
  id: string;
  content: string;
  model: string;
  created_at: string;
}

export async function findCachedSummary(
  projectId: string,
  kind: SummaryKind,
  inputHash: string,
  workspaceId: string,
): Promise<StoredSummary | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("ai_summaries")
    .select("id, content, model, created_at")
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .eq("input_hash", inputHash)
    .maybeSingle<StoredSummary>();

  if (error) throw new Error(error.message);
  return data;
}

/** The most recent summary of a kind, whatever snapshot produced it. */
export async function latestSummary(
  projectId: string,
  kind: SummaryKind,
  workspaceId: string,
): Promise<StoredSummary | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("ai_summaries")
    .select("id, content, model, created_at")
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<StoredSummary>();

  if (error) throw new Error(error.message);
  return data;
}

export async function saveSummary(input: {
  projectId: string;
  kind: SummaryKind;
  content: string;
  inputHash: string;
  promptTokens: number | null;
  completionTokens: number | null;
  userId: string;
}): Promise<void> {
  const db = await createClient();

  // workspace_id is filled by trigger from the parent project. A duplicate
  // hash means a concurrent request already stored this exact summary —
  // that is a race, not an error, so ignore it.
  const { error } = await db.from("ai_summaries").insert({
    project_id: input.projectId,
    kind: input.kind,
    content: input.content,
    model: AI_MODEL,
    input_hash: input.inputHash,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    created_by: input.userId,
  });

  if (error && !error.message.includes("duplicate key")) {
    console.error("failed to store ai summary", error.message);
  }
}
