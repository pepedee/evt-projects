import { cn } from "@/lib/utils";

export function Card({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // min-w-0 matters whenever a Card is a grid or flex child. Both default
    // those children to min-width:auto, which refuses to shrink below the
    // content's min-content width — so one long word or an unbreakable figure
    // inside a card widens the whole track and scrolls the page sideways on a
    // phone. Harmless on a Card in normal flow.
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-surface",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{message}</p>;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "success" && "bg-success/15 text-success",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "primary" && "bg-primary/15 text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
