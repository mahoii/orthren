import { PostHog } from "posthog-node";

// Without POSTHOG_API_KEY, the PostHog client either silently no-ops on
// every capture() call or (depending on posthog-node version) throws at
// construction time below -- either way there's no visibility into the
// fact that analytics are dead. That includes the deid_verification_failed
// audit event (fired when the de-id gate catches a PHI leak), which would
// then vanish silently or crash module load with no indication why. Warn
// once at module load (cold start), before construction, so it fires
// regardless of which failure mode the installed client takes.
if (!process.env.POSTHOG_API_KEY) {
  console.warn(
    "[posthog] POSTHOG_API_KEY is unset -- server-side analytics will be silently dropped, " +
      "including the deid_verification_failed compliance audit event."
  );
}

export const serverPosthog = new PostHog(process.env.POSTHOG_API_KEY ?? "", {
  host: "https://app.posthog.com",
});

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
