export type DeidentifyResult = {
  redacted: string;
  map: Record<string, string>;
};

export function deidentify(chartText: string): DeidentifyResult {
  const map: Record<string, string> = {};
  let text = chartText;
  let dateCounter = 1;
  const dateIndex = new Map<string, string>();
  let memberIdCounter = 1;
  let zipCounter = 1;
  let npiCounter = 1;
  let deaCounter = 1;
  let emailCounter = 1;
  let ssnCounter = 1;
  let faxCounter = 1;
  let providerCounter = 1;
  const providerIndex = new Map<string, string>();

  const getOrCreateDatePlaceholder = (raw: string): string => {
    const key = raw.trim().toLowerCase();
    if (!dateIndex.has(key)) {
      const ph = `[DATE_${dateCounter++}]`;
      dateIndex.set(key, ph);
      map[ph] = raw.trim();
    }
    return dateIndex.get(key)!;
  };

  // SSN labeled — before unlabeled and before phone to prevent digit confusion
  text = text.replace(
    /\b(SSN|Social\s+Security(?:\s+Number)?)\s*[:\-#]?\s*(\d{3}-\d{2}-\d{4})\b/gi,
    (_, label, ssn) => {
      const ph = `[SSN_${ssnCounter++}]`;
      map[ph] = ssn;
      return `${label}: ${ph}`;
    }
  );
  // SSN unlabeled — after labeled to avoid double-tokenizing
  text = text.replace(
    /\b(\d{3}-\d{2}-\d{4})\b/g,
    (match) => {
      const ph = `[SSN_${ssnCounter++}]`;
      map[ph] = match;
      return ph;
    }
  );

  // Fax — labeled only, before phone (same digit format)
  text = text.replace(
    /(Fax\s*#?)\s*[:\-]?\s*(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})\b/gi,
    (_, label, num) => {
      const ph = `[FAX_${faxCounter++}]`;
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
      const ph = `[MEMBERID_${memberIdCounter++}]`;
      map[ph] = id.trim();
      return `${label}: ${ph}`;
    }
  );

  // NPI — labeled only (10 digits)
  text = text.replace(
    /\b(NPI\s*#?)\s*[:\-]?\s*(\d{10})\b/gi,
    (_, label, npi) => {
      const ph = `[NPI_${npiCounter++}]`;
      map[ph] = npi;
      return `${label}: ${ph}`;
    }
  );

  // DEA — labeled only (2 letters + 7 digits)
  text = text.replace(
    /\b(DEA\s*#?)\s*[:\-]?\s*([A-Z]{2}\d{7})\b/gi,
    (_, label, dea) => {
      const ph = `[DEA_${deaCounter++}]`;
      map[ph] = dea;
      return `${label}: ${ph}`;
    }
  );

  // Email — global, before facility/provider name patterns
  text = text.replace(
    /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    (match) => {
      const ph = `[EMAIL_${emailCounter++}]`;
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
      const ph = `[ZIP_${zipCounter++}]`;
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
        const ph = `[PROVIDER_${providerCounter++}]`;
        providerIndex.set(key, ph);
        map[ph] = match.trim();
      }
      return providerIndex.get(key)!;
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
