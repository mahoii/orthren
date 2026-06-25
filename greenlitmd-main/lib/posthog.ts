import { PostHog } from "posthog-node";

export const serverPosthog = new PostHog(process.env.POSTHOG_API_KEY ?? "", {
  host: "https://app.posthog.com",
});
