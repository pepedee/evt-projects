import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Vercel Cron hits this on a schedule (see vercel.json) purely to generate
 * real Postgres activity — Supabase's free tier auto-pauses a project after
 * ~7 days with none, which has already locked the owner out of the app
 * twice. A lightweight, genuinely-read query is the point: it has to
 * actually touch the database, not just call an auth/health endpoint that
 * might not count toward Supabase's own activity tracking.
 *
 * If CRON_SECRET is set in the Vercel project's env vars, Vercel sends it
 * back as this request's bearer token automatically and this route checks
 * it; without one set, the check is skipped and the route still works —
 * worth adding since this is otherwise a public, unauthenticated GET, even
 * though it only ever reads a row count.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("workspaces")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("keep-alive ping failed", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.log(`keep-alive ping ok, ${count} workspace(s)`);
  return NextResponse.json({ ok: true, workspaces: count, at: new Date().toISOString() });
}
