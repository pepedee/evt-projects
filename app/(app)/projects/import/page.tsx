import { requireRole } from "@/lib/auth";
import { ImportForm } from "@/components/projects/import-form";

export const metadata = { title: "Import project · AI Project Tracker" };

export default async function ImportProjectPage() {
  await requireRole("member");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Import project</h1>
      <ImportForm />
    </div>
  );
}
