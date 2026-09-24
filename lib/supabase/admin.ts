import { createClient } from "@supabase/supabase-js";

/**
 * SERVICE ROLE client — bypasses RLS entirely. AGENTS.md's rule is that the
 * service-role key stays in offline scripts only; this file holds the
 * deliberate, narrow exceptions to that, and every caller is responsible for
 * its own authorization since this client answers to nobody:
 *
 * - app/(app)/settings/actions.ts's inviteMember — needs Supabase Auth's
 *   admin API (auth.admin.inviteUserByEmail) to invite someone who hasn't
 *   registered yet, and nothing short of the service role can call that.
 *   Always calls requireRole() first (a real signed-in session exists here).
 * - app/api/cron/keep-alive/route.ts — a scheduled ping with no user session
 *   at all to authorize against (Vercel Cron calls it directly, cookieless),
 *   so an RLS-scoped client isn't an option regardless of role-checking.
 *
 * `db.schema` matches the other two Supabase clients (lib/supabase/server.ts,
 * lib/supabase/client.ts) — harmless for inviteMember, which only calls the
 * auth admin API and never queries a table, but required for any caller that
 * does, since this app's tables live in `tracker`, not `public`.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "tracker" } },
  );
}
