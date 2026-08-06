import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/layout/shell";

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
