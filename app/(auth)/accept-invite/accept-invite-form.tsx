"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/client";
import { Button, Field, Input, Notice } from "@/components/ui/form";

const MIN_PASSWORD = 8;

type Status = "checking" | "ready" | "invalid";

/**
 * Parsed straight out of window.location.hash rather than left to the SDK's
 * detectSessionInUrl. @supabase/ssr's browser client hardcodes
 * flowType: "pkce" (confirmed by reading its source — createBrowserClient.js
 * always sets it, with no way to override), and a PKCE-mode client's
 * detectSessionInUrl only looks for a ?code= query param. Supabase's own
 * invite-link redirect never produces one — GoTrue's /verify endpoint for
 * type=invite always redirects with the tokens in the URL hash
 * (#access_token=...&refresh_token=...), the older implicit-flow shape —
 * confirmed empirically against this project with auth.admin.generateLink
 * before writing this. So the hash is silently ignored by default and no
 * session ever appears; this reads it manually and calls setSession()
 * ourselves instead of trusting auto-detection.
 */
function readHashTokens(): { access_token: string; refresh_token: string } | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const access_token = hash.get("access_token");
  const refresh_token = hash.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export function AcceptInviteForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(() =>
    readHashTokens() ? "checking" : "invalid",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // React's Strict Mode double-invokes effects in development. Supabase
  // refresh tokens are single-use and rotate on redemption, so a duplicate
  // setSession() call here would consume the token twice — the first call
  // succeeds, the second (now-stale) one fails and would clobber a perfectly
  // good session back to "invalid". This ref makes sure only the first
  // invocation's call actually fires. (Caught live: the session really was
  // being established correctly — confirmed via the session cookie — while
  // the UI still reported "invalid", exactly this race.)
  const startedRef = useRef(false);

  useEffect(() => {
    if (status !== "checking" || startedRef.current) return;
    const tokens = readHashTokens();
    if (!tokens) return;
    startedRef.current = true;

    const supabase = createAuthClient();
    supabase.auth.setSession(tokens).then(({ error: sessionError }) => {
      // Clear the tokens from the address bar either way — they're one-shot
      // and shouldn't linger somewhere a screenshot or browser history could
      // pick them up.
      window.history.replaceState(null, "", window.location.pathname);
      setStatus(sessionError ? "invalid" : "ready");
    });
  }, [status]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    const supabase = createAuthClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  if (status === "checking") {
    return <p className="text-center text-sm text-muted">Confirming your invite…</p>;
  }

  if (status === "invalid") {
    return (
      <Notice>
        This invite link is invalid or has already been used. Ask whoever
        invited you to send a new one.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted">
        Set a password to finish joining the workspace.
      </p>

      <Field label="Password" required hint={`At least ${MIN_PASSWORD} characters.`}>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
          autoFocus
        />
      </Field>

      {error && <Notice>{error}</Notice>}

      <Button type="submit" busy={busy} className="w-full">
        Set password and continue
      </Button>
    </form>
  );
}
