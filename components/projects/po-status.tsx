"use client";

import { useState, useTransition } from "react";
import { FileCheck2, FileClock, FileX2 } from "lucide-react";
import { setProjectPoStatus } from "@/app/(app)/projects/actions";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { PO_STATUS_LABEL, type PoStatus } from "@/lib/types";

const STYLE: Record<PoStatus, { icon: typeof FileCheck2; className: string }> = {
  received: { icon: FileCheck2, className: "bg-success/15 text-success" },
  waiting: { icon: FileClock, className: "bg-warning/15 text-warning" },
  lost: { icon: FileX2, className: "bg-danger/15 text-danger" },
};

/** "PO received · PO 325101495" / "Waiting for PO" / "LOST" as a pill. */
export function PoBadge({
  status,
  number,
  date,
}: {
  status: PoStatus;
  number?: string | null;
  date?: string | null;
}) {
  const { icon: Icon, className } = STYLE[status];
  const detail =
    status === "received" && (number || date)
      ? ` · ${number ? `PO ${number}` : ""}${number && date ? ", " : ""}${date ? formatDate(date) : ""}`
      : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {PO_STATUS_LABEL[status]}
      {detail && <span className="font-medium">{detail}</span>}
    </span>
  );
}

/**
 * The project page's one-click PO status switch, so marking a quotation won
 * or lost doesn't need the whole edit form. Styled as the badge it sets.
 */
export function PoStatusSelect({
  projectId,
  status,
}: {
  projectId: string;
  status: PoStatus;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: PoStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setProjectPoStatus(projectId, next);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        // Remount when the server confirms, so a failed change snaps back.
        key={status}
        defaultValue={status}
        disabled={pending}
        onChange={(e) => change(e.target.value as PoStatus)}
        aria-label="Customer PO status"
        className={cn(
          "cursor-pointer rounded-full border-0 py-0.5 pl-2 pr-6 text-xs font-semibold outline-none disabled:opacity-60",
          STYLE[status].className,
        )}
      >
        <option value="waiting">{PO_STATUS_LABEL.waiting}</option>
        <option value="received">{PO_STATUS_LABEL.received}</option>
        <option value="lost">{PO_STATUS_LABEL.lost}</option>
      </select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
