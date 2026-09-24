"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  addPaymentTerms,
  deletePaymentTerm,
  patchPaymentTerm,
  type PaymentTermPatch,
} from "@/app/(app)/payments/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import { Badge, EmptyState } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_TEMPLATES,
  isPaymentOverdue,
  paymentTotals,
  type PaymentStatus,
  type PaymentTerm,
} from "@/lib/payments";

const STATUS_CLASS: Record<PaymentStatus, string> = {
  pending: "",
  invoiced: "text-primary",
  paid: "text-success",
};

export function PaymentTerms({
  projectId,
  currency,
  contractValue,
  terms,
  canEdit,
  canDelete,
}: {
  projectId: string;
  currency: string;
  /** The project's budget total — what percent-based terms are taken of. */
  contractValue: number;
  terms: PaymentTerm[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [label, setLabel] = useState("");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totals = paymentTotals(terms);
  const money = (n: number) => formatMoney(n, currency);

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addPaymentTerms(projectId, [
        { label, percent, amount, due_date: dueDate },
      ]);
      if (!result.ok) setError(result.error);
      else {
        setLabel("");
        setPercent("");
        setAmount("");
        setDueDate("");
      }
    });
  }

  function applyTemplate(index: number) {
    setError(null);
    startTransition(async () => {
      const result = await addPaymentTerms(projectId, PAYMENT_TEMPLATES[index].terms);
      if (!result.ok) setError(result.error);
    });
  }

  /**
   * One field per save, on blur/change — same reasoning as BudgetLines: a
   * whole-row resend would let two quick edits overwrite each other, and
   * inputs aren't disabled on the shared `pending` flag for the same reason.
   */
  function save(term: PaymentTerm, patch: PaymentTermPatch) {
    const [field, value] = Object.entries(patch)[0];
    if (String(term[field as keyof PaymentTerm] ?? "") === String(value ?? "")) return;
    startTransition(async () => {
      const result = await patchPaymentTerm(term.id, projectId, patch);
      if (!result.ok) setError(result.error);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePaymentTerm(id, projectId);
      if (!result.ok) setError(result.error);
    });
  }

  const mismatch =
    terms.length > 0 && contractValue > 0 && Math.abs(totals.scheduled - contractValue) >= 0.01;

  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border px-5 py-4 text-sm sm:grid-cols-4">
        <Figure label="Contract value" value={contractValue > 0 ? money(contractValue) : "—"} />
        <Figure label="Received" value={money(totals.received)} tone="success" />
        <Figure label="Outstanding" value={money(totals.outstanding)} />
        <Figure
          label="Overdue"
          value={money(totals.overdue)}
          tone={totals.overdue > 0 ? "danger" : undefined}
        />
      </dl>

      {mismatch && (
        <p className="border-b border-border px-5 py-2 text-xs text-warning">
          Payment terms add up to {money(totals.scheduled)}, but the contract value is{" "}
          {money(contractValue)}.
        </p>
      )}

      {terms.length === 0 ? (
        <div>
          <EmptyState message="No payment terms yet." />
          {canEdit && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-5 pb-5">
              <span className="text-xs text-muted">Quick setup:</span>
              {PAYMENT_TEMPLATES.map((t, i) => (
                <Button
                  key={t.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || contractValue <= 0}
                  onClick={() => applyTemplate(i)}
                >
                  {t.name}
                </Button>
              ))}
              {contractValue <= 0 && (
                <p className="w-full text-center text-xs text-muted">
                  Quick setup needs a budget total to work amounts out from — add budget
                  lines first, or enter each payment below.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Invoice no.</th>
                <th className="px-3 py-2 font-medium">Paid on</th>
                {canDelete && <th className="w-12 px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {terms.map((term) => {
                const overdue = isPaymentOverdue(term);
                return (
                  <tr key={term.id}>
                    <td className="px-5 py-2">
                      {canEdit ? (
                        <Input
                          key={`label-${term.id}-${term.label}`}
                          defaultValue={term.label}
                          onBlur={(e) => save(term, { label: e.target.value })}
                          aria-label="Payment name"
                          className="min-w-44"
                        />
                      ) : (
                        term.label
                      )}
                      {term.percent !== null && (
                        <p className="mt-0.5 text-xs text-muted">{term.percent}% of contract</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {canEdit ? (
                        <Input
                          key={`amount-${term.id}-${term.amount}`}
                          defaultValue={String(term.amount)}
                          onBlur={(e) => save(term, { amount: e.target.value })}
                          inputMode="decimal"
                          aria-label={`Amount for ${term.label}`}
                          className="w-32 text-right"
                        />
                      ) : (
                        money(term.amount)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <Input
                          key={`due-${term.id}-${term.due_date}`}
                          type="date"
                          defaultValue={term.due_date ?? ""}
                          onChange={(e) => save(term, { due_date: e.target.value })}
                          aria-label={`Due date for ${term.label}`}
                          className={cn("w-38", overdue && "border-danger text-danger")}
                        />
                      ) : (
                        <span className={overdue ? "text-danger" : ""}>{formatDate(term.due_date)}</span>
                      )}
                      {overdue && (
                        <div className="mt-1">
                          <Badge tone="danger">Overdue</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <Select
                          key={`status-${term.id}-${term.status}`}
                          defaultValue={term.status}
                          onChange={(e) => save(term, { status: e.target.value as PaymentStatus })}
                          aria-label={`Status of ${term.label}`}
                          className={cn("w-32 font-medium", STATUS_CLASS[term.status])}
                        >
                          <option value="pending">Pending</option>
                          <option value="invoiced">Invoiced</option>
                          <option value="paid">Paid</option>
                        </Select>
                      ) : (
                        <span className={cn("font-medium", STATUS_CLASS[term.status])}>
                          {PAYMENT_STATUS_LABEL[term.status]}
                        </span>
                      )}
                      {term.invoiced_on && term.status !== "pending" && (
                        <p className="mt-0.5 text-xs text-muted">
                          Invoiced {formatDate(term.invoiced_on)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <Input
                          key={`inv-${term.id}-${term.invoice_no}`}
                          defaultValue={term.invoice_no ?? ""}
                          onBlur={(e) => save(term, { invoice_no: e.target.value })}
                          placeholder="EVT26IV…"
                          aria-label={`Invoice number for ${term.label}`}
                          className="w-36"
                        />
                      ) : (
                        term.invoice_no ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {term.status === "paid" && canEdit ? (
                        <Input
                          key={`paid-${term.id}-${term.paid_on}`}
                          type="date"
                          defaultValue={term.paid_on ?? ""}
                          onChange={(e) => save(term, { paid_on: e.target.value })}
                          aria-label={`Date ${term.label} was paid`}
                          className="w-38"
                        />
                      ) : (
                        <span className="text-muted">{formatDate(term.paid_on)}</span>
                      )}
                    </td>
                    {canDelete && (
                      <td className="px-3 py-2 text-right">
                        <Tooltip label={`Delete ${term.label}`}>
                          <button
                            type="button"
                            onClick={() => remove(term.id)}
                            disabled={pending}
                            aria-label={`Delete ${term.label}`}
                            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-danger"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </Tooltip>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4"
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Payment, e.g. 50% prepayment"
            required
            className="min-w-48 flex-1"
            aria-label="Payment name"
          />
          <Input
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder="%"
            inputMode="decimal"
            className="w-20"
            aria-label="Percent of contract value"
          />
          <span className="pb-2 text-xs text-muted">or</span>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            inputMode="decimal"
            className="w-32"
            aria-label="Amount"
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-40"
            aria-label="Due date"
          />
          <Button type="submit" size="sm" busy={pending}>
            <Plus className="size-3.5" />
            Add payment
          </Button>
        </form>
      )}

      {error && (
        <div className="px-5 pb-4">
          <Notice>{error}</Notice>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
