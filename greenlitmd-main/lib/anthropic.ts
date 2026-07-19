const DEFAULT_TIMEOUT_MS = 100_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

function isAnthropicOverloadedError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("overloaded_error") || normalized.includes("overloaded");
}

class AnthropicHttpError extends Error {
  status: number;
  /** Raw `retry-after` response header value (seconds), if present. */
  retryAfter: string | null;
  constructor(status: number, body: string, retryAfter: string | null) {
    super(`Anthropic API request failed. ${body}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * Distinct, non-retryable model/policy refusal (`stop_reason: "refusal"`).
 * Callers should surface this to the user rather than retry with the same
 * prompt.
 */
export class AnthropicRefusalError extends Error {
  constructor(message = "Anthropic declined to generate a response (refusal).") {
    super(message);
    this.name = "AnthropicRefusalError";
  }
}

/**
 * Response was still truncated at `stop_reason: "max_tokens"` after one
 * automatic retry at a higher token budget. Thrown instead of silently
 * returning truncated content.
 */
export class AnthropicTruncatedError extends Error {
  constructor(message = "Anthropic response was truncated (max_tokens) even after retrying at a higher token budget.") {
    super(message);
    this.name = "AnthropicTruncatedError";
  }
}

// Widens retry coverage beyond the "overloaded" text match: transient network
// errors (Node error codes, fetch-level failures) and retryable HTTP status
// codes (429 rate limit, 529 overloaded, 5xx server errors) all warrant the
// same backoff-and-retry treatment as an overloaded_error response.
function isRetryableAnthropicError(err: unknown, message: string): boolean {
  if (isAnthropicOverloadedError(message)) return true;

  const code = (err as { code?: string } | undefined)?.code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EPIPE") return true;

  if (err instanceof TypeError && /fetch failed/i.test(message)) return true;

  if (err instanceof DOMException && err.name === "AbortError") return true;
  if ((err as { name?: string } | undefined)?.name === "AbortError") return true;
  if (err instanceof Error && /aborted/i.test(err.message)) return true;

  if (err instanceof AnthropicHttpError) {
    const { status } = err;
    if (status === 429 || status === 529 || (status >= 500 && status < 600)) return true;
  }

  return false;
}

/**
 * Pure, deterministic backoff-delay computation so it can be unit-tested
 * without real timers. Full-jitter exponential backoff: a random value in
 * [0, cap] where cap = min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2^attempt).
 *
 * If the API supplied a `retry-after` header (429/529), we take
 * max(jitteredDelay, retryAfterSeconds * 1000) — i.e. we never wait less
 * than the server explicitly asked for, but a larger jittered backoff (e.g.
 * on a later attempt) is allowed to win rather than being clamped down to
 * the server's value.
 */
export function computeBackoffDelayMs(
  attempt: number,
  retryAfterHeader?: string | null,
  rng: () => number = Math.random
): number {
  const cap = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  const jittered = rng() * cap;

  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  const retryAfterMs =
    Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;

  return Math.max(jittered, retryAfterMs);
}

export interface CallAnthropicParams {
  system: string;
  prompt: string;
  maxTokens?: number;
  useStructuredOutput?: boolean;
  /**
   * Explicit sampling temperature. When omitted, structured-output calls run at
   * 0 and all others use the API default. An explicit value always wins — letter
   * generation sets temperature: 0 to maximize compliance with the prompt rules
   * without claiming JSON structured output.
   */
  temperature?: number;
  /**
   * Absolute epoch-ms deadline for the whole call (including any retries).
   * Threaded through so a route's own `maxDuration` budget isn't blown by
   * this client's own retry loop. Checked before every attempt.
   */
  deadlineMs?: number;
  /** Injectable fetch implementation — used by tests to mock the network. */
  fetchImpl?: typeof fetch;
  /** Per-attempt request timeout in ms. Defaults to 100s. */
  timeoutMs?: number;
  /**
   * A JSON Schema object. When present, sends `output_config.format` as a
   * real `json_schema` structured-output request instead of relying on
   * `useStructuredOutput`'s temperature-only behavior — the API then
   * guarantees schema-valid JSON, eliminating the JSON.parse failure class.
   * Schema must use `additionalProperties: false` and list every key as
   * required (nullable fields use `["string", "null"]` etc.) per the
   * structured-outputs API contract. Confirmed supported on
   * claude-sonnet-4-6 via a live capability probe before this was added.
   */
  jsonSchema?: Record<string, unknown>;
}

interface CallAnthropicOnceResult {
  text: string;
  stopReason: string | undefined;
}

async function callAnthropicOnce(
  params: CallAnthropicParams,
  maxTokensOverride: number | undefined,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<CallAnthropicOnceResult> {
  const { system, prompt, maxTokens = 2000, useStructuredOutput = false, temperature, jsonSchema } = params;
  const effectiveMaxTokens = maxTokensOverride ?? maxTokens;

  const resolvedTemperature =
    temperature !== undefined ? temperature : useStructuredOutput ? 0 : undefined;

  const requestBody: Record<string, unknown> = {
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    max_tokens: effectiveMaxTokens,
    // Wrapping system as a content-block array with an ephemeral cache_control
    // marker is a bytes-identical change vs a plain string for everything the
    // model reads — it only adds a prompt-caching breakpoint. See
    // shared/prompt-caching.md.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    ...(resolvedTemperature !== undefined ? { temperature: resolvedTemperature } : {}),
    ...(jsonSchema ? { output_config: { format: { type: "json_schema", schema: jsonSchema } } } : {})
  };

  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AnthropicHttpError(response.status, text, response.headers.get("retry-after"));
  }

  const data = await response.json();

  if (data.stop_reason === "refusal") {
    throw new AnthropicRefusalError();
  }

  // Defensive: some models return a content array with more than one text
  // block (or a leading thinking block) — single-index access silently drops
  // content. Filter to text blocks and concatenate.
  const blocks: Array<{ type?: string; text?: string }> = Array.isArray(data.content) ? data.content : [];
  const text = blocks
    .filter((block) => block?.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  const usage = data.usage ?? {};
  console.info(
    `[anthropic] usage: input=${usage.input_tokens ?? 0} output=${usage.output_tokens ?? 0} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} cache_creation=${usage.cache_creation_input_tokens ?? 0}`
  );

  return { text, stopReason: typeof data.stop_reason === "string" ? data.stop_reason : undefined };
}

export async function callAnthropic(params: CallAnthropicParams): Promise<string> {
  const fetchImpl = params.fetchImpl ?? globalThis.fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const originalMaxTokens = params.maxTokens ?? 2000;

  const first = await callAnthropicOnce(params, undefined, fetchImpl, timeoutMs);

  if (first.stopReason !== "max_tokens") {
    if (!first.text) {
      throw new Error("Anthropic did not return a usable response.");
    }
    return first.text;
  }

  // Silent truncation is worse than a slower response: retry once at a
  // higher max_tokens before giving up.
  if (params.deadlineMs !== undefined && Date.now() >= params.deadlineMs) {
    throw new Error(
      `[anthropic] callAnthropic: deadline exceeded before max_tokens retry (deadlineMs=${params.deadlineMs}).`
    );
  }

  const higherMaxTokens = Math.min(Math.round(originalMaxTokens * 1.5), 8192);
  const second = await callAnthropicOnce(params, higherMaxTokens, fetchImpl, timeoutMs);

  if (second.stopReason === "max_tokens") {
    throw new AnthropicTruncatedError();
  }

  if (!second.text) {
    throw new Error("Anthropic did not return a usable response.");
  }
  return second.text;
}

export async function callAnthropicWithRetry(
  params: CallAnthropicParams,
  retries = 4,
  rng: () => number = Math.random
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (params.deadlineMs !== undefined && Date.now() >= params.deadlineMs) {
      throw new Error(
        `[anthropic] callAnthropicWithRetry: deadline budget exhausted before attempt ${attempt} ` +
          `(deadlineMs=${params.deadlineMs}). Not retrying further.`
      );
    }
    try {
      return await callAnthropic(params);
    } catch (err) {
      // Refusals are a distinct, non-retryable model/policy decision —
      // retrying with the same prompt will not help.
      if (err instanceof AnthropicRefusalError) {
        throw err;
      }

      console.error("[anthropic] callAnthropicWithRetry error (attempt " + attempt + "):", err);
      const message = err instanceof Error ? err.message : "";
      const isRetryable = isRetryableAnthropicError(err, message);
      if (isRetryable && attempt < retries) {
        const retryAfterHeader = err instanceof AnthropicHttpError ? err.retryAfter : null;
        const delay = computeBackoffDelayMs(attempt, retryAfterHeader, rng);

        if (params.deadlineMs !== undefined && Date.now() + delay >= params.deadlineMs) {
          throw new Error(
            `[anthropic] callAnthropicWithRetry: next retry delay would exceed deadline ` +
              `(deadlineMs=${params.deadlineMs}). Aborting retry loop.`
          );
        }

        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}
