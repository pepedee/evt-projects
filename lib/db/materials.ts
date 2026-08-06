import { createClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/db/projects";

/**
 * Materials/procurement queries. Distinct from budget_lines/expenses: those
 * track planned-vs-actual money, this tracks whether a physical item has
 * actually been ordered and shows up on site.
 */

export type MaterialStatus = "needed" | "ordered" | "received" | "installed";

export interface Material {
  id: string;
  project_id: string;
  name: string;
  qty: number;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  status: MaterialStatus;
  notes: string | null;
  sort_order: number;
}

export async function listMaterials(
  projectId: string,
  workspaceId: string,
): Promise<Material[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("materials")
    .select("id, project_id, name, qty, unit_cost, supplier, status, notes, sort_order")
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const qty = toNumber(row.qty);
    const unit_cost = toNumber(row.unit_cost);
    return {
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      qty,
      unit_cost,
      total_cost: qty * unit_cost,
      supplier: row.supplier,
      status: row.status as MaterialStatus,
      notes: row.notes,
      sort_order: row.sort_order,
    };
  });
}
