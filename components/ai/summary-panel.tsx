"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button, Notice } from "@/components/ui/form";
import { Badge } from "@/components/ui/card";
import { SUMMARY_KINDS, SUMMARY_LABEL, type SummaryKind } from "@/lib/summaries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Phase = "idle" | "thinking" | "writing" | "done";

/**
 * Streams a summary from /api/ai/summary and renders it as it arrives.
 *
 * The route speaks newline-delimited JSON rather than raw text so the panel can
 * tell the model's thinking pause apart from the answer — with thinking on and
 * its text omitted, a raw-text stream would sit silent for several seconds and
 * look like a hang.
 */
export function SummaryPanel({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState<SummaryKind>("project_status");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(next: SummaryKind) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setKind(next);
    setText("");
    setError(null);
    setCachedAt(null);
    setPhase("thinking");

    try {
      const response = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, kind: next }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // NDJSON can split a line across chunks, so keep the remainder.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          if (!raw.trim()) continue;
          const event = JSON.parse(raw);

          if (event.type === "status" && event.value === "thinking") {
            setPhase("thinking");
          } else if (event.type === "delta") {
            setPhase("writing");
            setText((prev) => prev + event.text);
          } else if (event.type === "error") {
            setError(event.message);
            setPhase("done");
          } else if (event.type === "done") {
            if (event.cached) setCachedAt(event.created_at ?? null);
            setPhase("done");
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
      setPhase("done");
    }
  }

  const busy = phase === "thinking" || phase === "writing";

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {SUMMARY_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            onClick={() => run(option)}
            aria-current={option === kind ? "true" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60",
              option === kind
                ? "border-primary text-primary"
                : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {SUMMARY_LABEL[option]}
          </button>
        ))}

        {cachedAt && (
          <Badge tone="neutral">Cached · {formatDateTime(cachedAt)}</Badge>
        )}
      </div>

      {phase === "idle" && (
        <p className="text-sm text-muted">
          Pick a summary above. The model reads only this project&apos;s own
          data, and never changes anything.
        </p>
      )}

      {phase === "thinking" && text.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          Thinking…
        </p>
      )}

      {text && (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {text}
          {phase === "writing" && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" />
          )}
        </div>
      )}

      {error && <Notice>{error}</Notice>}

      {phase === "done" && !error && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => run(kind)}
        >
          <Sparkles className="size-3.5" />
          Regenerate
        </Button>
      )}
    </div>
  );
}
