"use client";

import { useEffect, useRef } from "react";

const STYLES = [
  { value: "classic", label: "Classic" },
  { value: "macos", label: "macOS" },
  { value: "ios26", label: "iOS 26" },
] as const;

type ThemeStyle = (typeof STYLES)[number]["value"];

function isThemeStyle(value: string | null): value is "macos" | "ios26" {
  return value === "macos" || value === "ios26";
}

/**
 * A second axis from light/dark (see ThemeToggle): which visual style is
 * active, via [data-theme] on <html>. Deliberately uncontrolled (defaultValue
 * rather than value) for the same reason ThemeToggle keeps its state in the
 * DOM rather than React: the server can't know the stored choice, so
 * rendering a controlled <select> whose value depends on it either mismatches
 * the server's markup or — as hit live while building this — silently loses
 * the mismatch-recovery race and never corrects itself, since React's
 * hydration of a controlled <select>'s selected option is unreliable when it
 * disagrees with the server-rendered one. Instead this renders "classic"
 * unconditionally (matching the server exactly, zero mismatch) and an effect
 * corrects the DOM directly afterward — a real synchronization with an
 * external system, not state React should own.
 */
export function ThemeStyleSwitcher() {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (selectRef.current && isThemeStyle(current)) {
      selectRef.current.value = current;
    }
  }, []);

  function change(next: ThemeStyle) {
    if (next === "classic") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
    try {
      localStorage.setItem("themeStyle", next);
    } catch {
      // Private mode with storage disabled: the choice just won't persist.
    }
  }

  return (
    <select
      ref={selectRef}
      defaultValue="classic"
      onChange={(e) => change(e.target.value as ThemeStyle)}
      aria-label="Visual theme"
      className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium outline-none transition hover:bg-surface"
    >
      {STYLES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
