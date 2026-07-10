/**
 * Validates a client-supplied redirect target is same-origin-relative before
 * it's used in a redirect. `startsWith('/')` alone is NOT sufficient —
 * `//evil.com` is a protocol-relative URL (same scheme as the current page)
 * and `/\evil.com` is treated as `//evil.com` by some browsers. This one
 * function is the single place all three redirect call sites (auth callback
 * route, /auth/confirm, /login) must go through — they previously
 * implemented this check separately and one of them (the callback route's
 * `next` param) skipped it entirely. See E1 in AUDIT-FINDINGS.md.
 */
export function isSafeRelativeRedirect(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.startsWith("/\\")) return false;
  return true;
}
