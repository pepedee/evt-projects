import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Which existing semantic token colours the tile's icon chip. Reuses tokens
 * that already exist and are already validated across every theme/light/dark
 * combination — no new CSS variables to maintain. */
const ACCENT_VAR = {
  primary: "--primary",
  info: "--chart-1",
  warning: "--warning",
  danger: "--danger",
} as const;

type Accent = keyof typeof ACCENT_VAR;

/**
 * A headline number. Deliberately not a one-bar chart.
 *
 * The value uses the default proportional figures — tabular-nums is for
 * columns that must align vertically, not for a standalone figure.
 */
export function StatTile({
  label,
  value,
  hint,
  href,
  tone,
  icon: Icon,
  accent = "primary",
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: "critical";
  icon: LucideIcon;
  accent?: Accent;
}) {
  const cssVar = ACCENT_VAR[tone === "critical" ? "danger" : accent];

  const body = (
    <Card className="h-full p-5 transition hover:border-primary">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p
            className={
              tone === "critical"
                ? "mt-2 text-3xl font-semibold text-[var(--chart-critical)]"
                : "mt-2 text-3xl font-semibold"
            }
          >
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `color-mix(in srgb, var(${cssVar}) 15%, var(--surface))`,
            color: `var(${cssVar})`,
          }}
        >
          <Icon size={20} aria-hidden />
        </span>
      </div>
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}
