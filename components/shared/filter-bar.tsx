"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/form";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelect {
  /** Query-string key this control writes to. */
  name: string;
  label: string;
  options: FilterOption[];
}

/**
 * Writes filters into the URL rather than component state, so a filtered view
 * is linkable, survives a refresh, and is read by the server component that
 * actually runs the query.
 */
export function FilterBar({
  basePath,
  selects = [],
  searchPlaceholder = "Search",
}: {
  basePath: string;
  selects?: FilterSelect[];
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "" || value === "all") next.delete(key);
    else next.set(key, value);
    // Any filter change invalidates the current page number.
    next.delete("page");
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1">
        <span className="mb-1.5 block text-sm font-medium">Search</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            defaultValue={params.get("q") ?? ""}
            placeholder={searchPlaceholder}
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                apply("q", (e.target as HTMLInputElement).value);
              }
            }}
          />
        </div>
      </label>

      {selects.map((select) => (
        <label key={select.name} className="min-w-40">
          <span className="mb-1.5 block text-sm font-medium">{select.label}</span>
          <Select
            defaultValue={params.get(select.name) ?? "all"}
            onChange={(e) => apply(select.name, e.target.value)}
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </div>
  );
}
