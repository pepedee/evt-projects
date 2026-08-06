"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/types";

const qty = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
  .refine((n) => Number.isFinite(n) && n >= 0, {
    message: "Quantity must be a number of zero or more",
  })
  .transform((n) => Math.round(n * 100) / 100);

const money = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
  .refine((n) => Number.isFinite(n) && n >= 0, {
    message: "Cost must be a number of zero or more",
  })
  .transform((n) => Math.round(n * 100) / 100);

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const materialSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(1, "Item name is required").max(200),
  qty,
  unit_cost: money,
  supplier: optionalText,
});

export type MaterialInput = z.input<typeof materialSchema>;

export async function createMaterial(input: MaterialInput): Promise<ActionResult> {
  try {
    const parsed = materialSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db.from("materials").insert({
      ...parsed.data,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "material",
      entityId: parsed.data.project_id,
      action: "create",
      summary: `Added material "${parsed.data.name}"`,
      after: parsed.data,
    });

    revalidatePath(`/projects/${parsed.data.project_id}`);
    return { ok: true, message: "Material added." };
  } catch (err) {
    return fail(err);
  }
}

const materialPatchSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(200).optional(),
  qty: qty.optional(),
  unit_cost: money.optional(),
  supplier: optionalText.optional(),
  status: z.enum(["needed", "ordered", "received", "installed"]).optional(),
  notes: optionalText.optional(),
});

export type MaterialPatch = z.input<typeof materialPatchSchema>;

/**
 * Partial update, same shape as patchExpense/patchBudgetLine — this row has
 * several independently-editable fields, so a full-row resend would let a
 * fast edit to one field silently overwrite a concurrent edit to another
 * with a stale value. See app/(app)/budgets/actions.ts's patchExpense for
 * the fuller account of why.
 */
export async function patchMaterial(
  id: string,
  projectId: string,
  patch: MaterialPatch,
): Promise<ActionResult> {
  try {
    const parsed = materialPatchSchema.safeParse(patch);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    if (Object.keys(parsed.data).length === 0) {
      return { ok: true };
    }

    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db.from("materials").update(parsed.data).eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "material",
      entityId: id,
      action: "update",
      summary: "Updated material",
      after: parsed.data,
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Material saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteMaterial(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db.from("materials").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "material",
      entityId: id,
      action: "delete",
      summary: "Deleted material",
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Material deleted." };
  } catch (err) {
    return fail(err);
  }
}
