// ─────────────────────────────────────────────────────────────────────────
// De-identification pass order (authoritative — do not reorder without
// updating this comment). Each pass runs once, left to right, over the
// output of the previous pass:
//
//   0.  preprocess            (Unicode NFKC, zero-width strip, quote/dash fold)
//   1.  ssn
//   2.  npi                   (before phone — NPI is a labeled 10-digit run)
//   3.  dea
//   4.  device                (labeled serials/lots — before phone/MRN so
//                              alphanumeric serials aren't misparsed as ids)
//   5.  fax
//   6.  phone                 (NANP-with-separators + labeled bare-10-digit)
//   7.  mrn
//   8.  memberId
//   9.  accountLicenseVehicle (vehicle before license: "License Plate" -> vehicle)
//   10. email
//   11. url
//   12. ip
//   13. dob
//   14. dates                 (ISO, numeric, month-name incl. ordinals/day-month,
//                              "Month YYYY", numeric M/YYYY + ranges, late/early
//                              YYYY, no-year M/D with context guards)
//   15. address                (street + P.O. Box)
//   16. cityZip
//   17. ages                  (<90 -> [AGE]; >=90 -> [AGE_90PLUS] == "90+")
//   18. facility
//   19. providerDrPrefixed
//   20. providerCredentialed   ("Name, MD/DO/PA-C/NP/RN/DPM")
//   21. nycMetroCities         (runs AFTER providers so "Dr. Clifton Huntington"
//                              is already tokenized before city-name sweeps)
//   22. contactNames
//   23. patientName            (LAST — variant sweep touches everything else)
//
// Deviations from a naive reading of the spec (intentional, documented here):
//   - Smart double-quotes normalize to a straight SINGLE quote, not `"` --
//     mapping to `"` would inject unescaped quotes into JSON.stringify'd
//     payloads and corrupt the JSON the model reads.
//   - City tokens are numbered + deduped ([CITY_1], [CITY_2], ...) rather than
//     a lossy singleton -- charts routinely mention two distinct cities (home
//     + facility), and a singleton would reidentify the wrong one back in.
//   - The NYC-metro bare-city sweep runs after both provider passes so a
//     surname that collides with a city name is already a [PROVIDER_n] token
//     by the time the city sweep runs.
// ─────────────────────────────────────────────────────────────────────────

import { isSpanAllowlisted } from "./deid-allowlist";

// Per-document de-id audit artifact. Counts/categories ONLY -- never a raw
// redacted value, so this object is always safe to log. `byCategory` counts
// DISTINCT tokens minted per category (derived from map KEYS, not values);
// singleton categories like `phone`/`mrn` collapse many raw occurrences into
// one token, so those counts are distinct-token counts, not occurrence counts.
// A true per-occurrence/per-pass breakdown would require instrumenting the 24
// passes, which is deliberately out of scope (must not touch them).
export type DeidAudit = {
  totalRedacted: number;
  byCategory: Record<string, number>;
  unclassifiedFlagged: number;
};

export type DeidentifyResult = {
  redacted: string;
  map: Record<string, string>;
  audit: DeidAudit;
};

// Shared, mutable state that can be threaded through multiple deidentify()
// calls so placeholder numbering (and singleton fields like [MRN]/[DOB])
// stays consistent instead of restarting per call and colliding.
export type DeidentifyState = {
  map: Record<string, string>;
  dateIndex: Map<string, string>;
  providerIndex: Map<string, string>;
  cityIndex: Map<string, string>;
  contactIndex: Map<string, string>;
  counters: {
    date: number;
    memberId: number;
    zip: number;
    npi: number;
    dea: number;
    email: number;
    ssn: number;
    fax: number;
    provider: number;
    contact: number;
    device: number;
    url: number;
    ip: number;
    account: number;
    license: number;
    vehicle: number;
    city: number;
  };
};

export function createDeidentifyState(): DeidentifyState {
  return {
    map: {},
    dateIndex: new Map(),
    providerIndex: new Map(),
    cityIndex: new Map(),
    contactIndex: new Map(),
    counters: {
      date: 1,
      memberId: 1,
      zip: 1,
      npi: 1,
      dea: 1,
      email: 1,
      ssn: 1,
      fax: 1,
      provider: 1,
      contact: 1,
      device: 1,
      url: 1,
      ip: 1,
      account: 1,
      license: 1,
      vehicle: 1,
      city: 1,
    },
  };
}

// Backfills any counters/indexes missing from a state object that predates
// this shape (defensive only -- createDeidentifyState() always returns the
// full shape; this guards against any state constructed another way).
function ensureStateShape(state: DeidentifyState): DeidentifyState {
  state.cityIndex ??= new Map();
  state.contactIndex ??= new Map();
  const counters = state.counters as Record<string, number>;
  for (const key of ["contact", "device", "url", "ip", "account", "license", "vehicle", "city"]) {
    counters[key] ??= 1;
  }
  return state;
}

// ── Preprocessing ───────────────────────────────────────────────────────
// Offset-preserving only (deletions/1:1 substitutions, never trims/collapses)
// so downstream passes see predictable text. Exported for the stress script.

// Written as explicit \u escapes (not literal invisible characters) so the
// source stays reviewable/diffable.
const ZERO_WIDTH_RE = /[\u200B-\u200F\u2060\uFEFF\u00AD]/g;
const SMART_SINGLE_QUOTES_RE = /[\u2018\u2019\u201A]/g;
// NOTE: smart double-quotes fold to a straight SINGLE quote (not `"`) --
// see the deviation note in the ORDER comment above.
const SMART_DOUBLE_QUOTES_RE = /[\u201C\u201D\u201E]/g;
const DASHES_RE = /[\u2012\u2013\u2014\u2212]/g;
const NBSP_RE = /[\u00A0\u202F]/g;

export function preprocess(input: string): string {
  return input
    .normalize("NFKC")
    .replace(ZERO_WIDTH_RE, "")
    .replace(SMART_SINGLE_QUOTES_RE, "'")
    .replace(SMART_DOUBLE_QUOTES_RE, "'")
    .replace(DASHES_RE, "-")
    .replace(NBSP_RE, " ");
}

// ── Shared helpers ──────────────────────────────────────────────────────

type CounterKey = keyof DeidentifyState["counters"];

function singleton(state: DeidentifyState, token: string, raw: string): string {
  if (!state.map[token]) state.map[token] = raw.trim();
  return token;
}

function numbered(state: DeidentifyState, counterName: CounterKey, prefix: string, raw: string): string {
  const ph = `[${prefix}_${state.counters[counterName]++}]`;
  state.map[ph] = raw.trim();
  return ph;
}

function indexed(
  state: DeidentifyState,
  index: Map<string, string>,
  counterName: CounterKey,
  prefix: string,
  raw: string,
  key: string
): string {
  const existing = index.get(key);
  if (existing) return existing;
  const ph = `[${prefix}_${state.counters[counterName]++}]`;
  index.set(key, ph);
  state.map[ph] = raw.trim();
  return ph;
}

function getOrCreateDatePlaceholder(raw: string, state: DeidentifyState): string {
  const key = raw.trim().toLowerCase();
  return indexed(state, state.dateIndex, "date", "DATE", raw, key);
}

// ── Constants ───────────────────────────────────────────────────────────

const MONTH_ALT =
  "January|February|March|April|May|June|July|August|September|October|November|December|" +
  "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const NAME_STOPWORD =
  "(?!(?:DOB|MRN|SSN|AGE|SEX|DATE|POLICY|PHONE|FAX|ADDRESS|INSURANCE|RACE|GENDER|MD|DO)\\b)";

const CLINICAL_NAME_STOPLIST = new Set(
  [
    "FLEXION", "EXTENSION", "ROTATION", "ABDUCTION", "ADDUCTION", "LIMITED", "RANGE", "MOTION",
    "STRENGTH", "TENDERNESS", "EFFUSION", "EDEMA", "SPRAIN", "STRAIN", "ACUTE", "CHRONIC",
    "SEVERE", "MODERATE", "MILD", "LEFT", "RIGHT", "BILATERAL", "KNEE", "SHOULDER", "HIP",
    "PAIN", "WEAKNESS", "NUMBNESS", "DENIED", "APPROVED", "PENDING", "POSITIVE", "NEGATIVE",
    "NORMAL", "ABNORMAL", "STABLE", "UNSTABLE", "INTACT", "IMPAIRED", "FULL", "PARTIAL",
    "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER",
    "OCTOBER", "NOVEMBER", "DECEMBER",
  ].map((s) => s.toUpperCase())
);

export const FIRST_NAME_STOPLIST = new Set(
  [
    "May", "June", "April", "Rose", "Grace", "Hope", "Joy", "Iris", "Ray", "Bill", "Mark",
    "Art", "Sue", "Pat", "Dawn", "Gene", "Jack", "Don", "Drew", "Grant", "Miles", "Frank",
    "Chase", "Hunter", "Lane", "Amber", "Crystal", "Ginger", "Christian", "Wade", "Chip",
    "Norman", "Chuck", "Rob", "Skip", "Buck", "Hazel", "Olive", "Melody", "Harmony", "Faith",
  ].map((s) => s.toLowerCase())
);

const NYC_METRO_CITIES = [
  "New York City", "New York", "NYC", "Manhattan", "Brooklyn", "The Bronx", "Bronx",
  "Staten Island", "Queens", "Yonkers", "White Plains", "New Rochelle", "Mount Vernon",
  "Long Island", "Hempstead", "Levittown", "Hicksville", "Mineola", "Garden City", "Freeport",
  "Valley Stream", "Huntington", "Babylon", "Islip", "Newark", "Jersey City", "Hoboken",
  "Elizabeth", "Paterson", "Passaic", "Clifton", "Bayonne", "Union City", "East Orange",
  "Hackensack", "Fort Lee", "Edison", "Secaucus",
].sort((a, b) => b.length - a.length); // longest-first so "New York City" beats "New York"

// Real US state/territory postal abbreviations only -- without this
// whitelist, the "City, ST" pattern's naive [A-Z]{2} would treat any
// two-letter medical abbreviation following a capitalized word (e.g.
// "Moderate OA", "HTN, DM" in a problem list) as a state code.
const US_STATE_ABBREVIATIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC", "PR", "VI", "GU",
]);

// ── Individual passes ───────────────────────────────────────────────────

function passSsn(text: string, state: DeidentifyState): string {
  // Leading anchor is (?<![A-Za-z0-9_]) rather than \b: a \b never holds
  // immediately before a quote-prefixed label like "ssn" when it's preceded
  // by whitespace (both sides of that position are non-word characters, so
  // no word-boundary transition exists there) -- this would silently make
  // every JSON-quoted label variant in this file unmatchable. The negative
  // lookbehind for a word character works for both plain-word and
  // quote-prefixed alternatives. Trailing (?![A-Za-z]) prevents the label
  // from fusing with adjacent letters (e.g. matching "Ref" inside "Referred").
  // The quote around the value is captured (not just optionally consumed)
  // and echoed back symmetrically in the replacement -- otherwise, for a
  // JSON-quoted value like "ssn": "123-45-6789", the match would swallow
  // both literal quote characters and the replacement would emit an
  // unquoted placeholder ("ssn": [SSN_1]), which is invalid JSON.
  text = text.replace(
    /(?<![A-Za-z0-9_])(SSN|Social\s+Security(?:\s+Number)?|"ssn")(?![A-Za-z])\s*[:\-#]?\s*("?)(\d{3}[\s\-]\d{2}[\s\-]\d{4})\2/gi,
    (_m, label, q, ssn) => `${label}: ${q}${numbered(state, "ssn", "SSN", ssn)}${q}`
  );
  text = text.replace(/\b(\d{3})-(\d{2})-(\d{4})\b/g, (match) => numbered(state, "ssn", "SSN", match));
  return text;
}

function passNpi(text: string, state: DeidentifyState): string {
  return text.replace(
    /(?<![A-Za-z0-9_])(NPI\s*#?|"npi")(?![A-Za-z])\s*[:\-]?\s*("?)(\d{10})\2/gi,
    (_m, label, q, npi) => `${label}: ${q}${numbered(state, "npi", "NPI", npi)}${q}`
  );
}

function passDea(text: string, state: DeidentifyState): string {
  return text.replace(
    /(?<![A-Za-z0-9_])(DEA\s*#?|"dea")(?![A-Za-z])\s*[:\-]?\s*("?)([A-Z]{2}\d{7})\2/gi,
    (_m, label, q, dea) => `${label}: ${q}${numbered(state, "dea", "DEA", dea)}${q}`
  );
}

function passDevice(text: string, state: DeidentifyState): string {
  return text.replace(
    /\b(Serial(?:\s*(?:Number|No\.?|#))?|Ser\.?|S\/N|SN|Lot(?:\s*#)?|REF|Catalog(?:\s*#)?|Cat\.?\s*#|UDI|Device\s*ID|Implant\s*ID)(?![A-Za-z])\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,})\b/gi,
    (_m, label, id) => `${label}: ${numbered(state, "device", "DEVICE", id)}`
  );
}

function passFax(text: string, state: DeidentifyState): string {
  return text.replace(
    /(Fax\s*#?)(?![A-Za-z])\s*[:\-]?\s*(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})\b/gi,
    (_m, label, num) => `${label}: ${numbered(state, "fax", "FAX", num)}`
  );
}

function passPhone(text: string, state: DeidentifyState): string {
  // NANP with separators -- existing lossy singleton behavior, unchanged.
  text = text.replace(/\(?\b(\d{3})\)?[\s.\-](\d{3})[\s.\-](\d{4})\b/g, (match) =>
    singleton(state, "[PHONE]", match)
  );
  // Labeled bare 10-digit run -- must run AFTER npi (pass 2) so a labeled
  // NPI is never re-captured here.
  text = text.replace(
    /\b(Phone|Ph\.?|Tel(?:ephone)?|Cell|Mobile|Office|Direct|Contact\s*(?:number|no\.?)|Call)(?![A-Za-z])\s*[:#\-]?\s*(\+?1[\s.\-]?)?(\d{10})\b/gi,
    (_m, label, plusOne, digits) => `${label}: ${singleton(state, "[PHONE]", `${plusOne ?? ""}${digits}`)}`
  );
  return text;
}

function passMrn(text: string, state: DeidentifyState): string {
  return text.replace(
    /(?<![A-Za-z0-9_])(mrn|"mrn"|chart\s*(?:number|no\.?|#)?|record\s*(?:number|no\.?|#)?|patient\s*(?:id|number|no\.?|#)|"medical_record_number")(?![A-Za-z])(\s*[:\-#]?\s*)("?)([A-Z0-9][A-Z0-9\-]{3,})\3/gi,
    (_m, label, sep, q, id) => `${label}${sep}${q}${singleton(state, "[MRN]", id)}${q}`
  );
}

function passMemberId(text: string, state: DeidentifyState): string {
  return text.replace(
    /(?<![A-Za-z0-9_])(Member\s+ID|Health\s+Plan\s+ID|Beneficiary\s+ID|Policy\s+#|Policy\s+Number|"member_id")(?![A-Za-z])\s*[:\-]?\s*("?)([A-Z0-9][A-Z0-9\-]{2,})\2/gi,
    (_m, label, q, id) => `${label}: ${q}${numbered(state, "memberId", "MEMBERID", id)}${q}`
  );
}

function passAccountLicenseVehicle(text: string, state: DeidentifyState): string {
  // Vehicle before license so "License Plate" resolves as a vehicle, not a license.
  text = text.replace(
    /\b(VIN|License\s+Plate|Plate\s*#?)(?![A-Za-z])\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\-]{2,})\b/gi,
    (_m, label, id) => `${label}: ${numbered(state, "vehicle", "VEHICLE", id)}`
  );
  text = text.replace(
    /\b(License|Lic\.?|State\s+License)(?![A-Za-z])\s*#?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{2,})\b/gi,
    (_m, label, id) => `${label}: ${numbered(state, "license", "LICENSE", id)}`
  );
  text = text.replace(
    /\b(Account|Acct|Claim|Auth(?:orization)?|Group|Ref(?:erence)?)(?![A-Za-z])\s*(?:#|No\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{2,})\b/gi,
    (_m, label, id) => `${label}: ${numbered(state, "account", "ACCOUNT", id)}`
  );
  return text;
}

function passEmail(text: string, state: DeidentifyState): string {
  return text.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, (match) =>
    numbered(state, "email", "EMAIL", match)
  );
}

function passUrl(text: string, state: DeidentifyState): string {
  return text.replace(/\bhttps?:\/\/[^\s"'<>)\]]+/g, (match) => numbered(state, "url", "URL", match));
}

function passIp(text: string, state: DeidentifyState): string {
  return text.replace(
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    (match) => numbered(state, "ip", "IP", match)
  );
}

function passDob(text: string, state: DeidentifyState): string {
  return text.replace(
    /(?<![A-Za-z0-9_])(d\.?o\.?b\.?|date\s+of\s+birth|"date_of_birth")(?![A-Za-z])\s*[:\-]?\s*("?)(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4})\2/gi,
    (_m, label, q, date) => `${label}: ${q}${singleton(state, "[DOB]", date)}${q}`
  );
}

const DATE_CONTEXT_RE =
  /(?:\bon\b|\bsince\b|\bdated\b|\bseen\b|\bvisit(?:ed)?\b|\binjury\b|\bsurgery\b|\bMRI\b|\bx-?ray\b|\bfollow-?up\b|\bappt\.?\b|\bappointment\b)\s*[:\-]?\s*$/i;
const DATE_CLINICAL_CONTEXT_RE = /\b(ROM|BP|strength|acuity|scale|motor|pulses|reflexes|pain)\b/i;

function passDates(text: string, state: DeidentifyState): string {
  // d0: ISO
  text = text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match) => getOrCreateDatePlaceholder(match, state));
  // d1: numeric full M/D/YY(YY)
  text = text.replace(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g, (match) =>
    getOrCreateDatePlaceholder(match, state)
  );
  // d2: textual month range ("June-August 2024") -- before "Month YYYY" so the
  // trailing month doesn't get captured alone first.
  text = text.replace(
    new RegExp(`\\b(?:${MONTH_ALT})\\.?\\s*-\\s*(?:${MONTH_ALT})\\.?\\s+\\d{4}\\b`, "gi"),
    (match) => getOrCreateDatePlaceholder(match, state)
  );
  // d3: month-name full, incl. ordinals ("January 15th, 2024") and day-month
  // ("15 Jan 2024", "15th of January 2024")
  text = text.replace(
    new RegExp(`\\b(?:${MONTH_ALT})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
    (match) => getOrCreateDatePlaceholder(match, state)
  );
  text = text.replace(
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+of\\s+(?:${MONTH_ALT})\\.?,?\\s+\\d{4}\\b`, "gi"),
    (match) => getOrCreateDatePlaceholder(match, state)
  );
  text = text.replace(
    new RegExp(`\\b\\d{1,2}\\s+(?:${MONTH_ALT})\\.?,?\\s+\\d{4}\\b`, "gi"),
    (match) => getOrCreateDatePlaceholder(match, state)
  );
  // d4: "Month YYYY" partial + "May of 2024"
  text = text.replace(
    new RegExp(`\\b(?:${MONTH_ALT})\\.?\\s+(?:of\\s+)?\\d{4}\\b`, "gi"),
    (match) => getOrCreateDatePlaceholder(match, state)
  );
  // d5: numeric M/YYYY (also handles ranges like "6/2024-8/2024" as two
  // independent matches once dashes are normalized to "-" in preprocess)
  text = text.replace(/\b(0?[1-9]|1[0-2])\/((?:19|20)\d{2})\b/g, (match) =>
    getOrCreateDatePlaceholder(match, state)
  );
  // d6: "late/early YYYY"
  text = text.replace(/\b(late|early)\s+(\d{4})\b/gi, (match) => getOrCreateDatePlaceholder(match, state));
  // d7: no-year M/D, only with explicit date context and never over clinical
  // fraction/scale shapes (motor strength, pain scale, visual acuity, BP).
  text = text.replace(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b(?!\/)/g, (match, _mm, _dd, offset: number, full: string) => {
    if (/^[0-5]\/5$/.test(match)) return match;
    if (/^\d{1,2}\/10$/.test(match)) return match;
    if (/^20\/(20|25|30|40|50|70|100|200)$/.test(match)) return match;
    const nearBefore = full.slice(Math.max(0, offset - 15), offset);
    if (DATE_CLINICAL_CONTEXT_RE.test(nearBefore)) return match;
    const context = full.slice(Math.max(0, offset - 25), offset);
    if (!DATE_CONTEXT_RE.test(context)) return match;
    return getOrCreateDatePlaceholder(match, state);
  });
  return text;
}

function passAddress(text: string, state: DeidentifyState): string {
  text = text.replace(/\bP\.?\s?O\.?\s*Box\s+\d+\b/gi, (match) => singleton(state, "[ADDRESS]", match));
  text = text.replace(
    /\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl)\.?(?:\s+(?:Suite|Ste|Apt|Unit)\.?\s*[A-Z0-9]+)?\b/g,
    (match) => singleton(state, "[ADDRESS]", match)
  );
  return text;
}

const CODE_CONTEXT_RE = /\b(CPT|ICD|HCPCS|DX|code)\b/i;

function passCityZip(text: string, state: DeidentifyState): string {
  // Labeled city field
  text = text.replace(
    /(?<![A-Za-z0-9_])(City|"city")(?![A-Za-z])\s*[:\-]?\s*("?)([A-Z][a-zA-Z .'\-]+?)\2(?=[,\n"]|$)/g,
    (_m, label, q, city) => {
      const ph = indexed(state, state.cityIndex, "city", "CITY", city, city.trim().toLowerCase());
      return `${label}: ${q}${ph}${q}`;
    }
  );
  // "City, ST" pairs
  text = text.replace(/\b([A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+)?),\s*([A-Z]{2})\b/g, (fullMatch, city, state2, offset: number, full: string) => {
    if (!US_STATE_ABBREVIATIONS.has(state2)) return fullMatch;
    if (CLINICAL_NAME_STOPLIST.has(city.toUpperCase())) return fullMatch;
    if (/\b(Dr|Mr|Ms|Mrs|Mx)\.?\s*$/.test(full.slice(Math.max(0, offset - 5), offset))) return fullMatch;
    // A 2-letter match immediately followed by "-<letter>" is a compound
    // credential (e.g. "PA-C" -- Physician Assistant, Certified), not a
    // state abbreviation -- "Jones, PA-C" is a provider, not geography.
    if (/^-[A-Za-z]/.test(full.slice(offset + fullMatch.length, offset + fullMatch.length + 2))) {
      return fullMatch;
    }
    if (state2 === "MD") {
      const after = full.slice(offset + fullMatch.length, offset + fullMatch.length + 10);
      if (!/^\s*\d{5}/.test(after) && !/\d{1,5}\s+[A-Z]/.test(full.slice(Math.max(0, offset - 20), offset))) {
        return fullMatch; // looks like "Smith, MD" (a provider), not geography
      }
    }
    const ph = indexed(state, state.cityIndex, "city", "CITY", city, city.trim().toLowerCase());
    return `${ph}, ${state2}`;
  });
  // ZIP -- only in geo context (after "ST ", after [ADDRESS]/[CITY_n], on
  // address lines); never CPT/ICD/code contexts.
  text = text.replace(/(?<=,\s*[A-Z]{2}\s+)(\d{5}(?:-\d{4})?)\b/g, (match, _zip, offset: number, full: string) => {
    const before = full.slice(Math.max(0, offset - 20), offset);
    if (CODE_CONTEXT_RE.test(before)) return match;
    return numbered(state, "zip", "ZIP", match);
  });
  text = text.replace(/(?<=\[(?:ADDRESS|CITY_\d+)\][,\s]{1,4})(\d{5}(?:-\d{4})?)\b/g, (match, _zip, offset: number, full: string) => {
    const before = full.slice(Math.max(0, offset - 20), offset);
    if (CODE_CONTEXT_RE.test(before)) return match;
    return numbered(state, "zip", "ZIP", match);
  });
  return text;
}

function passAges(text: string, state: DeidentifyState): string {
  const handle = (raw: string, ageStr: string): string => {
    const age = parseInt(ageStr, 10);
    if (age >= 90) return singleton(state, "[AGE_90PLUS]", "90+");
    return singleton(state, "[AGE]", raw);
  };
  text = text.replace(/\b(\d{1,3})[- ]year[- ]old\b/gi, (match, ageStr) => handle(match, ageStr));
  text = text.replace(/\bage\s+(\d{1,3})\b/gi, (match, ageStr) => handle(match, ageStr));
  return text;
}

function passFacility(text: string, state: DeidentifyState): string {
  return text.replace(
    /\b[A-Z][a-zA-Z&'\- ]*(?:Hospital|Clinic|Medical Center|Health System|Surgery Center|Health Center|Orthopedic(?:s| Center)?)\b/g,
    (match) => singleton(state, "[FACILITY]", match)
  );
}

// Dedupe key is the LAST TOKEN (surname) only, not the full name -- this is
// a deliberate, more conservative choice than exact-name matching: a chart
// commonly introduces a provider by full name once ("Sarah Chen, MD") and
// refers to them by surname alone afterward ("Dr. Chen"). Keying on the
// full string would treat those as two different people and mint two
// tokens; keying on surname merges them, which is the safer failure mode
// for PHI redaction (fewer distinct tokens, not more). The tradeoff -- two
// different providers who share a surname get merged into one token -- is
// accepted as a known, documented limitation of regex-based redaction.
function providerKey(name: string): string {
  const cleaned = name
    .replace(/^Dr\.?\s+/i, "")
    .replace(/,?\s+(MD|D\.?O\.?|PA-C|NP|RN|DPM)\.?$/i, "")
    .trim()
    .toLowerCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] ?? cleaned;
}

function passProviderDrPrefixed(text: string, state: DeidentifyState): string {
  return text.replace(/\bDr\.?[ \t]+([A-Z][a-zA-Z'\-]+(?:[ \t]+[A-Z][a-zA-Z'\-]+)?)\b/g, (match) =>
    indexed(state, state.providerIndex, "provider", "PROVIDER", match, providerKey(match))
  );
}

function passProviderCredentialed(text: string, state: DeidentifyState): string {
  return text.replace(
    /\b([A-Z][a-zA-Z'\-]+(?:[ \t][A-Z]\.?)?(?:[ \t][A-Z][a-zA-Z'\-]+)?),?[ \t]+(MD|D\.?O\.?|PA-C|NP|RN|DPM)\b/g,
    (_match, name, credential) => {
      const ph = indexed(state, state.providerIndex, "provider", "PROVIDER", name, providerKey(name));
      return `${ph}, ${credential}`;
    }
  );
}

function passNycMetroCities(text: string, state: DeidentifyState): string {
  for (const city of NYC_METRO_CITIES) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b(?:Dr|Mr|Ms|Mrs|Mx)\\.?[ \\t]+${escaped}\\b|\\b${escaped}\\b(?![ \\t]+[A-Z][a-z])`, "g");
    text = text.replace(re, (match) => {
      // Skip if the honorific-prefixed alternative matched (person's name, not a city)
      if (new RegExp(`^(?:Dr|Mr|Ms|Mrs|Mx)\\.?[ \\t]+`, "i").test(match)) return match;
      const ph = indexed(state, state.cityIndex, "city", "CITY", city, city.toLowerCase());
      return ph;
    });
  }
  return text;
}

function passContactNames(text: string, state: DeidentifyState): string {
  const stopword = NAME_STOPWORD;
  const namePattern = `([A-Z][A-Za-z'\\-]+(?:,)?(?:[ \\t]+${stopword}[A-Z][A-Za-z'.\\-]*){0,3})`;
  const re = new RegExp(
    `\\b(Emergency\\s+contact|Spouse|Wife|Husband|Next\\s+of\\s+kin|Guardian|Caregiver|Contact\\s+person)(\\s+name)?\\s*[:\\-]\\s*${namePattern}`,
    "gi"
  );
  return text.replace(re, (_match, label, nameSuffix, name) => {
    const trimmed = name.trim();
    const ph = indexed(state, state.contactIndex, "contact", "CONTACT", trimmed, trimmed.toLowerCase());
    // Sweep the exact captured full-name string elsewhere in the text too
    // (full-name only -- not individual tokens, to avoid over-redacting
    // common words shared with contact first/last names).
    return `${label}${nameSuffix ?? ""}: ${ph}`;
  });
}

function sweepContactFullNames(text: string, state: DeidentifyState): string {
  for (const [name, ph] of Array.from(state.contactIndex.entries())) {
    if (name.length < 3) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}(?![A-Za-z0-9_])`, "gi"), ph);
  }
  return text;
}

const SUFFIX_RE = "(?:Jr|Sr|II|III|IV)\\.?";

type NameParts = { first: string | null; middle: string | null; last: string; suffix: string | null };

function parseNameParts(raw: string): NameParts {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const suffixMatch = cleaned.match(new RegExp(`,?\\s+(${SUFFIX_RE})$`, "i"));
  const suffix = suffixMatch ? suffixMatch[1] : null;
  const withoutSuffix = suffixMatch ? cleaned.slice(0, suffixMatch.index).trim() : cleaned;

  if (withoutSuffix.includes(",")) {
    const [lastPart, restPart] = withoutSuffix.split(",").map((s) => s.trim());
    const restTokens = restPart ? restPart.split(" ").filter(Boolean) : [];
    return {
      last: lastPart,
      first: restTokens[0] ?? null,
      middle: restTokens.length > 1 ? restTokens.slice(1).join(" ") : null,
      suffix,
    };
  }
  const tokens = withoutSuffix.split(" ").filter(Boolean);
  if (tokens.length === 1) return { first: null, middle: null, last: tokens[0], suffix };
  return {
    first: tokens[0],
    middle: tokens.length > 2 ? tokens.slice(1, -1).join(" ") : null,
    last: tokens[tokens.length - 1],
    suffix,
  };
}

function nameVariants(parts: NameParts): string[] {
  const variants: string[] = [];
  const { first, middle, last, suffix } = parts;
  const suffixStr = suffix ? ` ${suffix.replace(/\.$/, "")}` : "";

  if (first) {
    variants.push(`${first} ${last}${suffixStr}`);
    if (middle) variants.push(`${first} ${middle} ${last}${suffixStr}`);
    variants.push(`${last}, ${first}${suffixStr}`);
    if (middle) variants.push(`${last}, ${first} ${middle}${suffixStr}`);
    for (const h of ["Mr", "Ms", "Mrs", "Mx"]) variants.push(`${h}. ${last}`);
  }
  // Last name always redacted -- including each half of a hyphenated surname.
  variants.push(last);
  for (const half of last.split("-")) {
    if (half.length > 1) variants.push(half);
  }
  if (first && first.length >= 3 && !FIRST_NAME_STOPLIST.has(first.toLowerCase())) {
    variants.push(first);
  }
  return Array.from(new Set(variants)).sort((a, b) => b.length - a.length);
}

function sweepNameVariants(text: string, name: string, token: string): string {
  const parts = parseNameParts(name);
  for (const variant of nameVariants(parts)) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}(?![A-Za-z0-9_])`, "gi"), token);
  }
  return text;
}

function detectPatientName(text: string): string | null {
  const stopword = NAME_STOPWORD;
  const namePattern = `([A-Z][A-Za-z'\\-]+(?:,)?(?:[ \\t]+${stopword}[A-Z][A-Za-z'.\\-]*){0,3}(?:,?\\s+${SUFFIX_RE})?)`;

  // p1: labeled prose + JSON-quoted key
  const p1 =
    text.match(new RegExp(`"?patient_name"?\\s*[:\\-]\\s*"?${namePattern}`, "i")) ??
    text.match(new RegExp(`\\bpatient(?:'s)?\\s+name\\s*[:\\-]\\s*"?${namePattern}`, "i")) ??
    text.match(new RegExp(`\\bpatient\\s*[:\\-]\\s*"?${namePattern}`, "i")) ??
    text.match(new RegExp(`\\bpt\\.?\\s*[:\\-]\\s*"?${namePattern}`, "i")) ??
    text.match(new RegExp(`\\bname\\s*[:\\-]\\s*"?${namePattern}`, "i"));
  if (p1?.[1]) return p1[1].trim();

  // p2: "Re:" lines -- "Re: Webb, Marcus - DOB..." / "Re: Marcus Webb"
  const reMatch = text.match(
    new RegExp(
      `\\bRe:\\s*(?:Patient:?\\s*)?([A-Z][A-Za-z'\\-]+(?:,\\s*[A-Z][A-Za-z'.\\-]*)?(?:[ \\t]+[A-Z][A-Za-z'.\\-]*){0,2})(?=\\s*[-,(]|\\s+DOB|\\s+MRN|[\\r\\n]|$)`,
      "im"
    )
  );
  if (reMatch?.[1]) return reMatch[1].trim();

  // p3: "LAST, FIRST( M.)" header line (incl. ALL-CAPS), near the top of the
  // document or adjacent to a DOB/MRN marker, tokens screened against the
  // clinical-phrase stoplist ("FLEXION, LIMITED" is not a name).
  const lines = text.split("\n");
  const headerRe = /^[ \t]*([A-Z][A-Za-z'\-]{1,30}),\s*([A-Z][A-Za-z'\-]{1,30})(?:\s+([A-Z])\.?)?[ \t]*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 40) continue;
    const m = line.match(headerRe);
    if (!m) continue;
    const [, last, first] = m;
    if (CLINICAL_NAME_STOPLIST.has(last.toUpperCase()) || CLINICAL_NAME_STOPLIST.has(first.toUpperCase())) continue;
    const nearTop = i < 15;
    const nearIdMarker = lines
      .slice(Math.max(0, i - 2), Math.min(lines.length, i + 3))
      .some((l) => /\b(DOB|MRN)\b/i.test(l));
    if (nearTop || nearIdMarker) return line.trim();
  }

  // p4: "Last, First" on the same line as a DOB/MRN token, anywhere.
  for (const line of lines) {
    if (!/\b(DOB|MRN)\b/i.test(line)) continue;
    const m = line.match(/\b([A-Z][A-Za-z'\-]+),\s*([A-Z][A-Za-z'\-]+)\b/);
    if (m && !CLINICAL_NAME_STOPLIST.has(m[1].toUpperCase()) && !CLINICAL_NAME_STOPLIST.has(m[2].toUpperCase())) {
      return `${m[1]}, ${m[2]}`;
    }
  }

  return null;
}

function passPatientName(text: string, state: DeidentifyState): string {
  // p5: inherit a name already seeded into shared state (e.g. structural
  // pull of extracted patient_name, or a prior deidentify() call on the
  // same shared state) rather than overwriting it.
  const existing = state.map["[PATIENT_NAME]"];
  const name = existing ?? detectPatientName(text);
  if (!name) return text;
  if (!existing) state.map["[PATIENT_NAME]"] = name;
  return sweepNameVariants(text, name, "[PATIENT_NAME]");
}

// ── Ordered pass registry ───────────────────────────────────────────────

const PASSES: ReadonlyArray<readonly [string, (text: string, state: DeidentifyState) => string]> = [
  ["ssn", passSsn],
  ["npi", passNpi],
  ["dea", passDea],
  ["device", passDevice],
  ["fax", passFax],
  ["phone", passPhone],
  ["mrn", passMrn],
  ["memberId", passMemberId],
  ["accountLicenseVehicle", passAccountLicenseVehicle],
  ["email", passEmail],
  ["url", passUrl],
  ["ip", passIp],
  ["dob", passDob],
  ["dates", passDates],
  ["address", passAddress],
  ["cityZip", passCityZip],
  ["ages", passAges],
  ["facility", passFacility],
  ["providerDrPrefixed", passProviderDrPrefixed],
  ["providerCredentialed", passProviderCredentialed],
  ["nycMetroCities", passNycMetroCities],
  ["contactNames", passContactNames],
  ["contactNamesSweep", sweepContactFullNames],
  ["patientName", passPatientName],
];

// ── Fail-closed residual pass (FINAL -- runs after all 24 passes) ─────────
// Fixes the fail-open gap: any span the 24 passes never matched used to reach
// the API as "confirmed not PHI." This pass masks anything left unredacted that
// looks like a name or a PHI-length identifier, biasing aggressively toward
// over-masking. The detector is intentionally dumb -- lib/deid-allowlist.ts
// carries the exceptions, and growing it is the tuning path.
//
// The mask token is a SINGLETON, NON-REVERSIBLE [REDACTED]: it is deliberately
// NOT written to state.map, so reidentify() leaves it in place forever. That is
// the fail-closed property -- a name the passes missed can never round-trip
// back. Cost: an over-masked clean term also stays [REDACTED] (the measured FP).
//
// Word token = one Titlecase segment, optionally camelCase-joined ("NexGen"),
// but NEVER all-caps -- so clinical abbreviations (HPI, MRI, ACL, ROM) and ICD
// codes (M17) are not name-shaped and are left alone.
const RESIDUAL_TOKEN = String.raw`\[[A-Z][A-Z0-9_]*\]`;
// A unit is Titlecase/camelCase, optionally prefixed by a single-letter+hyphen
// so eponymic/imaging compounds ("X-Ray", "T-Score") match as one unit instead
// of mis-parsing to their trailing word ("Ray", "Score").
const RESIDUAL_WORD = String.raw`(?:[A-Z]-)?[A-Z][a-z]+(?:[A-Z][a-z]+)*`;
const RESIDUAL_NAME = `${RESIDUAL_WORD}(?:['\\-]${RESIDUAL_WORD})*`;
const RESIDUAL_MULTI = `${RESIDUAL_NAME}(?:[ \\t]+${RESIDUAL_NAME})+`;
const RESIDUAL_DIGITS = String.raw`\d{5,}`;
// Order matters: existing token first (leave alone), multi-word name before
// single (so "John Smith" masks as one unit, not "John" + kept "Smith"), then
// single name, then digit-dense.
const RESIDUAL_RE = new RegExp(
  `(${RESIDUAL_TOKEN})|(${RESIDUAL_MULTI})|(${RESIDUAL_NAME})|(${RESIDUAL_DIGITS})`,
  "g"
);

function passResidualUnknowns(text: string): { text: string; flagged: string[] } {
  const flagged: string[] = [];
  const out = text.replace(
    RESIDUAL_RE,
    (match: string, gToken: string | undefined, _gMulti: string | undefined, _gName: string | undefined, gDigits: string | undefined) => {
      // Branch 1: an already-redacted token -- never re-touch it.
      if (gToken !== undefined) return match;
      // Branch 2: digit-dense. A bare 5-digit run is CPT/ZIP-shaped (not
      // date-shaped -- dates are already tokens -- and not SSN-shaped, which is
      // 9) -> keep, so a billed CPT code is never masked. 6+ digits is
      // phone/MRN/SSN-length -> mask. (ICD digit groups and clinical fractions
      // n/n are short or slash-separated and never match a bare \d{5,} run.)
      if (gDigits !== undefined) {
        if (match.length === 5) return match;
        flagged.push(match);
        return "[REDACTED]";
      }
      // Branch 3/4: name-shaped (multi-word or single). Keep if the whole
      // phrase is allowlisted or (multi-word) every token is; else mask.
      if (isSpanAllowlisted(match)) return match;
      flagged.push(match);
      return "[REDACTED]";
    }
  );
  return { text: out, flagged };
}

function buildAudit(map: Record<string, string>, unclassifiedFlagged: number): DeidAudit {
  const byCategory: Record<string, number> = {};
  for (const key of Object.keys(map)) {
    const inner = key.replace(/^\[|\]$/g, "");
    const cat = inner.replace(/_\d+$/, "").toLowerCase();
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }
  if (unclassifiedFlagged > 0) byCategory.unclassified_flagged = unclassifiedFlagged;
  return {
    totalRedacted: Object.keys(map).length + unclassifiedFlagged,
    byCategory,
    unclassifiedFlagged,
  };
}

export function deidentify(chartText: string, sharedState?: DeidentifyState): DeidentifyResult {
  const state = ensureStateShape(sharedState ?? createDeidentifyState());
  let text = preprocess(chartText);
  for (const [, run] of PASSES) {
    text = run(text, state);
  }
  const residual = passResidualUnknowns(text);
  return {
    redacted: residual.text,
    map: state.map,
    audit: buildAudit(state.map, residual.flagged.length),
  };
}

// Inverse of reidentify(): re-applies a map of already-discovered
// placeholder -> raw-value pairs to a value tree (e.g. the reidentified
// extraction result, before it is JSON.stringify'd, at the letter-generation
// seam) by literal substring match over each string leaf, before
// deidentify()'s regex passes run. This exists because reidentifyDeep()
// round-trips a raw PHI value back into downstream data in WHATEVER exact
// form deidentify() originally captured it in (a date's separators, an
// ordinal suffix, a prose vs. numeric format, etc.) -- there is no guarantee
// that exact form matches any of this module's detection regexes when
// re-scanned cold in a fresh pass. A literal, case-insensitive substring
// replace sidesteps that: if deidentify() found it once, it is masked
// forever, regardless of format. The regex passes remain the catch-all for
// genuinely new PHI-shaped text introduced downstream (e.g. an LLM
// paraphrase) that was never in the map to begin with.
//
// Deliberately operates on string LEAVES, not the JSON.stringify'd text --
// stringify escapes `"`/`\` inside a raw value (e.g. a name or address
// containing a quote), which would desync the literal match from the
// now-escaped substring and let that occurrence fall through unmasked.
// Substituting before serialization means only safe bracket-token text
// (never containing a quote or backslash) is present when stringify runs.
function applyKnownMapToString(text: string, entries: ReadonlyArray<readonly [string, string]>): string {
  for (const [token, raw] of entries) {
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "gi"), token);
  }
  return text;
}

export function applyKnownMap<T>(value: T, map: Record<string, string>): T {
  const entries = Object.entries(map)
    .map(([token, raw]) => [token, raw.trim()] as const)
    .filter(([, raw]) => raw.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return applyKnownMapToString(v, entries);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

// Bumps a fresh DeidentifyState's counters past any numbered token already
// present in a KNOWN map (e.g. one applied via applyKnownMap() into the same
// text) so that new tokens this state mints during its own regex passes can
// never collide with an already-embedded token backed by a different raw
// value. Without this, e.g. a pre-existing "[DATE_1]" from applyKnownMap and
// a freshly-minted "[DATE_1]" for a different date would share one map slot
// (last write wins), silently swapping one patient's date for another's at
// reidentify() time -- not a redaction leak, but a PHI-integrity bug.
const TOKEN_COUNTER_BY_PREFIX: Record<string, CounterKey> = {
  DATE: "date",
  MEMBERID: "memberId",
  ZIP: "zip",
  NPI: "npi",
  DEA: "dea",
  EMAIL: "email",
  SSN: "ssn",
  FAX: "fax",
  PROVIDER: "provider",
  CONTACT: "contact",
  DEVICE: "device",
  URL: "url",
  IP: "ip",
  ACCOUNT: "account",
  LICENSE: "license",
  VEHICLE: "vehicle",
  CITY: "city",
};

export function seedCountersPastKnownMap(state: DeidentifyState, map: Record<string, string>): void {
  for (const key of Object.keys(map)) {
    const m = key.match(/^\[([A-Z]+)_(\d+)\]$/);
    if (!m) continue;
    const counterName = TOKEN_COUNTER_BY_PREFIX[m[1]];
    if (!counterName) continue;
    const num = parseInt(m[2], 10);
    if (num >= state.counters[counterName]) state.counters[counterName] = num + 1;
  }
}

export function reidentify(text: string, map: Record<string, string>): string {
  let out = text;
  const entries = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  for (const [placeholder, real] of entries) {
    out = out.replaceAll(placeholder, real);
  }
  return out;
}

// Re-identifies string values inside a parsed object tree in place of each
// field, instead of round-tripping through JSON.stringify/JSON.parse. This
// avoids corrupting JSON structure when a real PHI value contains a `"` or
// `\` character that isn't valid unescaped inside a JSON string.
export function reidentifyDeep<T>(value: T, map: Record<string, string>): T {
  if (typeof value === "string") {
    return reidentify(value, map).replace(/[\x01-\x1F\x7F-\x9F]/g, " ") as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => reidentifyDeep(item, map)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reidentifyDeep(v, map);
    }
    return out as unknown as T;
  }
  return value;
}
