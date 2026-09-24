import { TriangleAlert } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { HEALTH_LABEL } from "@/lib/health";
import { cn } from "@/lib/utils";
import type { Health } from "@/lib/types";

/**
 * Warning triangle next to the name of a project that needs attention —
 * amber for at risk, red for off track — with the reason on hover, so the
 * "Needing attention" projects stand out in a long list without opening
 * each one.
 */
export function AttentionMark({
  health,
  reason,
  size = "md",
}: {
  health: Health;
  reason: string | null;
  size?: "md" | "lg";
}) {
  if (health === "on_track") return null;
  const label = `${HEALTH_LABEL[health]}${reason ? ` — ${reason}` : ""}`;
  return (
    <Tooltip label={label} className="relative z-10 shrink-0">
      <TriangleAlert
        role="img"
        aria-label={label}
        className={cn(
          health === "off_track" ? "fill-danger/15 text-danger" : "fill-warning/15 text-warning",
          size === "lg" ? "size-6" : "size-5",
        )}
      />
    </Tooltip>
  );
}
