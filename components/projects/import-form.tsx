"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
import { createProjectFromImport } from "@/app/(app)/projects/actions";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";

interface DraftBudgetLine {
  category: string;
  description: string;
  planned_amount: string;
}

interface DraftTask {
  title: string;
  description: string;
}

interface DraftProject {
  name: string;
  code: string;
  client_name: string;
  location: string;
  description: string;
  currency: string;
}

type ImportedProject = {
  name: string;
  code: string | null;
  client_name: string | null;
  location: string | null;
  description: string | null;
  currency: string;
  budget_lines: { category: string; description: string | null; planned_amount: number }[];
  tasks: { title: string; description: string | null }[];
};

/**
 * Upload a quotation PDF, review what the AI pulled out of it, then save.
 *
 * Two stages in one component rather than two routes: the review state (a
 * project plus editable arrays of budget lines and tasks) only exists in
 * memory until the user submits it — nothing is written until then, so a
 * bad extraction costs nothing to throw away and re-try.
 */
export function ImportForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"upload" | "review">("upload");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [project, setProject] = useState<DraftProject>({
    name: "",
    code: "",
    client_name: "",
    location: "",
    description: "",
    currency: "THB",
  });
  const [budgetLines, setBudgetLines] = useState<DraftBudgetLine[]>([]);
  const [tasks, setTasks] = useState<DraftTask[]>([]);

  function setField<K extends keyof DraftProject>(key: K, value: DraftProject[K]) {
    setProject((prev) => ({ ...prev, [key]: value }));
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Only PDF files can be imported right now.");
      return;
    }

    setError(null);
    setExtracting(true);

    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch("/api/projects/import", { method: "POST", body });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? `Import failed (${response.status})`);
        return;
      }

      const draft = payload.draft as ImportedProject;
      setProject({
        name: draft.name,
        code: draft.code ?? "",
        client_name: draft.client_name ?? "",
        location: draft.location ?? "",
        description: draft.description ?? "",
        currency: draft.currency,
      });
      setBudgetLines(
        draft.budget_lines.map((l) => ({
          category: l.category,
          description: l.description ?? "",
          planned_amount: String(l.planned_amount),
        })),
      );
      setTasks(
        draft.tasks.map((t) => ({ title: t.title, description: t.description ?? "" })),
      );
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setExtracting(false);
    }
  }

  function addBudgetLine() {
    setBudgetLines((prev) => [...prev, { category: "", description: "", planned_amount: "" }]);
  }
  function updateBudgetLine(i: number, patch: Partial<DraftBudgetLine>) {
    setBudgetLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeBudgetLine(i: number) {
    setBudgetLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addTask() {
    setTasks((prev) => [...prev, { title: "", description: "" }]);
  }
  function updateTask(i: number, patch: Partial<DraftTask>) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function removeTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const result = await createProjectFromImport({
      project: {
        name: project.name,
        code: project.code,
        client_name: project.client_name,
        location: project.location,
        description: project.description,
        status: "planning",
        priority: "medium",
        currency: project.currency,
        start_date: "",
        target_date: "",
        tags: [],
      },
      budgetLines: budgetLines
        .filter((l) => l.category.trim())
        .map((l) => ({
          category: l.category,
          description: l.description,
          planned_amount: Number(l.planned_amount) || 0,
        })),
      tasks: tasks
        .filter((t) => t.title.trim())
        .map((t) => ({ title: t.title, description: t.description })),
    });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push(result.projectId ? `/projects/${result.projectId}` : "/projects");
    router.refresh();
  }

  if (stage === "upload") {
    return (
      <Card className="p-6">
        <p className="mb-4 text-sm text-muted">
          Upload a quotation or scope-of-work PDF. The AI reads it and drafts a
          project — name, client, budget lines, and tasks — for you to review
          and edit before anything is saved. PDF only, for now.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={onPick}
          className="hidden"
        />
        <Button
          type="button"
          busy={extracting}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {extracting ? "Reading document…" : "Upload PDF"}
        </Button>
        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="font-semibold">Project</h2>
        <Field label="Name" required>
          <Input
            value={project.name}
            onChange={(e) => setField("name", e.target.value)}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code">
            <Input value={project.code} onChange={(e) => setField("code", e.target.value)} />
          </Field>
          <Field label="Client">
            <Input
              value={project.client_name}
              onChange={(e) => setField("client_name", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Location">
          <Input
            value={project.location}
            onChange={(e) => setField("location", e.target.value)}
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={project.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={5}
          />
        </Field>
        <Field label="Currency" hint="Budget lines below use this.">
          <Input
            value={project.currency}
            onChange={(e) => setField("currency", e.target.value.toUpperCase())}
            maxLength={3}
            className="w-24"
          />
        </Field>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Budget lines</h2>
          <Button type="button" variant="outline" size="sm" onClick={addBudgetLine}>
            Add line
          </Button>
        </div>
        {budgetLines.length === 0 ? (
          <p className="text-sm text-muted">No budget lines extracted.</p>
        ) : (
          <div className="space-y-3">
            {budgetLines.map((line, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2">
                <Input
                  value={line.category}
                  onChange={(e) => updateBudgetLine(i, { category: e.target.value })}
                  placeholder="Category"
                  className="min-w-40 flex-1"
                />
                <Input
                  value={line.description}
                  onChange={(e) => updateBudgetLine(i, { description: e.target.value })}
                  placeholder="Description (optional)"
                  className="min-w-40 flex-[2]"
                />
                <Input
                  value={line.planned_amount}
                  onChange={(e) => updateBudgetLine(i, { planned_amount: e.target.value })}
                  placeholder="Amount"
                  inputMode="decimal"
                  className="w-32"
                />
                <Tooltip label="Remove budget line">
                  <button
                    type="button"
                    onClick={() => removeBudgetLine(i)}
                    aria-label="Remove budget line"
                    className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Tasks</h2>
          <Button type="button" variant="outline" size="sm" onClick={addTask}>
            Add task
          </Button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted">No tasks extracted.</p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2">
                <Input
                  value={task.title}
                  onChange={(e) => updateTask(i, { title: e.target.value })}
                  placeholder="Task title"
                  className="min-w-40 flex-1"
                />
                <Input
                  value={task.description}
                  onChange={(e) => updateTask(i, { description: e.target.value })}
                  placeholder="Description (optional)"
                  className="min-w-40 flex-[2]"
                />
                <Tooltip label="Remove task">
                  <button
                    type="button"
                    onClick={() => removeTask(i)}
                    aria-label="Remove task"
                    className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && <Notice>{error}</Notice>}

      <div className="flex gap-2">
        <Button type="submit" busy={saving}>
          Create project
        </Button>
        <Button type="button" variant="outline" onClick={() => setStage("upload")}>
          Start over
        </Button>
      </div>
    </form>
  );
}
