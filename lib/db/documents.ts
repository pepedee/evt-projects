import { createClient } from "@/lib/supabase/server";

export interface DocumentRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  task_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  version: number;
  replaces_id: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  projects: { name: string } | null;
}

const SELECT =
  "id, workspace_id, project_id, task_id, file_name, storage_path, mime_type, " +
  "size_bytes, version, replaces_id, description, uploaded_by, created_at, " +
  "projects(name)";

export async function listDocuments(filters: {
  projectId?: string;
  search?: string;
} = {}): Promise<DocumentRow[]> {
  const db = await createClient();

  let query = db.from("documents").select(SELECT);

  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.search?.trim()) {
    query = query.ilike("file_name", `%${filters.search.trim()}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .returns<DocumentRow[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}
