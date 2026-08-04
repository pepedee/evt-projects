import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/types";

/**
 * Append a line to the audit trail.
 *
 * Deliberately swallows its own errors: failing to log must never roll back
 * the change the user actually asked for. The table is append-only by RLS,
 * so nothing here can rewrite history either.
 */
export async function logActivity(
  user: SessionUser,
  entry: {
    entity: string;
    entityId?: string | null;
    action: "create" | "update" | "delete" | "upload" | "export" | "ai_summary";
    summary?: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  try {
    const db = await createClient();
    await db.from("activity_logs").insert({
      workspace_id: user.workspaceId,
      actor_id: user.id,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      action: entry.action,
      summary: entry.summary ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  } catch (err) {
    console.error("activity log write failed", err);
  }
}
