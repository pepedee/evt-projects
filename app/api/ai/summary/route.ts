import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import {
  AI_MODEL,
  describeAiError,
  getAnthropic,
  isAiConfigured,
} from "@/lib/ai/client";
import { SYSTEM_PROMPT, buildUserPrompt, specFor } from "@/lib/ai/prompts";
import { isSummaryKind } from "@/lib/summaries";
import {
  buildProjectSnapshot,
  findCachedSummary,
  saveSummary,
  snapshotHash,
} from "@/lib/ai/summarize";

/**
 * Streams an AI summary of one project.
 *
 * Wire format is newline-delimited JSON so the client can distinguish the
 * thinking pause from the answer:
 *   {"type":"status","value":"thinking"}
 *   {"type":"delta","text":"..."}
 *   {"type":"done","cached":false}
 *   {"type":"error","message":"..."}
 */

const bodySchema = z.object({
  projectId: z.string().uuid(),
  kind: z.string().refine(isSummaryKind, "Unknown summary kind"),
});

function line(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

function ndjson(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI summaries are not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { projectId, kind } = parsed.data;
  if (!isSummaryKind(kind)) {
    return NextResponse.json({ error: "Unknown summary kind." }, { status: 400 });
  }

  // RLS decides this: a project the user cannot read has no snapshot.
  const snapshot = await buildProjectSnapshot(projectId, user.workspaceId);
  if (!snapshot) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const inputHash = snapshotHash(kind, snapshot);
  const cached = await findCachedSummary(projectId, kind, inputHash, user.workspaceId);

  // Nothing about the project has changed since this was written, so there is
  // nothing new to say — replay it rather than paying for the same answer.
  if (cached) {
    return ndjson(
      new ReadableStream({
        start(controller) {
          controller.enqueue(line({ type: "delta", text: cached.content }));
          controller.enqueue(
            line({ type: "done", cached: true, created_at: cached.created_at }),
          );
          controller.close();
        },
      }),
    );
  }

  const spec = specFor(kind);

  const stream = new ReadableStream({
    async start(controller) {
      let answer = "";
      try {
        // `thinking` is deliberately unset: it is on by default on Opus 5, and
        // its tokens share the max_tokens budget with the answer — hence the
        // generous ceiling for what is only a few paragraphs of output.
        const response = getAnthropic().messages.stream({
          model: AI_MODEL,
          max_tokens: spec.maxTokens,
          output_config: { effort: spec.effort },
          system: SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildUserPrompt(kind, snapshot) },
          ],
        });

        for await (const event of response) {
          if (
            event.type === "content_block_start" &&
            event.content_block.type === "thinking"
          ) {
            // Thinking text is omitted by default, so this block streams empty.
            // Without this signal the UI would just sit blank until the answer
            // starts, which reads as a hang.
            controller.enqueue(line({ type: "status", value: "thinking" }));
          }
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            answer += event.delta.text;
            controller.enqueue(line({ type: "delta", text: event.delta.text }));
          }
        }

        const final = await response.finalMessage();

        // Safety classifiers can decline a request; that arrives as a normal
        // 200 with no usable content, not an exception.
        if (final.stop_reason === "refusal") {
          controller.enqueue(
            line({
              type: "error",
              message: "The model declined to summarise this project.",
            }),
          );
          controller.close();
          return;
        }

        if (answer.trim().length > 0) {
          await saveSummary({
            projectId,
            kind,
            content: answer,
            inputHash,
            promptTokens: final.usage.input_tokens ?? null,
            completionTokens: final.usage.output_tokens ?? null,
            userId: user.id,
          });

          await logActivity(user, {
            entity: "project",
            entityId: projectId,
            action: "ai_summary",
            summary: `Generated ${kind.replace("_", " ")} for ${snapshot.name}`,
          });
        }

        controller.enqueue(
          line({
            type: "done",
            cached: false,
            truncated: final.stop_reason === "max_tokens",
          }),
        );
      } catch (err) {
        controller.enqueue(
          line({ type: "error", message: describeAiError(err) }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return ndjson(stream);
}
