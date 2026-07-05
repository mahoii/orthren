// Independent, fail-closed post-redaction leak detector for lib/deidentify.ts.
//
// Independence policy: this file implements its OWN normalization and its
// OWN detection regexes. It never imports a detection pattern from
// deidentify.ts -- only pure data constants (name stoplists) may be shared,
// because an asymmetric stoplist between redaction and verification would
// guarantee false 422s. If redaction and verification shared regexes, a bug
// in one would silently blind the other; independence is the whole point of
// a second pass.
//
// Leak reporting NEVER includes a raw value -- only a category label and a
// character offset into the (masked, normalized) scan text. This holds even
// in thrown errors, so a route that echoes `error.message` in a response or
// log can never leak PHI.

import { FIRST_NAME_STOPLIST } from "./deidentify";

export type VerifyResult = { pass: boolean; leaks: string[] };

export class DeidVerificationError extends Error {
  categories: string[];
  seam: string;
  leakCount: number;

  constructor(seam: string, leaks: string[]) {
    const categories = Array.from(new Set(leaks.map((l) => l.split("@")[0]))).sort();
    super(`De-identification verification failed (${seam}): ${categories.join(", ")}`);
    this.name = "DeidVerificationError";
    this.seam = seam;
    this.categories = categories;
    this.leakCount = leaks.length;
  }
}

// ── Own normalization (broader than deidentify's preprocess -- covers more
// bidi/formatting control characters since this is the last line of defense) ──

function scanNormalize(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD\uFE00-\uFE0F]/g, "")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, "'")
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00A0\u202F]/g, " ");
}

// ── Placeholder masking ─────────────────────────────────────────────────
// Explicit token grammar (not a generic \[[A-Z_]+\]) so that an unmasked,
// unrecognized future token trips a detector instead of silently passing --
// drift between deidentify.ts and this list fails closed, never silently.
const TOKEN_RE =
  /\[(?:PATIENT_NAME|AGE_90PLUS|MRN|PHONE|ADDRESS|FACILITY|DOB|AGE|SSN|FAX|MEMBERID|NPI|DEA|EMAIL|DATE|ZIP|PROVIDER|CONTACT|DEVICE|URL|IP|ACCOUNT|LICENSE|VEHICLE|CITY)(?:_\d+)?\]/g;

function maskPlaceholders(text: string): string {
  return text.replace(TOKEN_RE, (m) => " ".repeat(m.length));
}

// ── Detectors ────────────────────────────────────────────────────────────

const MONTH_ALT =
  "January|February|March|April|May|June|July|August|September|October|November|December|" +
  "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

function categoryFromKey(key: string): string {
  const stripped = key.replace(/^\[/, "").replace(/\]$/, "");
  const withoutCounter = stripped.replace(/_\d+$/, "");
  return `map_value_${withoutCounter}`;
}

function findAll(text: string, re: RegExp, category: string, leaks: string[]): void {
  const matches = Array.from(text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")));
  for (const m of matches) {
    if (m.index !== undefined) leaks.push(`${category}@${m.index}`);
  }
}

function detectMapValueLeaks(masked: string, map: Record<string, string>, leaks: string[]): void {
  for (const [key, raw] of Object.entries(map)) {
    const value = raw.trim();
    if (value.length < 4 || value === "90+") continue;
    const category = categoryFromKey(key);
    const lowerText = masked.toLowerCase();
    const lowerValue = value.toLowerCase();
    let idx = lowerText.indexOf(lowerValue);
    while (idx !== -1) {
      leaks.push(`${category}@${idx}`);
      idx = lowerText.indexOf(lowerValue, idx + 1);
    }
    // JSON-escaped form (e.g. O\"Neil) for stringified seams -- only check
    // when the value actually contains a character JSON would escape.
    if (/["\\]/.test(value)) {
      const escaped = JSON.stringify(value).slice(1, -1).toLowerCase();
      if (escaped !== lowerValue) {
        let eIdx = lowerText.indexOf(escaped);
        while (eIdx !== -1) {
          leaks.push(`${category}@${eIdx}`);
          eIdx = lowerText.indexOf(escaped, eIdx + 1);
        }
      }
    }
  }
}

type NameParts = { first: string | null; last: string };

// Independent (re-derived, not imported) name splitter -- deliberately
// simpler than deidentify.ts's parser since this only needs to enumerate
// variants to search for, not to canonicalize for storage.
function splitName(raw: string): NameParts {
  const cleaned = raw.replace(/,?\s+(Jr|Sr|II|III|IV)\.?$/i, "").trim();
  if (cleaned.includes(",")) {
    const [last, rest] = cleaned.split(",").map((s) => s.trim());
    const first = rest ? rest.split(/\s+/)[0] : null;
    return { first, last };
  }
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return { first: null, last: tokens[0] };
  return { first: tokens[0], last: tokens[tokens.length - 1] };
}

function detectPatientNameVariants(masked: string, map: Record<string, string>, leaks: string[]): void {
  const patientName = map["[PATIENT_NAME]"];
  if (patientName) {
    const { first, last } = splitName(patientName);
    const variants = new Set<string>();
    if (first) variants.add(`${first} ${last}`);
    variants.add(last);
    if (first && first.length >= 3 && !FIRST_NAME_STOPLIST.has(first.toLowerCase())) variants.add(first);
    for (const variant of Array.from(variants)) {
      if (variant.length < 2) continue;
      const re = new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      findAll(masked, re, "patient_name_variant", leaks);
    }
  }
  for (const [key, raw] of Object.entries(map)) {
    if (!key.startsWith("[CONTACT_")) continue;
    // Contacts: full-name permutations only, mirroring what redaction
    // promises to sweep (contact tokens are never split individually).
    const escaped = raw.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escaped.length < 3) continue;
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    findAll(masked, re, "contact_name_variant", leaks);
  }
}

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b|\b\d{3}\s\d{2}\s\d{4}\b/g;
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const DATE_FULL_RE = new RegExp(
  `\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b(?:${MONTH_ALT})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`,
  "gi"
);
const ADDRESS_RE =
  /\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl)\.?\b|\bP\.?\s?O\.?\s*Box\s+\d+\b/gi;
const DIGIT_RUN_RE = /\d{9,}/g;
// Whitespace gaps here are deliberately bounded ([ \t]{0,3}, never \s* or an
// unbounded [ \t]*) for two reasons: (1) it must never cross a newline, or
// an unbounded scan would skip past masked placeholder spaces onto the next
// line's unrelated text and flag it as residue; (2) even on the same line,
// a masked placeholder plus its surrounding real spacing commonly leaves a
// run of 5+ blank characters before the chart's NEXT field label (e.g. "DOB:
// [DOB]  Insurance: Aetna" masks to "DOB:        Insurance: Aetna" -- an
// unbounded same-line gap would walk straight across that masked region and
// flag "Insurance" as residue). Every placeholder token is at least 5
// characters, so a max gap of 3 can never bridge a masked span while still
// catching a real unredacted value directly after its label.
const LABELED_RESIDUE_RE = /\b(SSN|MRN|DOB|Member[ \t]*ID|Medical[ \t]*Record)\b[ \t]{0,3}[:#][ \t]{0,3}\S/gi;

export function verifyDeidentified(redacted: string, map: Record<string, string>): VerifyResult {
  const normalized = scanNormalize(redacted);
  const masked = maskPlaceholders(normalized);
  const leaks: string[] = [];

  detectMapValueLeaks(masked, map, leaks);
  detectPatientNameVariants(masked, map, leaks);
  findAll(masked, SSN_RE, "ssn", leaks);
  findAll(masked, PHONE_RE, "phone", leaks);
  findAll(masked, EMAIL_RE, "email", leaks);
  findAll(masked, DATE_FULL_RE, "date_full", leaks);
  findAll(masked, ADDRESS_RE, "address_street", leaks);
  findAll(masked, DIGIT_RUN_RE, "digit_run", leaks);
  findAll(masked, LABELED_RESIDUE_RE, "labeled_identifier_residue", leaks);

  return { pass: leaks.length === 0, leaks };
}

export function assertDeidentified(redacted: string, map: Record<string, string>, seam: string): void {
  const { pass, leaks } = verifyDeidentified(redacted, map);
  if (!pass) throw new DeidVerificationError(seam, leaks);
}
