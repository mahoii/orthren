// Offline regression harness for lib/anthropic.ts. No live API calls -- every
// fetch is mocked. Run with:
//   npx tsx scripts/anthropic-client-check.ts
//
// Mirrors the pattern in scripts/deid-stress-check.ts: a results array, a
// safeReport(name, pass, details) helper, individual test cases, and a final
// PASS/FAIL report that exits non-zero on any failure.

import {
  callAnthropic,
  callAnthropicWithRetry,
  computeBackoffDelayMs,
  AnthropicRefusalError,
  AnthropicTruncatedError,
} from "../lib/anthropic";

type CaseResult = { name: string; pass: boolean; details: string[] };

const results: CaseResult[] = [];

function safeReport(name: string, pass: boolean, details: string[] = []): void {
  results.push({ name, pass, details });
}

function assert(name: string, condition: boolean, failDetail: string): void {
  if (!condition) safeReport(name, false, [failDetail]);
  else safeReport(name, true);
}

// ── Fetch mock helpers ──────────────────────────────────────────────────

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function anthropicMessage(opts: {
  stop_reason?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: Record<string, number>;
}): unknown {
  return {
    stop_reason: opts.stop_reason ?? "end_turn",
    content: opts.content ?? [{ type: "text", text: "ok" }],
    usage: opts.usage ?? { input_tokens: 10, output_tokens: 5 },
  };
}

// Silences console.info/console.error noise (usage logs, expected retry
// errors) around a test body without hiding a genuine throw.
async function silenced<T>(fn: () => Promise<T>): Promise<T> {
  const origInfo = console.info;
  const origError = console.error;
  console.info = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.info = origInfo;
    console.error = origError;
  }
}

// ── Test cases ───────────────────────────────────────────────────────────

async function testAbortOnTimeout(): Promise<void> {
  const name = "abort-signal-fires-on-timeout";
  let sawAbort = false;
  const neverResolvingFetch = (async (_url: string, init: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init.signal as AbortSignal;
      // AbortSignal.timeout()'s internal timer is deliberately unref'd (per
      // Node's implementation) so it does NOT keep the event loop alive on
      // its own -- fine for real fetch (pending I/O keeps the loop alive
      // regardless), but this mock has no other referenced handle. A
      // referenced fallback timer keeps the process alive long enough for
      // the abort event to actually fire, and turns a silent premature
      // process exit into a loud test failure if it somehow doesn't.
      const keepAlive = setTimeout(() => {
        reject(new Error("keepAlive fallback fired -- AbortSignal never aborted"));
      }, 5000);
      signal.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        sawAbort = true;
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
  }) as unknown as typeof fetch;

  try {
    await silenced(() =>
      callAnthropic({
        system: "sys",
        prompt: "hi",
        fetchImpl: neverResolvingFetch,
        timeoutMs: 50,
      })
    );
    safeReport(name, false, ["expected callAnthropic to throw on abort, but it resolved"]);
  } catch {
    assert(name, sawAbort, "fetch's AbortSignal never fired within the timeout window");
  }
}

function testComputeBackoffHonorsRetryAfter(): void {
  const name = "backoff-honors-retry-after-header";
  // rng() = 0 -> jittered component is 0, so the result should be driven
  // entirely by the retry-after value (5s -> 5000ms).
  const delay = computeBackoffDelayMs(0, "5", () => 0);
  assert(
    name,
    delay >= 5000,
    `expected computed delay to honor retry-after (>=5000ms), got ${delay}`
  );
}

function testComputeBackoffJitterVaries(): void {
  const name = "backoff-jitter-varies-across-rng-values";
  const attempt = 3; // cap = min(30000, 500 * 2^3) = 4000
  const cap = Math.min(30_000, 500 * 2 ** attempt);
  const low = computeBackoffDelayMs(attempt, null, () => 0.1);
  const high = computeBackoffDelayMs(attempt, null, () => 0.9);
  const bothInBounds = low >= 0 && low <= cap && high >= 0 && high <= cap;
  const varies = low !== high;
  assert(
    name,
    bothInBounds && varies,
    `expected distinct, in-bounds delays for different rng seeds; got low=${low} high=${high} cap=${cap}`
  );
}

async function testMaxTokensRetriesOnceThenThrows(): Promise<void> {
  const name = "max-tokens-retries-once-then-throws";
  let callCount = 0;
  const seenMaxTokens: number[] = [];
  const mockFetch = (async (_url: string, init: RequestInit) => {
    callCount += 1;
    const body = JSON.parse(String(init.body));
    seenMaxTokens.push(body.max_tokens);
    return jsonResponse(anthropicMessage({ stop_reason: "max_tokens" }));
  }) as unknown as typeof fetch;

  try {
    await silenced(() =>
      callAnthropic({
        system: "sys",
        prompt: "hi",
        maxTokens: 1000,
        fetchImpl: mockFetch,
      })
    );
    safeReport(name, false, ["expected AnthropicTruncatedError to be thrown"]);
  } catch (err) {
    const isRightType = err instanceof AnthropicTruncatedError;
    const calledExactlyTwice = callCount === 2;
    const secondCallUsedHigherTokens =
      seenMaxTokens.length === 2 && seenMaxTokens[1] === Math.min(Math.round(1000 * 1.5), 8192);
    assert(
      name,
      isRightType && calledExactlyTwice && secondCallUsedHigherTokens,
      `isRightType=${isRightType} callCount=${callCount} seenMaxTokens=${JSON.stringify(seenMaxTokens)}`
    );
  }
}

async function testMaxTokensRetrySucceeds(): Promise<void> {
  const name = "max-tokens-retry-succeeds-on-second-attempt";
  let callCount = 0;
  const mockFetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse(anthropicMessage({ stop_reason: "max_tokens" }));
    }
    return jsonResponse(
      anthropicMessage({ stop_reason: "end_turn", content: [{ type: "text", text: "final answer" }] })
    );
  }) as unknown as typeof fetch;

  const text = await silenced(() =>
    callAnthropic({ system: "sys", prompt: "hi", maxTokens: 1000, fetchImpl: mockFetch })
  );
  assert(name, text === "final answer" && callCount === 2, `text="${text}" callCount=${callCount}`);
}

async function testRefusalThrowsImmediatelyNoRetry(): Promise<void> {
  const name = "refusal-throws-immediately-zero-retries";
  let callCount = 0;
  const mockFetch = (async () => {
    callCount += 1;
    return jsonResponse(anthropicMessage({ stop_reason: "refusal" }));
  }) as unknown as typeof fetch;

  try {
    await silenced(() =>
      callAnthropicWithRetry({ system: "sys", prompt: "hi", fetchImpl: mockFetch }, 4)
    );
    safeReport(name, false, ["expected AnthropicRefusalError to be thrown"]);
  } catch (err) {
    const isRightType = err instanceof AnthropicRefusalError;
    assert(
      name,
      isRightType && callCount === 1,
      `isRightType=${isRightType} callCount=${callCount} (expected exactly 1 -- no retry on refusal)`
    );
  }
}

async function testDeadlineInPastFailsCleanly(): Promise<void> {
  const name = "deadline-in-past-fails-cleanly-not-hang";
  let fetchCalled = false;
  const mockFetch = (async () => {
    fetchCalled = true;
    return jsonResponse(anthropicMessage({}));
  }) as unknown as typeof fetch;

  const start = Date.now();
  try {
    await silenced(() =>
      callAnthropicWithRetry(
        { system: "sys", prompt: "hi", fetchImpl: mockFetch, deadlineMs: Date.now() - 1000 },
        4
      )
    );
    safeReport(name, false, ["expected an error due to already-expired deadline"]);
  } catch {
    const elapsed = Date.now() - start;
    assert(
      name,
      !fetchCalled && elapsed < 1000,
      `fetchCalled=${fetchCalled} elapsedMs=${elapsed} (expected clean, fast failure with no network call)`
    );
  }
}

async function testMultiBlockContentConcatenates(): Promise<void> {
  const name = "multi-block-content-concatenates-not-index-zero";
  const mockFetch = (async () =>
    jsonResponse(
      anthropicMessage({
        stop_reason: "end_turn",
        content: [
          { type: "thinking", text: "internal reasoning, should be ignored" },
          { type: "text", text: "A" },
          { type: "text", text: "B" },
        ],
      })
    )) as unknown as typeof fetch;

  const text = await silenced(() =>
    callAnthropic({ system: "sys", prompt: "hi", fetchImpl: mockFetch })
  );
  assert(name, text === "AB", `expected concatenated "AB", got "${text}"`);
}

async function testRetryableErrorEventuallySucceeds(): Promise<void> {
  const name = "retryable-5xx-then-success";
  let callCount = 0;
  const mockFetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({ error: { type: "overloaded_error", message: "overloaded" } }, { status: 529 });
    }
    return jsonResponse(anthropicMessage({ stop_reason: "end_turn", content: [{ type: "text", text: "recovered" }] }));
  }) as unknown as typeof fetch;

  const text = await silenced(() =>
    callAnthropicWithRetry({ system: "sys", prompt: "hi", fetchImpl: mockFetch }, 4, () => 0)
  );
  assert(name, text === "recovered" && callCount === 2, `text="${text}" callCount=${callCount}`);
}

// ── Report ───────────────────────────────────────────────────────────────

function printReport(): boolean {
  let anyFail = false;
  console.log("\nANTHROPIC CLIENT CHECK RESULTS\n" + "=".repeat(40));
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) anyFail = true;
    console.log(`[${status}] ${r.name}${r.details.length ? " -- " + r.details.join("; ") : ""}`);
  }
  console.log("=".repeat(40));
  console.log(anyFail ? "RESULT: FAILURES" : "RESULT: ALL PASS");
  return anyFail;
}

async function main(): Promise<void> {
  await testAbortOnTimeout();
  testComputeBackoffHonorsRetryAfter();
  testComputeBackoffJitterVaries();
  await testMaxTokensRetriesOnceThenThrows();
  await testMaxTokensRetrySucceeds();
  await testRefusalThrowsImmediatelyNoRetry();
  await testDeadlineInPastFailsCleanly();
  await testMultiBlockContentConcatenates();
  await testRetryableErrorEventuallySucceeds();

  const anyFail = printReport();
  process.exitCode = anyFail ? 1 : 0;
}

main().catch((err) => {
  console.error("[anthropic-client-check] fatal error:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
