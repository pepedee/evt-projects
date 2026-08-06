"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/client";
import { Button, Field, Input, Notice } from "@/components/ui/form";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createAuthClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }

    // refresh() so the server components re-render with the new session
    // cookie before we land on the dashboard.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" required>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          autoFocus
        />
      </Field>

      <Field label="Password" required>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      {error && <Notice>{error}</Notice>}

      <Button type="submit" busy={busy} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
