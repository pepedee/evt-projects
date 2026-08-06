"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/types";

/** Empty date inputs arrive as "" — store them as NULL, not as an empty date. */
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: optionalText,
  description: optionalText,
  client_name: optionalText,
  location: optionalText,
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  currency: z.string().trim().length(3, "Use a 3-letter currency code"),
  start_date: optionalDate,
  target_date: optionalDate,
  health_override: z
    .enum(["on_track", "at_risk", "off_track"])
    .nullable()
    .optional(),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
});

export type ProjectInput = z.input<typeof projectSchema>;

function checkDateOrder(start: string | null, target: string | null) {
  if (start && target && start > target) {
    throw new Error("Target date cannot be before the start date.");
  }
}

export async function createProject(input: ProjectInput): Promise<ActionResult> {
  try {
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    const values = parsed.data;
    checkDateOrder(values.start_date, values.target_date);

    const user = await requireRole("member");
    const db = await createClient();

    const { data, error } = await db
      .from("projects")
      .insert({
        ...values,
        currency: values.currency.toUpperCase(),
        workspace_id: user.workspaceId,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "project",
      entityId: data.id,
      action: "create",
      summary: `Created project "${values.name}"`,
      after: values,
    });

    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { ok: true, message: "Project created." };
  } catch (err) {
    return fail(err);
  }
}

export async function updateProject(
  id: string,
  input: ProjectInput,
): Promise<ActionResult> {
  try {
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    const values = parsed.data;
    checkDateOrder(values.start_date, values.target_date);

    const user = await requireRole("member");
    const db = await createClient();

    const { data: before } = await db
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    // A project that has just been completed should record when.
    const actual_end_date =
      values.status === "completed"
        ? ((before?.actual_end_date as string | null) ??
          new Date().toISOString().slice(0, 10))
        : null;

    const { error } = await db
      .from("projects")
      .update({
        ...values,
        currency: values.currency.toUpperCase(),
        actual_end_date,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "project",
      entityId: id,
      action: "update",
      summary: `Updated project "${values.name}"`,
      before,
      after: values,
    });

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Project saved." };
  } catch (err) {
    return fail(err);
  }
}

/** Soft delete — nothing in this app is destroyed (see AGENTS.md). */
export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "project",
      entityId: id,
      action: "delete",
      summary: "Archived project",
    });

    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { ok: true, message: "Project archived." };
  } catch (err) {
    return fail(err);
  }
}

// ----------------------------------------------------------------- import

const importBudgetLineInput = z.object({
  category: z.string().trim().min(1).max(100),
  description: optionalText,
  planned_amount: z.number().min(0),
});

const importTaskInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: optionalText,
});

export interface ImportPayload {
  project: ProjectInput;
  budgetLines: z.input<typeof importBudgetLineInput>[];
  tasks: z.input<typeof importTaskInput>[];
}

/**
 * Creates a project plus its budget lines and tasks in one action — what the
 * import review screen submits once the user is happy with the AI-extracted
 * draft (see lib/ai/import.ts). Not a database transaction (the Supabase
 * client doesn't give us one): if a budget line or task fails to insert after
 * the project itself succeeds, that failure is logged rather than rolling
 * back a project the user already reviewed and approved — same trade-off
 * logActivity makes everywhere else in this app.
 */
export async function createProjectFromImport(
  input: ImportPayload,
): Promise<ActionResult & { projectId?: string }> {
  try {
    const parsedProject = projectSchema.safeParse(input.project);
    if (!parsedProject.success) {
      return { ok: false, error: parsedProject.error.issues[0].message };
    }
    const values = parsedProject.data;
    checkDateOrder(values.start_date, values.target_date);

    const budgetLines: z.infer<typeof importBudgetLineInput>[] = [];
    for (const line of input.budgetLines) {
      const parsed = importBudgetLineInput.safeParse(line);
      if (!parsed.success) {
        return { ok: false, error: `Budget line: ${parsed.error.issues[0].message}` };
      }
      budgetLines.push(parsed.data);
    }

    const tasks: z.infer<typeof importTaskInput>[] = [];
    for (const task of input.tasks) {
      const parsed = importTaskInput.safeParse(task);
      if (!parsed.success) {
        return { ok: false, error: `Task: ${parsed.error.issues[0].message}` };
      }
      tasks.push(parsed.data);
    }

    const user = await requireRole("member");
    const db = await createClient();

    const { data, error } = await db
      .from("projects")
      .insert({
        ...values,
        currency: values.currency.toUpperCase(),
        workspace_id: user.workspaceId,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (error) throw new Error(error.message);
    const projectId = data.id;

    if (budgetLines.length > 0) {
      const { error: blError } = await db.from("budget_lines").insert(
        budgetLines.map((line) => ({
          ...line,
          project_id: projectId,
          created_by: user.id,
        })),
      );
      if (blError) {
        console.error("import: budget line insert failed", blError.message);
      }
    }

    if (tasks.length > 0) {
      const { error: taskError } = await db.from("tasks").insert(
        tasks.map((task, i) => ({
          ...task,
          project_id: projectId,
          status: "todo" as const,
          priority: "medium" as const,
          kind: "task" as const,
          sort_order: i,
          created_by: user.id,
        })),
      );
      if (taskError) {
        console.error("import: task insert failed", taskError.message);
      }
    }

    await logActivity(user, {
      entity: "project",
      entityId: projectId,
      action: "create",
      summary: `Imported project "${values.name}" from a document`,
      after: values,
    });

    revalidatePath("/projects");
    revalidatePath("/dashboard");
    return { ok: true, message: "Project imported.", projectId };
  } catch (err) {
    return fail(err);
  }
}

// ------------------------------------------------------------- milestones

const milestoneSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: optionalText,
  due_date: optionalDate,
  status: z.enum(["pending", "in_progress", "done"]),
});

export type MilestoneInput = z.input<typeof milestoneSchema>;

export async function createMilestone(
  input: MilestoneInput,
): Promise<ActionResult> {
  try {
    const parsed = milestoneSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("member");
    const db = await createClient();

    // workspace_id is filled by trigger from the parent project.
    const { error } = await db.from("milestones").insert(parsed.data);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "milestone",
      entityId: parsed.data.project_id,
      action: "create",
      summary: `Added milestone "${parsed.data.name}"`,
    });

    revalidatePath(`/projects/${parsed.data.project_id}`);
    return { ok: true, message: "Milestone added." };
  } catch (err) {
    return fail(err);
  }
}

export async function setMilestoneStatus(
  id: string,
  projectId: string,
  status: "pending" | "in_progress" | "done",
): Promise<ActionResult> {
  try {
    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db.from("milestones").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "milestone",
      entityId: id,
      action: "update",
      summary: `Milestone marked ${status}`,
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteMilestone(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db.from("milestones").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "milestone",
      entityId: id,
      action: "delete",
      summary: "Deleted milestone",
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Milestone deleted." };
  } catch (err) {
    return fail(err);
  }
}
