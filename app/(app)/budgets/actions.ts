"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { fail, type ActionResult } from "@/lib/types";

/**
 * Money arrives from a text input. z.coerce.number() would turn "" into 0 and
 * "abc" into NaN without complaint, so parse it explicitly and reject both.
 */
const money = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
  .refine((n) => Number.isFinite(n) && n >= 0, {
    message: "Amount must be a number of zero or more",
  })
  // Two decimal places, matching numeric(14,2) in the database.
  .transform((n) => Math.round(n * 100) / 100);

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const budgetLineSchema = z.object({
  project_id: z.string().uuid(),
  category: z.string().trim().min(1, "Category is required").max(100),
  description: optionalText,
  planned_amount: money,
});

export type BudgetLineInput = z.input<typeof budgetLineSchema>;

export async function createBudgetLine(
  input: BudgetLineInput,
): Promise<ActionResult> {
  try {
    const parsed = budgetLineSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("member");
    const db = await createClient();

    // workspace_id is filled by trigger from the parent project.
    const { error } = await db.from("budget_lines").insert(parsed.data);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "budget_line",
      entityId: parsed.data.project_id,
      action: "create",
      summary: `Added budget line "${parsed.data.category}"`,
      after: parsed.data,
    });

    revalidatePath(`/projects/${parsed.data.project_id}`);
    revalidatePath("/budgets");
    return { ok: true, message: "Budget line added." };
  } catch (err) {
    return fail(err);
  }
}

const budgetLinePatchSchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(100).optional(),
  description: optionalText.optional(),
  planned_amount: money.optional(),
});

export type BudgetLinePatch = z.input<typeof budgetLinePatchSchema>;

/**
 * Patches only the fields given — not a full-row update. See patchExpense's
 * comment below for why: two independently-editable fields on one row
 * (category, amount) resent together on every save let a fast edit to one
 * field silently overwrite a concurrent, not-yet-landed edit to the other
 * with a stale value. Same fix, same shape.
 */
export async function patchBudgetLine(
  id: string,
  projectId: string,
  patch: BudgetLinePatch,
): Promise<ActionResult> {
  try {
    const parsed = budgetLinePatchSchema.safeParse(patch);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    if (Object.keys(parsed.data).length === 0) {
      return { ok: true };
    }

    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db.from("budget_lines").update(parsed.data).eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "budget_line",
      entityId: id,
      action: "update",
      summary: "Updated budget line",
      after: parsed.data,
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/budgets");
    return { ok: true, message: "Budget line saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteBudgetLine(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    // Expenses charged here survive: the FK is ON DELETE SET NULL, so they
    // become unassigned rather than vanishing along with the plan.
    const { error } = await db.from("budget_lines").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "budget_line",
      entityId: id,
      action: "delete",
      summary: "Deleted budget line; its expenses are now unassigned",
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/budgets");
    return { ok: true, message: "Budget line deleted." };
  } catch (err) {
    return fail(err);
  }
}

// --------------------------------------------------------------- expenses

const expenseSchema = z.object({
  project_id: z.string().uuid(),
  budget_line_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  description: z.string().trim().min(1, "Description is required").max(300),
  amount: money,
  incurred_on: z.string().trim().min(1, "Date is required"),
  vendor: optionalText,
});

export type ExpenseInput = z.input<typeof expenseSchema>;

export async function createExpense(input: ExpenseInput): Promise<ActionResult> {
  try {
    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("member");
    const db = await createClient();

    // A trigger refuses a budget line belonging to another project, so a
    // stray id cannot corrupt the variance figures.
    const { error } = await db
      .from("expenses")
      .insert({ ...parsed.data, created_by: user.id });

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "expense",
      entityId: parsed.data.project_id,
      action: "create",
      summary: `Recorded expense "${parsed.data.description}"`,
      after: parsed.data,
    });

    revalidatePath(`/projects/${parsed.data.project_id}`);
    revalidatePath("/budgets");
    return { ok: true, message: "Expense recorded." };
  } catch (err) {
    return fail(err);
  }
}

const expensePatchSchema = z.object({
  budget_line_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  description: z.string().trim().min(1, "Description is required").max(300).optional(),
  amount: money.optional(),
  incurred_on: z.string().trim().min(1, "Date is required").optional(),
});

export type ExpensePatch = z.input<typeof expensePatchSchema>;

/**
 * Patches only the fields given — not a full-row update. The inline edit
 * grid in ExpenseList has four independently-editable fields on one row; an
 * earlier version resent the whole row on every field's save, reconstructed
 * from a snapshot that could already be stale by the time the request
 * landed. Editing two different fields within the same fraction of a second
 * (realistic: type an amount, then click a different field before the first
 * save's revalidation lands) let the later request silently stomp the
 * earlier edit with an out-of-date value for the field it wasn't even
 * touching. A true partial update — only SET the columns actually passed —
 * makes that impossible regardless of ordering.
 */
export async function patchExpense(
  id: string,
  projectId: string,
  patch: ExpensePatch,
): Promise<ActionResult> {
  try {
    const parsed = expensePatchSchema.safeParse(patch);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    if (Object.keys(parsed.data).length === 0) {
      return { ok: true };
    }

    const user = await requireRole("member");
    const db = await createClient();

    // Same guard as create: a trigger refuses a budget line belonging to a
    // different project, so a stray id here cannot corrupt the rollup.
    const { error } = await db.from("expenses").update(parsed.data).eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "expense",
      entityId: id,
      action: "update",
      summary: "Updated expense",
      after: parsed.data,
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/budgets");
    return { ok: true, message: "Expense saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteExpense(
  id: string,
  projectId: string,
): Promise<ActionResult> {
  try {
    const user = await requireRole("admin");
    const db = await createClient();

    const { error } = await db.from("expenses").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "expense",
      entityId: id,
      action: "delete",
      summary: "Deleted expense",
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/budgets");
    return { ok: true, message: "Expense deleted." };
  } catch (err) {
    return fail(err);
  }
}
