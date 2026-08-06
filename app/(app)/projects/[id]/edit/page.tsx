import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getProject } from "@/lib/db/projects";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";

export const metadata = { title: "Edit project · AI Project Tracker" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("member");
  const { id } = await params;
  const project = await getProject(id, user.workspaceId);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Edit {project.name}</h1>
      <Card className="p-6">
        <ProjectForm project={project} />
      </Card>
    </div>
  );
}
