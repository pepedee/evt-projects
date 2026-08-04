"use client";

/**
 * Last-resort boundary: catches failures in the root layout itself, where the
 * normal error boundary has no shell to render into. It must supply its own
 * <html> and <body>, and cannot rely on the app's CSS variables loading, so
 * the styling here is deliberately self-contained.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>
            AI Project Tracker could not start
          </h1>
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
            {error.digest ? `Reference: ${error.digest}` : "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #e2e8f0",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
