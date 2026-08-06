"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createQcItem,
  createQcUnit,
  deleteQcItem,
  deleteQcUnit,
  setQcResult,
} from "@/app/(app)/qc/actions";
import { Button, Input, Notice } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { QcCellResult, QcGrid as QcGridData } from "@/lib/db/qc";

/** blank → pass → fail → blank. */
function nextResult(current: QcCellResult | undefined): QcCellResult | null {
  if (current === undefined) return "pass";
  if (current === "pass") return "fail";
  return null;
}

export function QcGrid({
  projectId,
  grid,
  canEdit,
  canDelete,
}: {
  projectId: string;
  grid: QcGridData;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [itemNo, setItemNo] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resultMap = new Map<string, QcCellResult>();
  for (const r of grid.results) resultMap.set(`${r.qc_item_id}:${r.qc_unit_id}`, r.result);

  function addItem(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createQcItem({
        project_id: projectId,
        item_no: itemNo,
        description: itemDesc,
      });
      if (!result.ok) setError(result.error);
      else {
        setItemNo("");
        setItemDesc("");
      }
    });
  }

  function addUnit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createQcUnit({ project_id: projectId, label: unitLabel });
      if (!result.ok) setError(result.error);
      else setUnitLabel("");
    });
  }

  function removeItem(id: string) {
    startTransition(async () => {
      const result = await deleteQcItem(id, projectId);
      if (!result.ok) setError(result.error);
    });
  }

  function removeUnit(id: string) {
    startTransition(async () => {
      const result = await deleteQcUnit(id, projectId);
      if (!result.ok) setError(result.error);
    });
  }

  function cycleCell(itemId: string, unitId: string) {
    const current = resultMap.get(`${itemId}:${unitId}`);
    const next = nextResult(current);
    startTransition(async () => {
      const result = await setQcResult(itemId, unitId, projectId, next);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 px-5 pt-4 text-xs text-muted">
        <span>Click a cell to cycle: blank → passed → failed → blank</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-success" /> Passed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-danger" /> Failed
        </span>
      </div>

      {grid.items.length === 0 || grid.units.length === 0 ? (
        <div className="px-5 py-4">
          <EmptyState
            message={
              grid.items.length === 0 && grid.units.length === 0
                ? "No QC items or units yet."
                : grid.items.length === 0
                  ? "No QC items yet — add a work item below."
                  : "No units yet — add one below (e.g. a support number)."
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto px-5 pb-2 pt-3">
          <table className="border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-48 max-w-64 bg-surface px-2 py-1 text-left font-medium text-muted">
                  Work item
                </th>
                {grid.units.map((u) => (
                  <th key={u.id} className="w-8 px-0.5 py-1 text-center font-medium text-muted">
                    <span className="block truncate" title={u.label}>
                      {u.label}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removeUnit(u.id)}
                        disabled={pending}
                        aria-label={`Delete unit ${u.label}`}
                        className="mx-auto mt-0.5 block text-muted hover:text-danger"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.items.map((item) => (
                <tr key={item.id}>
                  <td
                    className="sticky left-0 z-10 min-w-48 max-w-64 truncate bg-surface px-2 py-1 text-foreground"
                    title={item.description}
                  >
                    {item.item_no ? `${item.item_no}. ` : ""}
                    {item.description}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={pending}
                        aria-label={`Delete QC item ${item.description}`}
                        className="ml-1.5 inline text-muted hover:text-danger"
                      >
                        <Trash2 className="inline size-3" />
                      </button>
                    )}
                  </td>
                  {grid.units.map((u) => {
                    const cell = resultMap.get(`${item.id}:${u.id}`);
                    return (
                      <td key={u.id} className="p-0">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => cycleCell(item.id, u.id)}
                          aria-label={`${u.label}: ${cell === "pass" ? "Passed" : cell === "fail" ? "Failed" : "Not recorded"}`}
                          className={cn(
                            "size-6 rounded-sm bg-surface-2 transition disabled:cursor-default",
                            canEdit && "hover:ring-2 hover:ring-ring",
                            cell === "pass" && "bg-success",
                            cell === "fail" && "bg-danger",
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-4 border-t border-border px-5 py-4">
          <form onSubmit={addItem} className="flex flex-wrap items-end gap-2">
            <Input
              value={itemNo}
              onChange={(e) => setItemNo(e.target.value)}
              placeholder="Item #"
              className="w-20"
              aria-label="Item number"
            />
            <Input
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              placeholder="Work item description"
              required
              className="min-w-48"
            />
            <Button type="submit" size="sm" busy={pending}>
              <Plus className="size-3.5" />
              Add item
            </Button>
          </form>

          <form onSubmit={addUnit} className="flex flex-wrap items-end gap-2">
            <Input
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              placeholder="Unit label, e.g. CT-01"
              required
              className="w-40"
              aria-label="Unit label"
            />
            <Button type="submit" size="sm" busy={pending}>
              <Plus className="size-3.5" />
              Add unit
            </Button>
          </form>
        </div>
      )}

      {error && (
        <div className="px-5 pb-4">
          <Notice>{error}</Notice>
        </div>
      )}
    </div>
  );
}
