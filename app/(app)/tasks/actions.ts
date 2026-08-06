"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/types";

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

/**
 * Hours are entered as text and may be blank. z.coerce would turn "" into 0,
 * which is a different claim from "not estimated", so blank becomes null.
 */
const optionalHours = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => {
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  })
  .refine((v) => v === null || (v >= 0 && !Number.isNaN(v)), {
    message: "Hours must be a positive number",
  });

const taskSchema = z.object({
  project_id: z.string().uuid("Pick a project"),
  milestone_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
  description: optionalText,
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  kind: z.enum(["task", "defect"]).default("task"),
  estimate_hours: optionalHours,
  spent_hours: optionalHours,
  start_date: optionalDate,
  due_date: optionalDate,
});

export type TaskInput = z.input<typeof taskSchema>;

export async function createTask(input: TaskInput): Promise<ActionResult> {
  try {
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    const values = parsed.data;

    if (values.start_date && values.due_date && values.start_date > values.due_date) {
      return { ok: false, error: "Due date cannot be before the start date." };
    }

    const user = await requireRole("member");
    const db = await createClient();

    // workspace_id comes from the parent project by trigger; completed_at and
    // the project's progress_pct are maintained by triggers too.
    const { error } = await db.from("tasks").insert({
      ...values,
      spent_hours: values.spent_hours ?? 0,
      created_by: user.id,
      assignee_id: user.id,
    });

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "task",
      entityId: values.project_id,
      action: "create",
      summary: `Added task "${values.title}"`,
      after: values,
    });

    revalidatePath("/tasks");
    revalidatePath(`/projects/${values.project_id}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Task added." };
  } catch (err) {
    return fail(err);
  }
}

export async function updateTask(
  id: string,
  input: TaskInput,
): Promise<ActionResult> {
  try {
    const parsed = taskSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    const values = parsed.data;

    const user = await requireRole("member");
    const db = await createClient();

    const { data: before } = await db
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    const { error } = await db
      .from("tasks")
      .update({ ...values, spent_hours: values.spent_hours ?? 0 })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "task",
      entityId: id,
      action: "update",
      summary: `Updated task "${values.title}"`,
      before,
      after: values,
    });

    revalidatePath("/tasks");
    revalidatePath(`/projects/${values.project_id}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Task saved." };
  } catch (err) {
    return fail(err);
  }
}

/** The kanban board's only write: move a card to another column. */
export async function setTaskStatus(
  id: string,
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled",
): Promise<ActionResult> {
  try {
    const user = await requireRole("member");
    const db = await createClient();

    const { data, error } = await db
      .from("tasks")
      .update({ status })
      .eq("id", id)
      .select("project_id, title")
      .single<{ project_id: string; title: string }>();

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "task",
      entityId: id,
      action: "update",
      summary: `Moved "${data.title}" to ${status}`,
    });

    revalidatePath("/tasks");
    revalidatePath(`/projects/${data.project_id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Soft delete — nothing in this app is destroyed (see AGENTS.md). */
export async function deleteTask(id: string): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { data, error } = await db
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("project_id")
      .single<{ project_id: string }>();

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "task",
      entityId: id,
      action: "delete",
      summary: "Archived task",
    });

    revalidatePath("/tasks");
    revalidatePath(`/projects/${data.project_id}`);
    return { ok: true, message: "Task archived." };
  } catch (err) {
    return fail(err);
  }
}
