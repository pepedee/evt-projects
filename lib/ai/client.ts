import Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic client. SERVER ONLY.
 *
 * Never import this file, or anything under lib/ai/, from a client component:
 * `ANTHROPIC_API_KEY` is read here, and pulling it into the browser bundle
 * would publish your key to every visitor. Everything in lib/ai/ is reached
 * through a route handler or a server action.
 */

/**
 * Defaults to Opus 5 rather than a cheaper model. Downgrading for cost is a
 * decision for the person paying the bill, so it is an env var, not a
 * hard-coded choice: set ANTHROPIC_MODEL to override.
 */
export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/**
 * Bumped whenever a prompt in lib/ai/prompts.ts changes materially. It is part
 * of the cache key, so old summaries are superseded instead of being served
 * from a prompt that no longer exists.
 */
export const PROMPT_VERSION = 1;

let cached: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic {
  if (!isAiConfigured()) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (server-side only — never prefix it NEXT_PUBLIC_).",
    );
  }
  // The SDK reads ANTHROPIC_API_KEY from the environment itself.
  cached ??= new Anthropic();
  return cached;
}

/**
 * Turn an SDK error into something worth showing a user.
 *
 * Ordered most specific first, and APIConnectionError before APIError — in the
 * TypeScript SDK the former is a subclass of the latter, so the broad check
 * would otherwise swallow it.
 */
export function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Try again shortly.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API. Check your connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error (${err.status}): ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
