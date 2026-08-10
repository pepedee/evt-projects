"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createMaterial,
  deleteMaterial,
  patchMaterial,
} from "@/app/(app)/materials/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/format";
import type { Material, MaterialStatus } from "@/lib/db/materials";

const STATUS_LABEL: Record<MaterialStatus, string> = {
  needed: "Needed",
  ordered: "Ordered",
  received: "Received",
  installed: "Installed",
};

export function MaterialList({
  projectId,
  currency,
  materials,
  canEdit,
  canDelete,
}: {
  projectId: string;
  currency: string;
  materials: Material[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMaterial({
        project_id: projectId,
        name,
        qty,
        unit_cost: unitCost,
        supplier: "",
      });
      if (!result.ok) setError(result.error);
      else {
        setName("");
        setQty("1");
        setUnitCost("");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteMaterial(id, projectId);
      if (!result.ok) setError(result.error);
    });
  }

  // Partial patches, not full-row resends — same reason as BudgetLines and
  // ExpenseList: this row has several independently-editable fields, and a
  // full-row resend lets a fast edit to one silently overwrite a concurrent
  // edit to another with a stale value.
  function saveEdit(
    material: Material,
    field: "name" | "qty" | "unit_cost" | "supplier" | "status",
    value: string,
  ) {
    if (value === String(material[field] ?? "")) return;
    startTransition(async () => {
      const result = await patchMaterial(material.id, projectId, { [field]: value });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      {materials.length === 0 ? (
        <EmptyState message="No materials logged yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">Item</th>
                <th className="px-5 py-2 text-right font-medium">Qty</th>
                <th className="px-5 py-2 text-right font-medium">Unit cost</th>
                <th className="px-5 py-2 text-right font-medium">Total</th>
                <th className="px-5 py-2 font-medium">Supplier</th>
                <th className="px-5 py-2 font-medium">Status</th>
                {canDelete && <th className="w-12 px-5 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {materials.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3">
                    {canEdit ? (
                      <Input
                        key={`name-${m.id}-${m.name}`}
                        defaultValue={m.name}
                        onBlur={(e) => saveEdit(m, "name", e.target.value)}
                        aria-label={`Item name for ${m.name}`}
                        className="min-w-40 font-medium"
                      />
                    ) : (
                      <p className="font-medium">{m.name}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {canEdit ? (
                      <Input
                        key={`qty-${m.id}-${m.qty}`}
                        defaultValue={String(m.qty)}
                        onBlur={(e) => saveEdit(m, "qty", e.target.value)}
                        inputMode="decimal"
                        aria-label={`Quantity of ${m.name}`}
                        className="w-20 text-right"
                      />
                    ) : (
                      m.qty
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {canEdit ? (
                      <Input
                        key={`unit-cost-${m.id}-${m.unit_cost}`}
                        defaultValue={String(m.unit_cost)}
                        onBlur={(e) => saveEdit(m, "unit_cost", e.target.value)}
                        inputMode="decimal"
                        aria-label={`Unit cost of ${m.name}`}
                        className="w-28 text-right"
                      />
                    ) : (
                      formatMoney(m.unit_cost, currency)
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatMoney(m.total_cost, currency)}
                  </td>
                  <td className="px-5 py-3">
                    {canEdit ? (
                      <Input
                        key={`supplier-${m.id}-${m.supplier}`}
                        defaultValue={m.supplier ?? ""}
                        onBlur={(e) => saveEdit(m, "supplier", e.target.value)}
                        aria-label={`Supplier for ${m.name}`}
                        className="min-w-32"
                      />
                    ) : (
                      (m.supplier ?? "—")
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {canEdit ? (
                      <Select
                        value={m.status}
                        onChange={(e) => saveEdit(m, "status", e.target.value)}
                        aria-label={`Status of ${m.name}`}
                        className="w-32"
                      >
                        {Object.entries(STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      STATUS_LABEL[m.status]
                    )}
                  </td>
                  {canDelete && (
                    <td className="px-5 py-3 text-right">
                      <Tooltip label={`Delete ${m.name}`}>
                        <button
                          type="button"
                          onClick={() => remove(m.id)}
                          disabled={pending}
                          aria-label={`Delete ${m.name}`}
                          className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-danger"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </Tooltip>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name"
            required
            className="min-w-40 flex-1"
          />
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qty"
            inputMode="decimal"
            required
            className="w-20"
            aria-label="Quantity"
          />
          <Input
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="Unit cost"
            inputMode="decimal"
            required
            className="w-28"
            aria-label="Unit cost"
          />
          <Button type="submit" size="sm" busy={pending}>
            <Plus className="size-3.5" />
            Add material
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
