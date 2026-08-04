import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Wallet,
  Files,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The sidebar, in order. One entry per module in TASKS.md. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/files", label: "Files", icon: Files },
  { href: "/settings", label: "Settings", icon: Settings },
];
