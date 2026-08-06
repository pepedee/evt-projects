import { AI_MODEL, getAnthropic, isAiConfigured } from "@/lib/ai/client";
import { SYSTEM_PROMPT, buildUserPrompt, specFor } from "@/lib/ai/prompts";
import {
  buildProjectSnapshot,
  findCachedSummary,
  saveSummary,
  snapshotHash,
} from "@/lib/ai/summarize";
import type { SummaryKind } from "@/lib/summaries";

/**
 * Non-streaming summary generation, for callers that need the whole text
 * before they can do anything with it — the Word report, chiefly.
 *
 * Shares the cache with the streaming route, so opening a summary in the UI
 * and then downloading a report does not pay for the same text twice.
 */
export async function generateSummary(
  projectId: string,
  kind: SummaryKind,
  userId: string,
  workspaceId: string,
): Promise<{ content: string; cached: boolean } | null> {
  if (!isAiConfigured()) return null;

  const snapshot = await buildProjectSnapshot(projectId, workspaceId);
  if (!snapshot) return null;

  const inputHash = snapshotHash(kind, snapshot);

  const cached = await findCachedSummary(projectId, kind, inputHash, workspaceId);
  if (cached) return { content: cached.content, cached: true };

  const spec = specFor(kind);

  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: spec.maxTokens,
    output_config: { effort: spec.effort },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(kind, snapshot) }],
  });

  // Safety classifiers decline with a normal 200 and no usable content.
  if (message.stop_reason === "refusal") return null;

  // content is a discriminated union; only text blocks carry the answer.
  const content = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!content) return null;

  await saveSummary({
    projectId,
    kind,
    content,
    inputHash,
    promptTokens: message.usage.input_tokens ?? null,
    completionTokens: message.usage.output_tokens ?? null,
    userId,
  });

  return { content, cached: false };
}
