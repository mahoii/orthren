export type DeidentifyResult = {
  redacted: string;
  map: Record<string, string>;
};

// Shared, mutable state that can be threaded through multiple deidentify()
// calls so placeholder numbering (and singleton fields like [MRN]/[DOB])
// stays consistent instead of restarting per call and colliding.
export type DeidentifyState = {
  map: Record<string, string>;
  dateIndex: Map<string, string>;
  providerIndex: Map<string, string>;
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
  };
};

export function createDeidentifyState(): DeidentifyState {
  return {
    map: {},
    dateIndex: new Map(),
    providerIndex: new Map(),
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
    },
  };
}

export function deidentify(chartText: string, sharedState?: DeidentifyState): DeidentifyResult {
  const state = sharedState ?? createDeidentifyState();
  const map = state.map;
  const dateIndex = state.dateIndex;
  const providerIndex = state.providerIndex;
  const counters = state.counters;
  let text = chartText;

  const getOrCreateDatePlaceholder = (raw: string): string => {
    const key = raw.trim().toLowerCase();
    if (!dateIndex.has(key)) {
      const ph = `[DATE_${counters.date++}]`;
      dateIndex.set(key, ph);
      map[ph] = raw.trim();
    }
    return dateIndex.get(key)!;
  };

  // SSN labeled — before unlabeled and before phone to prevent digit confusion
  text = text.replace(
    /\b(SSN|Social\s+Security(?:\s+Number)?)\s*[:\-#]?\s*(\d{3}-\d{2}-\d{4})\b/gi,
    (_, label, ssn) => {
      const ph = `[SSN_${counters.ssn++}]`;
      map[ph] = ssn;
      return `${label}: ${ph}`;
    }
  );
  // SSN unlabeled — after labeled to avoid double-tokenizing
  text = text.replace(
    /\b(\d{3}-\d{2}-\d{4})\b/g,
    (match) => {
      const ph = `[SSN_${counters.ssn++}]`;
      map[ph] = match;
      return ph;
    }
  );

  // Fax — labeled only, before phone (same digit format)
  text = text.replace(
    /(Fax\s*#?)\s*[:\-]?\s*(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})\b/gi,
    (_, label, num) => {
      const ph = `[FAX_${counters.fax++}]`;
      map[ph] = num.trim();
      return `${label}: ${ph}`;
    }
  );

  // MRN — before dates to avoid digit overlap
  text = text.replace(
    /\b(mrn|chart\s*(?:number|no\.?|#)?|record\s*(?:number|no\.?|#)?|patient\s*(?:id|number|no\.?|#))(\s*[:\-#]?\s*)([A-Z0-9][A-Z0-9\-]{3,})/gi,
    (_, label, sep, id) => {
      if (!map["[MRN]"]) map["[MRN]"] = id;
      return `${label}${sep}[MRN]`;
    }
  );

  // Phone numbers
  text = text.replace(
    /\(?\b(\d{3})\)?[\s.\-](\d{3})[\s.\-](\d{4})\b/g,
    (match) => {
      if (!map["[PHONE]"]) map["[PHONE]"] = match;
      return "[PHONE]";
    }
  );

  // Health plan / member ID (labeled fields only)
  text = text.replace(
    /\b(Member\s+ID|Health\s+Plan\s+ID|Beneficiary\s+ID|Policy\s+#|Policy\s+Number)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{2,})\b/gi,
    (_, label, id) => {
      const ph = `[MEMBERID_${counters.memberId++}]`;
      map[ph] = id.trim();
      return `${label}: ${ph}`;
    }
  );

  // NPI — labeled only (10 digits)
  text = text.replace(
    /\b(NPI\s*#?)\s*[:\-]?\s*(\d{10})\b/gi,
    (_, label, npi) => {
      const ph = `[NPI_${counters.npi++}]`;
      map[ph] = npi;
      return `${label}: ${ph}`;
    }
  );

  // DEA — labeled only (2 letters + 7 digits)
  text = text.replace(
    /\b(DEA\s*#?)\s*[:\-]?\s*([A-Z]{2}\d{7})\b/gi,
    (_, label, dea) => {
      const ph = `[DEA_${counters.dea++}]`;
      map[ph] = dea;
      return `${label}: ${ph}`;
    }
  );

  // Email — global, before facility/provider name patterns
  text = text.replace(
    /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    (match) => {
      const ph = `[EMAIL_${counters.email++}]`;
      map[ph] = match;
      return ph;
    }
  );

  // Labeled DOB — before general date sweep
  text = text.replace(
    /\b(d\.?o\.?b\.?|date\s+of\s+birth)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    (_, label, date) => {
      if (!map["[DOB]"]) map["[DOB]"] = date;
      return `${label}: [DOB]`;
    }
  );

  // ISO dates YYYY-MM-DD — before MM/DD/YYYY to avoid partial re-capture
  text = text.replace(
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    (match) => getOrCreateDatePlaceholder(match)
  );

  // Numeric dates (MM/DD/YYYY, MM-DD-YYYY, etc.)
  text = text.replace(
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g,
    (match) => getOrCreateDatePlaceholder(match)
  );

  // Month-name dates (January 15, 2024 / Jan 15 2024 / etc.)
  text = text.replace(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b/gi,
    (match) => getOrCreateDatePlaceholder(match)
  );

  // "Month YYYY" partial dates (e.g. "March 2024") — no day between month and year
  text = text.replace(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}\b/gi,
    (match) => getOrCreateDatePlaceholder(match)
  );

  // "late/early YYYY" partial date references
  text = text.replace(
    /\b(late|early)\s+(\d{4})\b/gi,
    (match) => getOrCreateDatePlaceholder(match)
  );

  // Addresses (street number + street name + suffix)
  text = text.replace(
    /\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl)\.?(?:\s+(?:Suite|Ste|Apt|Unit)\.?\s*[A-Z0-9]+)?\b/g,
    (match) => {
      if (!map["[ADDRESS]"]) map["[ADDRESS]"] = match.trim();
      return "[ADDRESS]";
    }
  );

  // ZIP codes — after address redaction; only match when preceded by state abbreviation context
  // Lookbehind ensures we only redact ZIPs in "City, ST NNNNN" format, not CPT/diagnosis codes
  text = text.replace(
    /(?<=,\s*[A-Z]{2}\s+)(\d{5}(?:-\d{4})?)\b/g,
    (match) => {
      const ph = `[ZIP_${counters.zip++}]`;
      map[ph] = match;
      return ph;
    }
  );

  // Ages — "64-year-old" and "age 64"
  text = text.replace(/\b(\d{1,3})[- ]year[- ]old\b/gi, (match) => {
    if (!map["[AGE]"]) map["[AGE]"] = match;
    return "[AGE]";
  });
  text = text.replace(/\bage\s+(\d{1,3})\b/gi, (match) => {
    if (!map["[AGE]"]) map["[AGE]"] = match;
    return "[AGE]";
  });

  // Facility names (before provider to prevent capturing "Dr" inside a facility name)
  text = text.replace(
    /\b[A-Z][a-zA-Z&'\- ]*(?:Hospital|Clinic|Medical Center|Health System|Surgery Center|Health Center|Orthopedic(?:s| Center)?)\b/g,
    (match) => {
      if (!map["[FACILITY]"]) map["[FACILITY]"] = match.trim();
      return "[FACILITY]";
    }
  );

  // Provider names (Dr. / Dr variants) — distinct names get distinct tokens; [ \t]+ prevents cross-line capture
  text = text.replace(
    /\bDr\.?[ \t]+([A-Z][a-zA-Z'\-]+(?:[ \t]+[A-Z][a-zA-Z'\-]+)?)\b/g,
    (match) => {
      const key = match.trim().toLowerCase();
      if (!providerIndex.has(key)) {
        const ph = `[PROVIDER_${counters.provider++}]`;
        providerIndex.set(key, ph);
        map[ph] = match.trim();
      }
      return providerIndex.get(key)!;
    }
  );

  // Patient name — extract from labeled field, then replace all occurrences globally.
  // Whitespace inside the name is restricted to [ \t] (never \n) so a line break
  // can't pull the next line's token into the captured name. Allows "Last, First",
  // middle initials, and ALL-CAPS surnames.
  // Prefer a "patient"-qualified label over a bare "name:" label — a bare "name:"
  // match() only returns the first hit in the whole text, so without this
  // prioritization an earlier "Emergency contact name:" / "Guardian name:" field
  // would be captured instead of the actual patient.
  // The stopword lookahead guards against messy single-line charts where the
  // next field's label directly follows the name with no punctuation (e.g.
  // "PATIENT: Robert Chen DOB 11/14/1978") — without it, "DOB" gets swallowed
  // as a trailing name token and later corrupts the [DOB] placeholder itself
  // when the per-token redaction pass below runs.
  const stopword =
    "(?!(?:DOB|MRN|SSN|AGE|SEX|DOB|DATE|POLICY|PHONE|FAX|ADDRESS|INSURANCE|RACE|GENDER|MD|DO)\\b)";
  const namePattern = `([A-Z][A-Za-z'\\-]+(?:,)?(?:[ \\t]+${stopword}[A-Z][A-Za-z'.\\-]*){0,3})`;
  const nameMatch =
    text.match(new RegExp(`\\bpatient(?:'s)?\\s+name\\s*[:\\-]\\s*${namePattern}`, "i")) ??
    text.match(new RegExp(`\\bpatient\\s*[:\\-]\\s*${namePattern}`, "i")) ??
    text.match(new RegExp(`\\bpt\\.?\\s*[:\\-]\\s*${namePattern}`, "i")) ??
    text.match(new RegExp(`\\bname\\s*[:\\-]\\s*${namePattern}`, "i"));
  if (nameMatch?.[1]) {
    const name = nameMatch[1].trim();
    map["[PATIENT_NAME]"] = name;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Right-side boundary uses a negative lookahead instead of \b: when name
    // ends in a middle-initial period ("Maria A."), \b never matches between
    // "." and a following space/newline (neither is a \w character), which
    // silently no-ops this replace and leaves the initial in cleartext.
    text = text.replace(new RegExp(`\\b${escaped}(?![A-Za-z0-9_])`, "g"), "[PATIENT_NAME]");

    // Also redact each individual name token (last name, first name, etc.)
    // wherever it appears on its own elsewhere in the text — not just the
    // exact "Last, First M." string captured above. Skip bare single-letter
    // initials to avoid over-redacting unrelated single letters.
    const tokens = name
      .replace(/,/g, " ")
      .split(/[ \t]+/)
      .map((t) => t.replace(/\.+$/, "").trim())
      .filter((t) => t.length > 1);

    for (const token of tokens) {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`\\b${escapedToken}\\b`, "g"), "[PATIENT_NAME]");
    }
  }

  return { redacted: text, map };
}

export function reidentify(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [placeholder, real] of Object.entries(map)) {
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
