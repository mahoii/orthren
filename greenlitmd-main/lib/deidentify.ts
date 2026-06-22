export type DeidentifyResult = {
  redacted: string;
  map: Record<string, string>;
};

export function deidentify(chartText: string): DeidentifyResult {
  const map: Record<string, string> = {};
  let text = chartText;
  let dateCounter = 1;
  const dateIndex = new Map<string, string>();

  const getOrCreateDatePlaceholder = (raw: string): string => {
    const key = raw.trim().toLowerCase();
    if (!dateIndex.has(key)) {
      const ph = `[DATE_${dateCounter++}]`;
      dateIndex.set(key, ph);
      map[ph] = raw.trim();
    }
    return dateIndex.get(key)!;
  };

  // MRN — before dates to avoid digit overlap
  text = text.replace(
    /\b(mrn|chart\s*(?:number|no\.?|#)?|record\s*(?:number|no\.?|#)?|patient\s*(?:id|number|no\.?|#))\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\-]{3,})/gi,
    (_, label, id) => {
      if (!map["[MRN]"]) map["[MRN]"] = id;
      return `${label} [MRN]`;
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

  // Labeled DOB — before general date sweep
  text = text.replace(
    /\b(d\.?o\.?b\.?|date\s+of\s+birth)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    (_, label, date) => {
      if (!map["[DOB]"]) map["[DOB]"] = date;
      return `${label}: [DOB]`;
    }
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

  // Addresses (street number + street name + suffix)
  text = text.replace(
    /\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Za-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Way|Court|Ct|Place|Pl)\.?(?:\s+(?:Suite|Ste|Apt|Unit)\.?\s*[A-Z0-9]+)?\b/g,
    (match) => {
      if (!map["[ADDRESS]"]) map["[ADDRESS]"] = match.trim();
      return "[ADDRESS]";
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

  // Provider names (Dr. / Dr variants)
  text = text.replace(
    /\bDr\.?\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\b/g,
    (match) => {
      if (!map["[PROVIDER]"]) map["[PROVIDER]"] = match.trim();
      return "[PROVIDER]";
    }
  );

  // Patient name — extract from labeled field, then replace all occurrences globally
  const nameMatch = text.match(
    /(?:patient(?:\s+name)?|name)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/i
  );
  if (nameMatch?.[1]) {
    const name = nameMatch[1].trim();
    map["[PATIENT_NAME]"] = name;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "g"), "[PATIENT_NAME]");
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
