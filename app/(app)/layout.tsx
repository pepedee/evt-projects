import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/layout/shell";

/**
 * Every screen in here reads live data.
 *
 * This used to be implied: the Supabase client read cookies, which opted each
 * page out of static rendering. The service-role client reads no cookies, so
 * without this Next would prerender these pages at build time and serve a
 * frozen snapshot of the database — or fail the build trying to reach it.
 */
export const dynamic = "force-dynamic";

/**
 * Everything under (app) is behind a session. proxy.ts already redirects
 * anonymous requests; requireUser() is the second gate, and it is what
 * resolves the workspace the rest of the tree renders from.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return <Shell user={user}>{children}</Shell>;
}
