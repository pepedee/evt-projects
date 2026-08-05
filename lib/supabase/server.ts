import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients. SERVER ONLY.
 *
 * The app has no authentication (see 0012_open_access.sql), so there is no
 * user session to carry and no cookies to read. Instead the server connects
 * with the service-role key.
 *
 * That key bypasses Row Level Security and must never reach the browser.
 * Nothing under lib/db/, lib/ai/ or lib/reports/ may be imported from a client
 * component — every database read and write goes through a server component,
 * a server action, or a route handler.
 *
 * The practical consequence of removing auth: the app itself is the only gate.
 * Anyone who can reach it can read and write everything. Keep the deployment
 * private.
 */

function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local — server-side only, never prefixed NEXT_PUBLIC_.",
    );
  }
  return key;
}

const options = {
  auth: { persistSession: false, autoRefreshToken: false },
};

/** Client scoped to the `tracker` schema. */
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey(),
    { ...options, db: { schema: "tracker" } },
  );
}

/** Client on the default `public` schema — used for Storage. */
export async function createAuthClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey(),
    options,
  );
}
