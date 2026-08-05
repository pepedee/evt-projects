import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listActivity } from "@/lib/db/workspace";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Settings · AI Project Tracker" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number(pageParam ?? 1) || 1;

  const activity = await listActivity(page);

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
          <Row label="Access" value="Open — no sign-in required" />
        </dl>
      </Card>

      <Card title="Access">
        <div className="space-y-2 px-5 py-4 text-sm">
          <p>
            This app has no authentication. Everyone who can reach it shares one
            workspace and has full rights over everything in it.
          </p>
          <p className="text-muted">
            There is no per-person record, so the activity log below shows what
            changed but not who changed it. Keep the deployment private — on a
            public URL, everything here is public.
          </p>
        </div>
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
