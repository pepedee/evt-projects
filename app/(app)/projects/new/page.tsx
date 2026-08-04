import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";

export const metadata = { title: "New project · AI Project Tracker" };

export default async function NewProjectPage() {
  // Viewers should not reach the form at all, not merely fail on submit.
  await requireRole("member");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New project</h1>
      <Card className="p-6">
        <ProjectForm />
      </Card>
    </div>
  );
}
