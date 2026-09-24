import { Wallet } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentSummary } from "@/lib/payments";

/**
 * A project card's payment line: what's been received out of the total, a
 * bar for it, and the one thing worth knowing next (fully paid / overdue /
 * invoiced and waiting / next instalment due).
 */
export function PaymentStatus({
  summary,
  currency,
}: {
  summary: PaymentSummary;
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, currency);

  if (summary.state === "none") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Wallet className="size-3.5" aria-hidden />
        No payment terms yet
      </p>
    );
  }

  const pct = summary.scheduled > 0 ? (summary.received / summary.scheduled) * 100 : 0;

  const status =
    summary.state === "paid"
      ? { text: "Fully paid", tone: "text-success" }
      : summary.state === "overdue"
        ? { text: `${money(summary.overdue)} overdue`, tone: "text-danger" }
        : summary.state === "invoiced"
          ? { text: `Invoiced, awaiting ${money(summary.awaiting)}`, tone: "text-primary" }
          : summary.nextDue
            ? {
                text: `Next ${money(summary.nextDue.amount)} due ${formatDate(summary.nextDue.date)}`,
                tone: "text-muted",
              }
            : { text: "Not yet invoiced", tone: "text-muted" };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <Wallet className="size-3.5" aria-hidden />
          Paid {money(summary.received)} of {money(summary.scheduled)}
        </span>
        <span className={cn("font-medium", status.tone)}>{status.text}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Share of payments received"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full transition-all",
            summary.state === "overdue" ? "bg-danger" : "bg-success",
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
