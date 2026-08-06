"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { switchWorkspace } from "@/app/(app)/settings/actions";
import { NAV_ITEMS } from "@/lib/nav";
import { ROLE_LABEL, type SessionUser } from "@/lib/types";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ThemeStyleSwitcher } from "@/components/layout/theme-style-switcher";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type { MyWorkspace } from "@/lib/db/workspace";

/**
 * Sidebar and topbar share the mobile open/closed state, so they live in one
 * client component. Everything inside `children` stays a server component.
 */
export function Shell({
  user,
  workspaces,
  children,
}: {
  user: SessionUser;
  workspaces: MyWorkspace[];
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  // Escape closes the drawer. Without this the only way out on a phone is to
  // hit the scrim, which is not reachable from a keyboard.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  function changeWorkspace(workspaceId: string) {
    if (workspaceId === user.workspaceId) return;
    startSwitch(async () => {
      const result = await switchWorkspace(workspaceId);
      if (result.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  // Almost everyone belongs to exactly one workspace — only pay for the
  // dropdown's extra chrome when there's actually something to switch
  // between.
  const workspaceLabel =
    workspaces.length > 1 ? (
      <Select
        value={user.workspaceId}
        disabled={switching}
        onChange={(e) => changeWorkspace(e.target.value)}
        aria-label="Switch workspace"
        className="w-auto min-w-0 truncate py-1 text-sm font-semibold"
      >
        {workspaces.map((w) => (
          <option key={w.workspace_id} value={w.workspace_id}>
            {w.name}
          </option>
        ))}
      </Select>
    ) : (
      <span className="truncate font-semibold">{user.workspaceName}</span>
    );

  return (
    <div className="min-h-screen">
      {/* Lets a keyboard user jump the sidebar instead of tabbing every link
          on every page load. Visible only while focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-fg"
      >
        Skip to content
      </a>

      {/* Scrim behind the mobile drawer. */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
          {workspaceLabel}
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setNavOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-primary text-primary-fg"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-xs text-muted">
            {ROLE_LABEL[user.role]} · {user.email}
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            className="rounded-lg p-2 text-muted hover:bg-surface-2 lg:hidden"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex-1 lg:hidden">{workspaceLabel}</div>

          <div className="ml-auto flex items-center gap-1">
            <ThemeStyleSwitcher />
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                aria-label="Sign out"
                className="flex items-center gap-2 rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-6xl p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
