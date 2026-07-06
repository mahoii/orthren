import { PostHog } from "posthog-node";

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

export async function captureEvent(event: CaptureEventArgs): Promise<void> {
  serverPosthog.capture(event);
  await serverPosthog.flush();
}
