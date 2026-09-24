import { CircleCheck } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Green check shown next to a completed project's name. */
export function DoneMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <Tooltip label="Done — project completed" className="relative z-10 shrink-0">
      <CircleCheck
        role="img"
        aria-label="Done"
        className={cn("fill-success/15 text-success", size === "lg" ? "size-6" : "size-5")}
      />
    </Tooltip>
  );
}
