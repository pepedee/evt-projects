"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createBudgetLine, deleteBudgetLine } from "@/app/(app)/budgets/actions";
import { Button, Input, Notice } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { BudgetLine } from "@/lib/db/budgets";

export function BudgetLines({
  projectId,
  currency,
  lines,
  spentUnassigned,
  canEdit,
  canDelete,
}: {
  projectId: string;
  currency: string;
  lines: BudgetLine[];
  spentUnassigned: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBudgetLine({
        project_id: projectId,
        category,
        description: "",
        planned_amount: amount,
      });
      if (!result.ok) setError(result.error);
      else {
        setCategory("");
        setAmount("");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteBudgetLine(id, projectId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      {lines.length === 0 && spentUnassigned === 0 ? (
        <EmptyState message="No budget lines yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">Category</th>
                <th className="px-5 py-2 text-right font-medium">Planned</th>
                <th className="px-5 py-2 text-right font-medium">Spent</th>
                <th className="px-5 py-2 text-right font-medium">Variance</th>
                {canDelete && <th className="w-12 px-5 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{line.category}</p>
                    {line.description && (
                      <p className="text-xs text-muted">{line.description}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatMoney(line.planned_amount, currency)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatMoney(line.spent_total, currency)}
                  </td>
                  <td
                    className={
                      line.variance < 0
                        ? "px-5 py-3 text-right tabular-nums text-danger"
                        : "px-5 py-3 text-right tabular-nums text-success"
                    }
                  >
                    {formatMoney(line.variance, currency)}
                  </td>
                  {canDelete && (
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => remove(line.id)}
                        disabled={pending}
                        aria-label={`Delete ${line.category}`}
                        className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {/* Money spent against no plan. Worth showing loudly rather than
                  hiding it in the project total. */}
              {spentUnassigned > 0 && (
                <tr>
                  <td className="px-5 py-3 text-muted italic">Unbudgeted</td>
                  <td className="px-5 py-3 text-right text-muted">—</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatMoney(spentUnassigned, currency)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-danger">
                    {formatMoney(-spentUnassigned, currency)}
                  </td>
                  {canDelete && <td />}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4">
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category, e.g. Materials"
            required
            className="min-w-40 flex-1"
          />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Planned"
            inputMode="decimal"
            required
            className="w-32"
            aria-label="Planned amount"
          />
          <Button type="submit" size="sm" busy={pending}>
            <Plus className="size-3.5" />
            Add line
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
