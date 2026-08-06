"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/types";

const qcItemSchema = z.object({
  project_id: z.string().uuid(),
  item_no: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  description: z.string().trim().min(1, "Description is required").max(300),
});

export type QcItemInput = z.input<typeof qcItemSchema>;

export async function createQcItem(input: QcItemInput): Promise<ActionResult> {
  try {
    const parsed = qcItemSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db.from("qc_items").insert({
      ...parsed.data,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "qc_item",
      entityId: parsed.data.project_id,
      action: "create",
      summary: `Added QC item "${parsed.data.description}"`,
      after: parsed.data,
    });

    revalidatePath(`/projects/${parsed.data.project_id}`);
    return { ok: true, message: "QC item added." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteQcItem(id: string, projectId: string): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db.from("qc_items").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "qc_item",
      entityId: id,
      action: "delete",
      summary: "Deleted QC item",
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "QC item deleted." };
  } catch (err) {
    return fail(err);
  }
}

const qcUnitSchema = z.object({
  project_id: z.string().uuid(),
  label: z.string().trim().min(1, "Label is required").max(50),
});

export type QcUnitInput = z.input<typeof qcUnitSchema>;

export async function createQcUnit(input: QcUnitInput): Promise<ActionResult> {
  try {
    const parsed = qcUnitSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db.from("qc_units").insert({
      ...parsed.data,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "qc_unit",
      entityId: parsed.data.project_id,
      action: "create",
      summary: `Added QC unit "${parsed.data.label}"`,
      after: parsed.data,
    });

    revalidatePath(`/projects/${parsed.data.project_id}`);
    return { ok: true, message: "Unit added." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteQcUnit(id: string, projectId: string): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db.from("qc_units").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "qc_unit",
      entityId: id,
      action: "delete",
      summary: "Deleted QC unit",
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Unit deleted." };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Sets one grid cell directly to the desired result rather than trusting a
 * client-reported "current" value and computing the next step server-side —
 * the client already knows the cycle order (blank → pass → fail → blank),
 * so this only needs to apply whatever it lands on. null clears the cell
 * (a real delete: "not yet inspected" is the absence of a row, not a third
 * status value), otherwise it's an upsert.
 */
export async function setQcResult(
  qcItemId: string,
  qcUnitId: string,
  projectId: string,
  result: "pass" | "fail" | null,
): Promise<ActionResult> {
  try {
    const user = await requireRole("member");
    const db = await createClient();

    if (result === null) {
      const { error } = await db
        .from("qc_results")
        .delete()
        .eq("qc_item_id", qcItemId)
        .eq("qc_unit_id", qcUnitId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("qc_results").upsert(
        {
          qc_item_id: qcItemId,
          qc_unit_id: qcUnitId,
          result,
          updated_by: user.id,
        },
        { onConflict: "qc_item_id,qc_unit_id" },
      );
      if (error) throw new Error(error.message);
    }

    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
