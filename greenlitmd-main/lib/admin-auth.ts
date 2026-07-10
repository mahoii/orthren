import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison against ADMIN_SECRET. A plain `===` compare is a
 * (low-severity, over TLS) timing side channel; the real gap this closes is
 * that these routes previously had NO rate limiting at all, making the secret
 * an unthrottled brute-force target on top of the timing leak. See E2 in
 * AUDIT-FINDINGS.md.
 */
export function isValidAdminSecret(providedSecret: string | null): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !providedSecret) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(providedSecret);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
