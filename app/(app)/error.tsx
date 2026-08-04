"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/form";

/**
 * Error boundary for everything behind the login.
 *
 * Deliberately shows `error.message`: the messages that reach here are ours —
 * `requireRole()` refusals and the `throw new Error(error.message)` in
 * lib/db — and they tell the user what to do. Next.js already redacts
 * unexpected server errors to a digest in production, so an internal detail
 * cannot leak through this.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app error boundary", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <AlertTriangle className="mx-auto size-8 text-[var(--chart-critical)]" />
      <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        {error.message || "The page could not be loaded."}
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-muted">Reference: {error.digest}</p>
      )}

      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard">
          <Button variant="outline">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
