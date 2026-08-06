import { createClient } from "@supabase/supabase-js";

/**
 * SERVICE ROLE client — bypasses RLS entirely. AGENTS.md's rule is that the
 * service-role key stays in offline scripts only; this file is the one
 * deliberate, narrow exception. Inviting someone who hasn't registered yet
 * needs Supabase Auth's admin API (auth.admin.inviteUserByEmail), and
 * nothing short of the service role can call it.
 *
 * Import this from exactly one place — app/(app)/settings/actions.ts's
 * inviteMember — and always call requireRole() first. This client answers
 * to nobody, so every caller is responsible for its own authorization.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
