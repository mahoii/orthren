export type LetterPlaceholderContext = {
  patientName?: string | null;
  dateOfBirth?: string | null;
  payerName?: string | null;
  providerName?: string | null;
  practiceName?: string | null;
  cptCode?: string | null;
  requestedProcedure?: string | null;
  date?: Date;
};

export function sanitizeLetterPlaceholders(letter: string, context: LetterPlaceholderContext) {
  const generatedDate = formatLetterDate(context.date ?? new Date());
  const patientName = cleanValue(context.patientName);
  const dateOfBirth = cleanValue(context.dateOfBirth);
  const payerName = cleanValue(context.payerName);
  const providerName = cleanValue(context.providerName);
  const practiceName = cleanValue(context.practiceName);
  const cptCode = cleanValue(context.cptCode);
  const requestedProcedure = cleanValue(context.requestedProcedure);
  const payerAddressBlock = [payerName, "Prior Authorization Department"].filter(Boolean).join("\n");
  const letterhead = [providerName, practiceName].filter(Boolean).join("\n");

  let sanitized = letter;

  sanitized = replacePayerAddressBlock(sanitized, payerName, payerAddressBlock || "Prior Authorization Department");

  sanitized = replaceBracketValue(sanitized, "DATE", generatedDate);
  sanitized = replaceBracketValue(sanitized, "LETTERHEAD OR MEDICAL PRACTICE LETTERHEAD", letterhead);
  sanitized = replaceBracketValue(sanitized, "ADDRESS", payerName ?? "");
  sanitized = replaceBracketValue(sanitized, "City, State, ZIP", "Prior Authorization Department");
  sanitized = replaceBracketValue(sanitized, "MD/DO", "MD");
  sanitized = replaceBracketValue(sanitized, "Medical Practice", practiceName ?? "");
  sanitized = replaceBracketValue(sanitized, "Contact Information", providerName ?? "");

  sanitized = sanitized.replace(/\[([^\]]+)\]/g, (match, label: string) => {
    const value = knownPlaceholderValue(label, {
      patientName,
      dateOfBirth,
      payerName,
      providerName,
      practiceName,
      cptCode,
      requestedProcedure,
      generatedDate
    });

    return value ?? match;
  });

  return ensureSignatureBlock(removeRemainingBracketLines(sanitized), providerName, practiceName);
}

export function formatLetterDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function cleanValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function replaceBracketValue(text: string, label: string, replacement: string) {
  const escapedLabel = escapeRegExp(label);
  const exactLinePattern = new RegExp(`^[ \\t]*\\[${escapedLabel}\\][ \\t]*$`, "gim");
  const inlinePattern = new RegExp(`\\[${escapedLabel}\\]`, "gi");

  return text.replace(exactLinePattern, () => replacement).replace(inlinePattern, () => replacement);
}

function replacePayerAddressBlock(text: string, payerName: string | null, replacement: string) {
  const lines = text.split(/\r?\n/);
  const nextLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];
    const isAddressLine = Boolean(line?.trim().match(/^\[ADDRESS\]$/i));
    const isCityStateZipLine = Boolean(nextLine?.trim().match(/^\[City,\s*State,\s*ZIP\]$/i));

    if (isAddressLine && isCityStateZipLine) {
      const previousContentLine = findPreviousContentLine(nextLines);
      const previousLineIsPayer =
        Boolean(payerName) && previousContentLine?.trim().toLowerCase() === payerName?.toLowerCase();

      nextLines.push(...(previousLineIsPayer ? ["Prior Authorization Department"] : replacement.split("\n")));
      index += 1;
    } else if (line !== undefined) {
      nextLines.push(line);
    }
  }

  return nextLines.join("\n");
}

function findPreviousContentLine(lines: string[]) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim()) {
      return lines[index];
    }
  }

  return null;
}

function knownPlaceholderValue(
  label: string,
  values: {
    patientName: string | null;
    dateOfBirth: string | null;
    payerName: string | null;
    providerName: string | null;
    practiceName: string | null;
    cptCode: string | null;
    requestedProcedure: string | null;
    generatedDate: string;
  }
) {
  const normalizedLabel = label.toLowerCase().replace(/\s+/g, " ").trim();
  const valueByLabel: Record<string, string | null> = {
    date: values.generatedDate,
    "patient name": values.patientName,
    "patient full name": values.patientName,
    patient: values.patientName,
    "date of birth": values.dateOfBirth,
    dob: values.dateOfBirth,
    payer: values.payerName,
    "payer name": values.payerName,
    "insurance payer": values.payerName,
    provider: values.providerName,
    "provider name": values.providerName,
    "requesting provider": values.providerName,
    "physician name": values.providerName,
    "practice name": values.practiceName,
    practice: values.practiceName,
    "medical practice": values.practiceName,
    "cpt code": values.cptCode,
    cpt: values.cptCode,
    procedure: values.requestedProcedure,
    "requested procedure": values.requestedProcedure,
    address: values.payerName,
    "city, state, zip": "Prior Authorization Department",
    "contact information": values.providerName,
    "md/do": "MD"
  };

  return valueByLabel[normalizedLabel] ?? null;
}

function removeRemainingBracketLines(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/\[[^\]]+\]/.test(line))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureSignatureBlock(text: string, providerName: string | null, practiceName: string | null) {
  if (!providerName) {
    return text;
  }

  const closingLines = text.split(/\r?\n/).slice(-12).join("\n").toLowerCase();
  const hasProvider = closingLines.includes(providerName.toLowerCase());
  const hasPractice = practiceName ? closingLines.includes(practiceName.toLowerCase()) : true;

  if (hasProvider && hasPractice) {
    return text;
  }

  const signatureLines = [`Sincerely,`, `${formatProviderSignatureName(providerName)}`];
  if (practiceName) signatureLines.push(practiceName);
  return `${text}\n\n${signatureLines.join("\n")}`;
}

function formatProviderSignatureName(providerName: string) {
  return /\bM\.?D\.?\b|\bD\.?O\.?\b/i.test(providerName) ? providerName : `${providerName}, MD`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
