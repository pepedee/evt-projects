import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { listActivity, listMembers, listPendingInvites } from "@/lib/db/workspace";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { InvitePanel } from "@/components/settings/invite-panel";
import { formatDate, formatDateTime } from "@/lib/format";
import { ROLE_LABEL, roleAtLeast, type Role } from "@/lib/types";

export const metadata = { title: "Settings · AI Project Tracker" };

const ROLE_TONE: Record<Role, "primary" | "neutral"> = {
  owner: "primary",
  admin: "primary",
  member: "neutral",
  viewer: "neutral",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number(pageParam ?? 1) || 1;

  const canInvite = can(user, "admin");

  const [members, activity, invites] = await Promise.all([
    listMembers(user.workspaceId),
    listActivity(user.workspaceId, page),
    canInvite ? listPendingInvites(user.workspaceId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Your workspace and everything that has happened in it.
        </p>
      </header>

      <Card title="Workspace">
        <dl className="divide-y divide-border">
          <Row label="Name" value={user.workspaceName} />
          <Row label="Signed in as" value={user.email} />
          <Row label="Your role" value={ROLE_LABEL[user.role]} />
        </dl>
      </Card>

      <Card
        title="People"
        description="Invite by email below. Someone new gets a real email to set a password and join; someone already registered elsewhere is added directly, no email needed."
      >
        {members.length === 0 ? (
          <EmptyState message="No members found." />
        ) : (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.full_name ?? "Unnamed"}
                    {member.user_id === user.id && (
                      <span className="ml-2 text-xs text-muted">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    Joined {formatDate(member.created_at)}
                  </p>
                </div>
                <Badge tone={ROLE_TONE[member.role]}>
                  {ROLE_LABEL[member.role]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {canInvite && (
          <InvitePanel invites={invites} canInviteOwner={roleAtLeast(user.role, "owner")} />
        )}
      </Card>

      <Card
        title="Activity log"
        description={`${activity.total} entries. Append-only — nothing here can be edited or erased.`}
      >
        {activity.rows.length === 0 ? (
          <EmptyState message="Nothing has happened yet." />
        ) : (
          <ul className="divide-y divide-border">
            {activity.rows.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {entry.summary ?? `${entry.action} ${entry.entity}`}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateTime(entry.created_at)}
                  </p>
                </div>
                <Badge>{entry.entity}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {activity.pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/settings?page=${page - 1}`}
              className="text-primary hover:underline"
            >
              Previous
            </Link>
          ) : (
            <span className="text-muted">Previous</span>
          )}
          <span className="text-muted">
            Page {page} of {activity.pageCount}
          </span>
          {page < activity.pageCount ? (
            <Link
              href={`/settings?page=${page + 1}`}
              className="text-primary hover:underline"
            >
              Next
            </Link>
          ) : (
            <span className="text-muted">Next</span>
          )}
        </nav>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-3 px-5 py-3">
      <dt className="w-40 text-sm text-muted">{label}</dt>
      <dd className="flex-1 text-sm">{value}</dd>
    </div>
  );
}
