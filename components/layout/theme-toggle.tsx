"use client";

import { Moon, Sun } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Flips the `dark` class on <html> and remembers the choice, so the user can
 * override their operating system preference. The inline script in
 * app/layout.tsx applies the stored value before first paint.
 *
 * The current theme lives in the DOM, not in React state — mirroring it here
 * would mean reading the class in an effect and re-rendering, and would risk a
 * hydration mismatch since the server cannot know it. CSS picks the icon.
 */
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private mode with storage disabled: the theme just won't persist.
    }
  }

  return (
    <Tooltip label="Toggle light or dark theme">
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle light or dark theme"
        className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
      >
        <Moon className="size-4 dark:hidden" />
        <Sun className="hidden size-4 dark:block" />
      </button>
    </Tooltip>
  );
}
