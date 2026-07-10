import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Separate budgets per route class instead of one shared 5-req/60s bucket for
// the entire product. Previously every user-facing route imported the same
// `rateLimiter` instance and default key prefix, so a single normal workflow
// (generate -> anchor-flags -> regenerate -> export) could exhaust the whole
// budget on its own, and a clinic behind one shared NAT IP split 5
// requests/minute across every user and every route. Upstash's Ratelimit
// namespaces by the `prefix` option, so these share one Redis instance without
// key collisions. See C7 in AUDIT-FINDINGS.md.

/** Expensive: file parsing + 2-3 Anthropic calls per request (generate-pa). */
export const generationRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(8, "60 s"),
  analytics: false,
  prefix: "ratelimit:generation",
});

/** Moderate: a single Anthropic call per request (regenerate-letter, regenerate-denial-fix, generate-appeal-talking-points). */
export const regenerationRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, "60 s"),
  analytics: false,
  prefix: "ratelimit:regeneration",
});

/** Cheap: no Anthropic call, or one small structured-output call (anchor-flags, export, feedback). */
export const lightRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  analytics: false,
  prefix: "ratelimit:light",
});

/** Admin/ops routes — single-operator traffic; kept separate so it never competes with user-facing budgets. */
export const adminRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: false,
  prefix: "ratelimit:admin",
});
