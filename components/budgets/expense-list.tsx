"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createExpense, deleteExpense } from "@/app/(app)/budgets/actions";
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

  return (
    <div>
      {expenses.length === 0 ? (
        <EmptyState message="Nothing spent yet." />
      ) : (
        <div className="divide-y divide-border">
          {expenses.map((expense) => (
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
          ))}
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
