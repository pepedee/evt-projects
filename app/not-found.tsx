import Link from "next/link";

export const metadata = { title: "Not found · AI Project Tracker" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          That page does not exist, or it belongs to a workspace you are not in.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:opacity-90"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
