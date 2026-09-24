"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { toNumber } from "@/lib/db/projects";
import { fail, type ActionResult } from "@/lib/types";

/** Blank -> null; otherwise a non-negative number rounded to 2dp. */
const optionalMoney = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === null || String(v).trim() === "" ? null : Number(String(v).trim())))
  .refine((n) => n === null || (Number.isFinite(n) && n >= 0), {
    message: "Amount must be a number of zero or more",
  })
  .transform((n) => (n === null ? null : Math.round(n * 100) / 100));

const optionalPercent = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => (v === null || String(v).trim() === "" ? null : Number(String(v).trim())))
  .refine((n) => n === null || (Number.isFinite(n) && n > 0 && n <= 100), {
    message: "Percent must be between 0 and 100",
  });

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Dates must be YYYY-MM-DD")
  .nullable();

const optionalText = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === "" ? null : v))
  .nullable();

const newTermSchema = z.object({
  label: z.string().trim().min(1, "Give the payment a name, e.g. 50% prepayment").max(200),
  percent: optionalPercent.optional().default(null),
  amount: optionalMoney.optional().default(null),
  due_date: optionalDate.optional().default(null),
});

export type NewPaymentTerm = z.input<typeof newTermSchema>;

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

/**
 * Adds one or more instalments (one from the form, several from a template).
 * A blank amount with a percent is worked out here from the project's
 * contract value — the database's own budget total — never from a figure
 * the browser sent, per this app's "never trust browser-sent money" rule.
 */
export async function addPaymentTerms(
  projectId: string,
  terms: NewPaymentTerm[],
): Promise<ActionResult> {
  try {
    const parsed = [];
    for (const term of terms) {
      const result = newTermSchema.safeParse(term);
      if (!result.success) return { ok: false, error: result.error.issues[0].message };
      parsed.push(result.data);
    }
    if (parsed.length === 0) return { ok: false, error: "Nothing to add." };

    const user = await requireRole("member");
    const db = await createClient();

    const { data: project, error: projectError } = await db
      .from("project_overview")
      .select("id, planned_total")
      .eq("id", projectId)
      .eq("workspace_id", user.workspaceId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; planned_total: number | string }>();
    if (projectError) throw new Error(projectError.message);
    if (!project) return { ok: false, error: "Project not found." };
    const contractValue = toNumber(project.planned_total);

    const rows = [];
    for (const term of parsed) {
      let amount = term.amount;
      if (amount === null) {
        if (term.percent === null) {
          return { ok: false, error: `"${term.label}": enter an amount or a percent.` };
        }
        if (contractValue <= 0) {
          return {
            ok: false,
            error: "This project has no budget total to take a percent of — enter an amount instead.",
          };
        }
        amount = Math.round(contractValue * term.percent) / 100;
      }
      rows.push({ ...term, amount });
    }

    const { data: last } = await db
      .from("payment_terms")
      .select("sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    let next = (last?.sort_order ?? -1) + 1;

    // workspace_id is filled by trigger from the parent project.
    const { error } = await db.from("payment_terms").insert(
      rows.map((r) => ({
        project_id: projectId,
        label: r.label,
        percent: r.percent,
        amount: r.amount,
        due_date: r.due_date,
        sort_order: next++,
        created_by: user.id,
      })),
    );
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "payment_term",
      entityId: projectId,
      action: "create",
      summary:
        rows.length === 1
          ? `Added payment term "${rows[0].label}"`
          : `Added ${rows.length} payment terms`,
      after: rows,
    });

    revalidate(projectId);
    return { ok: true, message: rows.length === 1 ? "Payment term added." : `${rows.length} payment terms added.` };
  } catch (err) {
    return fail(err);
  }
}

const patchSchema = z.object({
  label: z.string().trim().min(1, "A payment needs a name").max(200).optional(),
  amount: optionalMoney
    .refine((n) => n !== null, "Amount is required")
    .optional(),
  due_date: optionalDate.optional(),
  status: z.enum(["pending", "invoiced", "paid"]).optional(),
  invoice_no: optionalText.optional(),
  paid_on: optionalDate.optional(),
});

export type PaymentTermPatch = z.input<typeof patchSchema>;

/**
 * Patches only the fields given — one field per save, like patchBudgetLine,
 * so two quick edits on the same row can't overwrite each other with a
 * stale copy. invoiced_on / paid_on follow status in the database (0021).
 */
export async function patchPaymentTerm(
  id: string,
  projectId: string,
  patch: PaymentTermPatch,
): Promise<ActionResult> {
  try {
    const parsed = patchSchema.safeParse(patch);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    if (Object.keys(parsed.data).length === 0) return { ok: true };

    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db
      .from("payment_terms")
      .update(parsed.data)
      .eq("id", id)
      .eq("workspace_id", user.workspaceId);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "payment_term",
      entityId: id,
      action: "update",
      summary: parsed.data.status
        ? `Marked payment as ${parsed.data.status}`
        : "Updated payment term",
      after: parsed.data,
    });

    revalidate(projectId);
    return { ok: true, message: "Payment saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePaymentTerm(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db
      .from("payment_terms")
      .delete()
      .eq("id", id)
      .eq("workspace_id", user.workspaceId);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "payment_term",
      entityId: id,
      action: "delete",
      summary: "Deleted payment term",
    });

    revalidate(projectId);
    return { ok: true, message: "Payment term deleted." };
  } catch (err) {
    return fail(err);
  }
}
