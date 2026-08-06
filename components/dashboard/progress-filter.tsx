"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui/form";
import { ProgressChart } from "@/components/dashboard/charts";
import type { Project } from "@/lib/db/projects";
import type { ProjectStatus } from "@/lib/types";

// Only the statuses that can actually appear here — the dashboard already
// excludes completed and cancelled projects before this list is built.
const STATUS_OPTIONS: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
];

/**
 * Filters client-side rather than through the URL (the pattern the rest of
 * the app uses for paginated lists): every project here is already fetched
 * for the KPI tiles above, so refiltering is instant and doesn't reload the
 * whole dashboard just to toggle one card.
 */
export function ProgressFilter({ projects }: { projects: Project[] }) {
  const [status, setStatus] = useState<ProjectStatus | "all">("all");

  const filtered = useMemo(
    () => (status === "all" ? projects : projects.filter((p) => p.status === status)),
    [projects, status],
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <span className="text-xs text-muted">
          {filtered.length} of {projects.length}
        </span>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus | "all")}
          aria-label="Filter project progress by status"
          className="w-auto min-w-0 py-1 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <ProgressChart projects={filtered} />
    </div>
  );
}
