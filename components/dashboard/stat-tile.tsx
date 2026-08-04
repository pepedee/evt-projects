import Link from "next/link";
import { Card } from "@/components/ui/card";

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
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: "critical";
}) {
  const body = (
    <Card className="h-full p-5 transition hover:border-primary">
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
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}
