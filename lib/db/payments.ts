import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/db/projects";
import { todayISO } from "@/lib/format";
import type { PaymentStatus, PaymentTerm } from "@/lib/payments";

/** Payment-term queries. Server-only — shapes live in lib/payments.ts. */

const COLUMNS =
  "id, project_id, label, percent, amount, due_date, status, invoice_no, invoiced_on, paid_on, sort_order";

interface Row {
  id: string;
  project_id: string;
  label: string;
  percent: number | string | null;
  amount: number | string;
  due_date: string | null;
  status: PaymentStatus;
  invoice_no: string | null;
  invoiced_on: string | null;
  paid_on: string | null;
  sort_order: number;
}

/** numeric columns come back from PostgREST as strings. */
function toTerm(row: Row): PaymentTerm {
  return {
    ...row,
    percent: row.percent === null ? null : toNumber(row.percent),
    amount: toNumber(row.amount),
  };
}

export async function listPaymentTerms(
  projectId: string,
  workspaceId: string,
): Promise<PaymentTerm[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("payment_terms")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("created_at")
    .returns<Row[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(toTerm);
}

/**
 * Payment terms for several projects in one query, grouped by project —
 * for the Projects list, so each card can show its payment status without
 * a query per card.
 */
export async function listPaymentTermsByProject(
  workspaceId: string,
  projectIds: string[],
): Promise<Map<string, PaymentTerm[]>> {
  const byProject = new Map<string, PaymentTerm[]>();
  if (projectIds.length === 0) return byProject;

  const db = await createClient();
  const { data, error } = await db
    .from("payment_terms")
    .select(COLUMNS)
    .eq("workspace_id", workspaceId)
    .in("project_id", projectIds)
    .order("sort_order")
    .returns<Row[]>();
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const term = toTerm(row);
    const list = byProject.get(term.project_id);
    if (list) list.push(term);
    else byProject.set(term.project_id, [term]);
  }
  return byProject;
}

export type PaymentDue = PaymentTerm & {
  projects: { name: string; code: string | null; currency: string } | null;
};

/**
 * Unpaid instalments that are overdue or due within `days`, across every
 * live project in the workspace — the dashboard's "Payments due" list.
 */
export async function listPaymentsDue(
  workspaceId: string,
  days = 30,
): Promise<PaymentDue[]> {
  const horizon = new Date(`${todayISO()}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + days);

  const db = await createClient();
  const { data, error } = await db
    .from("payment_terms")
    .select(`${COLUMNS}, projects!inner(name, code, currency, deleted_at)`)
    .eq("workspace_id", workspaceId)
    .neq("status", "paid")
    .not("due_date", "is", null)
    .lte("due_date", horizon.toISOString().slice(0, 10))
    .is("projects.deleted_at", null)
    .order("due_date")
    .limit(20)
    .returns<(Row & { projects: PaymentDue["projects"] })[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...toTerm(row), projects: row.projects }));
}
