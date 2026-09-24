"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const MARGIN = 8;

/**
 * Hover/focus tooltip for things a label already exists for but isn't
 * visible — icon-only buttons, chiefly, which already carry an aria-label
 * for screen readers but nothing a sighted mouse user can see without
 * guessing what the icon means.
 *
 * Rendered into a portal at `document.body` and positioned with `fixed`
 * coordinates read from the trigger's own bounding rect, rather than the
 * simpler `group-hover` + `absolute` CSS pattern: most of this app's icon
 * buttons live inside `overflow-x-auto` table wrappers, and per the CSS
 * spec setting only `overflow-x: auto` implicitly makes `overflow-y: auto`
 * too — an absolutely-positioned tooltip that pokes outside the row gets
 * clipped by the container (confirmed empirically against the budget-lines
 * table). Escaping to a body-level portal sidesteps that entirely; the
 * horizontal clamp below keeps it inside the browser viewport too.
 */
export function Tooltip({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
  }

  // Keep the whole bubble on screen, not just its centre — a long label next
  // to the viewport edge (e.g. a project's attention reason) otherwise gets
  // its first or last words cut off. Needs the rendered width, so it runs
  // after layout but before paint, writing the corrected position straight
  // to the DOM (no extra render, no visible jump).
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!pos || !bubble) return;
    const half = bubble.offsetWidth / 2;
    const left = Math.min(
      Math.max(pos.left, MARGIN + half),
      window.innerWidth - MARGIN - half,
    );
    bubble.style.left = `${left}px`;
  }, [pos]);
  function hide() {
    setPos(null);
  }

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
