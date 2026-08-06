/** Centred card shell shared by the sign-in and sign-up screens. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">AI Project Tracker</h1>
          <p className="mt-1 text-sm text-muted">
            Projects, tasks, budgets and files in one place.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6">
          {children}
        </div>
      </div>
    </main>
  );
}
