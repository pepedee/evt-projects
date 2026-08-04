"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProject, updateProject } from "@/app/(app)/projects/actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui/form";
import type { Project } from "@/lib/db/projects";

interface FormState {
  name: string;
  code: string;
  description: string;
  client_name: string;
  status: string;
  priority: string;
  currency: string;
  start_date: string;
  target_date: string;
  health_override: string;
  tags: string;
}

function initialState(project?: Project): FormState {
  return {
    name: project?.name ?? "",
    code: project?.code ?? "",
    description: project?.description ?? "",
    client_name: project?.client_name ?? "",
    status: project?.status ?? "planning",
    priority: project?.priority ?? "medium",
    currency: project?.currency ?? "THB",
    start_date: project?.start_date ?? "",
    target_date: project?.target_date ?? "",
    health_override: project?.health_override ?? "",
    tags: project?.tags?.join(", ") ?? "",
  };
}

export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const [form, setForm] = useState(() => initialState(project));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const payload = {
      ...form,
      health_override: form.health_override === "" ? null : form.health_override,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    } as Parameters<typeof createProject>[0];

    const result = project
      ? await updateProject(project.id, payload)
      : await createProject(payload);

    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    router.push(project ? `/projects/${project.id}` : "/projects");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Name" required>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
          autoFocus
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="Short reference, e.g. CT-02.">
          <Input value={form.code} onChange={(e) => set("code", e.target.value)} />
        </Field>
        <Field label="Client">
          <Input
            value={form.client_name}
            onChange={(e) => set("client_name", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={form.priority}
            onChange={(e) => set("priority", e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date">
          <Input
            type="date"
            value={form.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </Field>
        <Field label="Target date">
          <Input
            type="date"
            value={form.target_date}
            onChange={(e) => set("target_date", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Currency"
          hint="Budget lines and expenses all use this."
        >
          <Input
            value={form.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
            maxLength={3}
          />
        </Field>
        <Field
          label="Health"
          hint="Leave automatic unless you know better than the dates."
        >
          <Select
            value={form.health_override}
            onChange={(e) => set("health_override", e.target.value)}
          >
            <option value="">Automatic</option>
            <option value="on_track">On track</option>
            <option value="at_risk">At risk</option>
            <option value="off_track">Off track</option>
          </Select>
        </Field>
      </div>

      <Field label="Tags" hint="Comma separated.">
        <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} />
      </Field>

      {error && <Notice>{error}</Notice>}

      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {project ? "Save changes" : "Create project"}
        </Button>
        <Link href={project ? `/projects/${project.id}` : "/projects"}>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
