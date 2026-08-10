"use client";

import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { cancelInvite, inviteMember } from "@/app/(app)/settings/actions";
import { Button, Input, Notice, Select } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/tooltip";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { formatDate } from "@/lib/format";
import type { PendingInvite } from "@/lib/db/workspace";

const INVITABLE_ROLES: Role[] = ["owner", "admin", "member", "viewer"];

export function InvitePanel({
  invites,
  canInviteOwner,
}: {
  invites: PendingInvite[];
  canInviteOwner: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function invite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await inviteMember({ email, role });
      if (!result.ok) setError(result.error);
      else {
        setMessage(result.message ?? "Saved.");
        setEmail("");
      }
    });
  }

  function cancel(id: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await cancelInvite(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      {invites.length > 0 && (
        <ul className="divide-y divide-border">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{inv.email}</p>
                <p className="text-xs text-muted">
                  Invited as {ROLE_LABEL[inv.role]} · {formatDate(inv.created_at)} ·
                  pending
                </p>
              </div>
              <Tooltip label={`Cancel invite for ${inv.email}`}>
                <button
                  type="button"
                  onClick={() => cancel(inv.id)}
                  disabled={pending}
                  aria-label={`Cancel invite for ${inv.email}`}
                  className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={invite}
        className="flex flex-wrap items-end gap-2 border-t border-border px-5 py-4"
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          required
          className="min-w-48 flex-1"
          aria-label="Email to invite"
        />
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-32"
          aria-label="Role to invite as"
        >
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r} disabled={r === "owner" && !canInviteOwner}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" busy={pending}>
          <UserPlus className="size-3.5" />
          Invite
        </Button>
      </form>

      {(error || message) && (
        <div className="px-5 pb-4">
          {error && <Notice tone="error">{error}</Notice>}
          {message && !error && <Notice tone="success">{message}</Notice>}
        </div>
      )}
    </div>
  );
}
