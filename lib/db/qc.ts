import { createClient } from "@/lib/supabase/server";

/**
 * QC inspection grid: rows are work items, columns are physical units (e.g.
 * pipe support CT-01..CT-36), each cell independently pass/fail/not-yet.
 * "Not yet inspected" is the absence of a qc_results row, not a third value.
 */

export interface QcItem {
  id: string;
  project_id: string;
  item_no: string | null;
  description: string;
  sort_order: number;
}

export interface QcUnit {
  id: string;
  project_id: string;
  label: string;
  sort_order: number;
}

export type QcCellResult = "pass" | "fail";

export interface QcResult {
  qc_item_id: string;
  qc_unit_id: string;
  result: QcCellResult;
}

export interface QcGrid {
  items: QcItem[];
  units: QcUnit[];
  results: QcResult[];
}

export async function getQcGrid(
  projectId: string,
  workspaceId: string,
): Promise<QcGrid> {
  const db = await createClient();

  const [itemsResult, unitsResult] = await Promise.all([
    db
      .from("qc_items")
      .select("id, project_id, item_no, description, sort_order")
      .eq("project_id", projectId)
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .returns<QcItem[]>(),
    db
      .from("qc_units")
      .select("id, project_id, label, sort_order")
      .eq("project_id", projectId)
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .returns<QcUnit[]>(),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (unitsResult.error) throw new Error(unitsResult.error.message);

  const items = itemsResult.data ?? [];
  const itemIds = items.map((i) => i.id);

  // No items means no results can exist for this project — skip the query
  // rather than send an .in() with an empty list.
  let results: QcResult[] = [];
  if (itemIds.length > 0) {
    const { data, error } = await db
      .from("qc_results")
      .select("qc_item_id, qc_unit_id, result")
      .eq("workspace_id", workspaceId)
      .in("qc_item_id", itemIds)
      .returns<QcResult[]>();
    if (error) throw new Error(error.message);
    results = data ?? [];
  }

  return { items, units: unitsResult.data ?? [], results };
}
