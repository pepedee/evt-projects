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
