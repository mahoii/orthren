import { PostHog } from "posthog-node";

// The installed posthog-node version THROWS at construction time when given
// an empty API key (not a silent no-op) -- so without a guard here, every
// route that imports this module crashes at cold start in any environment
// missing POSTHOG_API_KEY, including inside DeidVerificationError handlers
// that need to fire the deid_verification_failed compliance audit event.
// Fall back to a stub client that no-ops instead of constructing the real
// one, and warn once so the silent-analytics-loss is at least visible in
// logs. See W3/W4 findings during the 2026-07 hardening pass.
if (!process.env.POSTHOG_API_KEY) {
  console.warn(
    "[posthog] POSTHOG_API_KEY is unset -- server-side analytics will be silently dropped, " +
      "including the deid_verification_failed compliance audit event."
  );
}

export const serverPosthog: PostHog = process.env.POSTHOG_API_KEY
  ? new PostHog(process.env.POSTHOG_API_KEY, { host: "https://app.posthog.com" })
  : (({
      capture: () => {},
      flush: async () => {},
      shutdown: async () => {},
    } as unknown) as PostHog);

// posthog-node buffers capture() calls and only ships them on its background
// flush interval. On Vercel, a serverless function's execution environment
// can be frozen or torn down the instant the HTTP response is sent -- there's
// no guarantee that background timer ever runs before that happens, so a
// bare `serverPosthog.capture(...)` silently drops the event in production.
// Always route captures through this helper (awaited) so the event is
// physically sent before the response returns.
type CaptureEventArgs = Parameters<typeof serverPosthog.capture>[0];

// Never throws -- every call site awaits this between doing real work and
// returning its response (e.g. generate-pa awaits it between a successful,
// multi-Anthropic-call generation and its 200 response, and inside every
// DeidVerificationError handler that builds a structured 422). A rejected
// flush() previously escaped straight to the caller's catch block, discarding
// a paid-for successful generation as a 500, or converting a clean 422 into
// an unhandled 500. Analytics failing is never a reason to fail the request
// it's describing. See C6 in AUDIT-FINDINGS.md.
export async function captureEvent(event: CaptureEventArgs): Promise<void> {
  try {
    serverPosthog.capture(event);
    await serverPosthog.flush();
  } catch (err) {
    console.error("[posthog] captureEvent failed (non-fatal):", err);
  }
}
