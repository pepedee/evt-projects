"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/client";
import { Button, Field, Input, Notice } from "@/components/ui/form";

const MIN_PASSWORD = 8;

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    const supabase = createAuthClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    // With email confirmation switched on, signUp returns no session and the
    // account is not usable until the link is clicked.
    if (!data.session) {
      setCheckEmail(true);
      setBusy(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <Notice tone="success">
        Account created. Check {email} for the confirmation link, then sign in.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Full name" required>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
          autoFocus
        />
      </Field>

      <Field label="Email" required>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>

      <Field
        label="Password"
        required
        hint={`At least ${MIN_PASSWORD} characters.`}
      >
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
        />
      </Field>

      {error && <Notice>{error}</Notice>}

      <Button type="submit" busy={busy} className="w-full">
        Create account
      </Button>
    </form>
  );
}
