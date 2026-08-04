import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/db/projects";

/**
 * Budget queries. Every total here comes from the database views in
 * 0010_budget_rollup.sql — nothing is summed from values the browser sent.
 */

export interface BudgetLine {
  id: string;
  project_id: string;
  category: string;
  description: string | null;
  planned_amount: number;
  spent_total: number;
  expense_count: number;
  sort_order: number;
  /** Positive means under budget, negative means over. */
  variance: number;
}

export interface Expense {
  id: string;
  project_id: string;
  budget_line_id: string | null;
  description: string;
  amount: number;
  incurred_on: string;
  vendor: string | null;
  receipt_document_id: string | null;
}

export async function listBudgetLines(projectId: string): Promise<BudgetLine[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("budget_line_overview")
    .select(
      "id, project_id, category, description, planned_amount, spent_total, expense_count, sort_order",
    )
    .eq("project_id", projectId)
    .order("sort_order")
    .order("category");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const planned_amount = toNumber(row.planned_amount);
    const spent_total = toNumber(row.spent_total);
    return {
      id: row.id,
      project_id: row.project_id,
      category: row.category,
      description: row.description,
      planned_amount,
      spent_total,
      expense_count: toNumber(row.expense_count),
      sort_order: row.sort_order,
      variance: planned_amount - spent_total,
    };
  });
}

export async function listExpenses(projectId: string): Promise<Expense[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("expenses")
    .select(
      "id, project_id, budget_line_id, description, amount, incurred_on, vendor, receipt_document_id",
    )
    .eq("project_id", projectId)
    .order("incurred_on", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...row,
    amount: toNumber(row.amount),
  })) as Expense[];
}
