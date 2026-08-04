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

export async function updateBudgetLine(
  id: string,
  input: BudgetLineInput,
): Promise<ActionResult> {
  try {
    const parsed = budgetLineSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const user = await requireRole("member");
    const db = await createClient();

    const { error } = await db
      .from("budget_lines")
      .update({
        category: parsed.data.category,
        description: parsed.data.description,
        planned_amount: parsed.data.planned_amount,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await logActivity(user, {
      entity: "budget_line",
      entityId: id,
      action: "update",
      summary: `Updated budget line "${parsed.data.category}"`,
      after: parsed.data,
    });

    revalidatePath(`/projects/${parsed.data.project_id}`);
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
