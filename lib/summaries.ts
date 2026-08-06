/**
 * Summary vocabulary shared by the browser and the server.
 *
 * Kept out of lib/ai/ on purpose: AGENTS.md forbids client components from
 * importing anything under lib/ai/, because that is where ANTHROPIC_API_KEY is
 * read. Labels and kind names carry no secret, so they live here and lib/ai/
 * imports them rather than the other way round.
 */

export type SummaryKind =
  | "project_status"
  | "risk_scan"
  | "standup"
  | "report_intro"
  | "handover_summary";

export const SUMMARY_KINDS: SummaryKind[] = [
  "project_status",
  "risk_scan",
  "standup",
  "report_intro",
  "handover_summary",
];

export const SUMMARY_LABEL: Record<SummaryKind, string> = {
  project_status: "Status summary",
  risk_scan: "Risk scan",
  standup: "Standup update",
  report_intro: "Executive summary",
  handover_summary: "Handover summary",
};

export function isSummaryKind(value: unknown): value is SummaryKind {
  return (
    typeof value === "string" && SUMMARY_KINDS.includes(value as SummaryKind)
  );
}
