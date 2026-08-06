"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createExpense, deleteExpense, patchExpense } from "@/app/(app)/budgets/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { BudgetLine, Expense } from "@/lib/db/budgets";

export function ExpenseList({
  projectId,
  currency,
  expenses,
  lines,
  canEdit,
  canDelete,
}: {
  projectId: string;
  currency: string;
  expenses: Expense[];
  lines: BudgetLine[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [lineId, setLineId] = useState("");
  const [incurredOn, setIncurredOn] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lineName = (id: string | null) =>
    id ? (lines.find((l) => l.id === id)?.category ?? "—") : "Unbudgeted";

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createExpense({
        project_id: projectId,
        budget_line_id: lineId,
        description,
        amount,
        incurred_on: incurredOn,
        vendor: "",
      });
      if (!result.ok) setError(result.error);
      else {
        setDescription("");
        setAmount("");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteExpense(id, projectId);
      if (!result.ok) setError(result.error);
    });
  }

  /**
   * Each input saves only the one field it holds — patchExpense is a true
   * partial update, not a full-row resend. That matters here specifically:
   * this row has four independently-editable fields, and an earlier version
   * that resent the whole row (reconstructed from a possibly-stale snapshot)
   * let editing two different fields within the same fraction of a second
   * have the later save silently overwrite the earlier one with an
   * out-of-date value for the field it wasn't even touching. Also
   * deliberately not disabled by the shared `pending` flag below — that
   * disabled every other input while any one save was in flight and dropped
   * a fast second edit entirely (the same bug, fixed first in BudgetLines).
   */
  function saveEdit(
    expense: Expense,
    field: "description" | "amount" | "incurred_on" | "budget_line_id",
    value: string | number | null,
  ) {
    if (String(value ?? "") === String(expense[field] ?? "")) return;

    startTransition(async () => {
      const result = await patchExpense(expense.id, projectId, {
        [field]: field === "amount" ? String(value) : value,
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      {expenses.length === 0 ? (
        <EmptyState message="Nothing spent yet." />
      ) : (
        <div className="divide-y divide-border">
          {expenses.map((expense) =>
            canEdit ? (
              <div
                key={expense.id}
                className="flex flex-wrap items-center gap-2 px-5 py-3"
              >
                <Input
                  key={`desc-${expense.id}-${expense.description}`}
                  defaultValue={expense.description}
                  onBlur={(e) => saveEdit(expense, "description", e.target.value)}
                  aria-label={`Description of ${expense.description}`}
                  className="min-w-40 flex-1"
                />
                <Select
                  value={expense.budget_line_id ?? ""}
                  onChange={(e) =>
                    saveEdit(expense, "budget_line_id", e.target.value || null)
                  }
                  className="w-36"
                  aria-label={`Budget line for ${expense.description}`}
                >
                  <option value="">Unbudgeted</option>
                  {lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.category}
                    </option>
                  ))}
                </Select>
                <Input
                  type="date"
                  value={expense.incurred_on}
                  onChange={(e) => saveEdit(expense, "incurred_on", e.target.value)}
                  className="w-40"
                  aria-label={`Date of ${expense.description}`}
                />
                <Input
                  key={`amount-${expense.id}-${expense.amount}`}
                  defaultValue={String(expense.amount)}
                  onBlur={(e) => saveEdit(expense, "amount", e.target.value)}
                  inputMode="decimal"
                  aria-label={`Amount for ${expense.description}`}
                  className="w-28 text-right"
                />
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(expense.id)}
                    disabled={pending}
                    aria-label={`Delete ${expense.description}`}
                    className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              <div key={expense.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {expense.description}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(expense.incurred_on)} · {lineName(expense.budget_line_id)}
                    {expense.vendor ? ` · ${expense.vendor}` : ""}
                  </p>
                </div>
                <span className="tabular-nums text-sm">
                  {formatMoney(expense.amount, currency)}
                </span>
              </div>
            ),
          )}
        </div>
      )}

      {canEdit && (
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4"
        >
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was bought"
            required
            className="min-w-40 flex-1"
          />
          <Select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className="w-40"
            aria-label="Budget line"
          >
            <option value="">Unbudgeted</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.category}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={incurredOn}
            onChange={(e) => setIncurredOn(e.target.value)}
            className="w-40"
            aria-label="Date incurred"
          />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            inputMode="decimal"
            required
            className="w-32"
            aria-label="Amount"
          />
          <Button type="submit" size="sm" busy={pending}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </form>
      )}

      {error && (
        <div className="px-5 py-3">
          <Notice>{error}</Notice>
        </div>
      )}
    </div>
  );
}
