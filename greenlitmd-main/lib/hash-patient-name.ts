import { createHmac } from "crypto";

/**
 * One-way HMAC of a patient name for usage-metering rows (pa_cases). Never
 * store or log the raw name — this hash exists only to dedupe/audit usage
 * counts, never to re-identify a patient.
 *
 * Requires a dedicated PA_HASH_SALT — deliberately does not fall back to
 * ANTHROPIC_API_KEY (reusing a secret across trust domains) or a hardcoded
 * string (patient names are a small, guessable namespace; a weak/known salt
 * makes the hash dictionary-attackable, defeating the one-way guarantee).
 */
export function hashPatientName(name: string): string {
  const salt = process.env.PA_HASH_SALT;
  if (!salt) {
    throw new Error("PA_HASH_SALT is not configured — required to hash patient names for usage metering.");
  }
  return createHmac("sha256", salt).update(name.trim().toLowerCase()).digest("hex");
}
