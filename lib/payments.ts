import { todayISO } from "@/lib/format";

/**
 * Payment-term shapes and pure helpers. Kept apart from lib/db/payments.ts so
 * client components can import them without pulling in the server Supabase
 * client — same split as lib/tasks.ts.
 */

export type PaymentStatus = "pending" | "invoiced" | "paid";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  invoiced: "Invoiced",
  paid: "Paid",
};

export interface PaymentTerm {
  id: string;
  project_id: string;
  label: string;
  percent: number | null;
  amount: number;
  due_date: string | null;
  status: PaymentStatus;
  invoice_no: string | null;
  invoiced_on: string | null;
  paid_on: string | null;
  sort_order: number;
}

/** Overdue = has a due date in the past and hasn't been paid. */
export function isPaymentOverdue(term: Pick<PaymentTerm, "due_date" | "status">): boolean {
  return term.status !== "paid" && term.due_date !== null && term.due_date < todayISO();
}

export interface PaymentTotals {
  scheduled: number;
  received: number;
  outstanding: number;
  overdue: number;
}

export function paymentTotals(terms: PaymentTerm[]): PaymentTotals {
  let scheduled = 0;
  let received = 0;
  let overdue = 0;
  for (const t of terms) {
    scheduled += t.amount;
    if (t.status === "paid") received += t.amount;
    else if (isPaymentOverdue(t)) overdue += t.amount;
  }
  return { scheduled, received, outstanding: scheduled - received, overdue };
}

/**
 * Starting points for the patterns the business's own quotations actually
 * use ("100% prepayment", "50% prepayment / 50% net 30 days", ...). Amounts
 * are worked out server-side from the contract value, never from here.
 */
export const PAYMENT_TEMPLATES: { name: string; terms: { label: string; percent: number }[] }[] = [
  { name: "100% prepayment", terms: [{ label: "100% prepayment", percent: 100 }] },
  {
    name: "50% prepayment / 50% on completion",
    terms: [
      { label: "50% prepayment", percent: 50 },
      { label: "50% on completion (net 30 days)", percent: 50 },
    ],
  },
  {
    name: "30% prepayment / 70% on completion",
    terms: [
      { label: "30% prepayment", percent: 30 },
      { label: "70% on completion (net 30 days)", percent: 70 },
    ],
  },
  {
    name: "40% / 40% / 20%",
    terms: [
      { label: "40% prepayment", percent: 40 },
      { label: "40% on delivery", percent: 40 },
      { label: "20% on completion", percent: 20 },
    ],
  },
];
