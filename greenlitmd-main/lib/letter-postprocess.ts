import type { ExtractedChartData } from "@/lib/types";

// BMI and ASA are surfaced onto the extracted object by normalizeChartData in
// generate-pa, but are not part of the base ExtractedChartData type. Access them
// through this loose view rather than scattering `as any` casts at call sites.
type WithBmiAsa = { bmi?: number | string | null; asa_classification?: string | null };

/**
 * Build the "Patient BMI: …" / "ASA Classification: …" trigger lines that the
 * BMI/ASA rules in letterSystemPrompt explicitly scan the user prompt for.
 * Both the initial-generation and regeneration paths MUST append these so the
 * model has the trigger lines the prompt rules depend on.
 */
export function buildBmiAsaPromptLines(extracted: ExtractedChartData): string {
  const { bmi, asa_classification } = extracted as ExtractedChartData & WithBmiAsa;
  const lines: string[] = [];
  if (bmi != null && bmi !== "") lines.push(`Patient BMI: ${bmi}`);
  if (asa_classification != null && asa_classification !== "") {
    lines.push(`ASA Classification: ${asa_classification}`);
  }
  return lines.length ? `\n${lines.join("\n")}` : "";
}

/**
 * Deterministic post-processing applied to every generated letter on every
 * path. The prompt asks the model to comply; this guarantees it regardless of
 * model temperature or per-attempt variance.
 */
export function postProcessLetter(letter: string, extracted: ExtractedChartData): string {
  let result = removeDuplicateSignatureBlocks(letter);
  result = injectBmiAsa(result, extracted);
  result = removeNotDocumentedLanguage(result);
  return result;
}

// Programmatic safety net: inject BMI/ASA sentences if the model omitted them.
export function injectBmiAsa(letter: string, extracted: ExtractedChartData): string {
  const { bmi: rawBmi, asa_classification: asa } = extracted as ExtractedChartData & WithBmiAsa;
  const bmi = typeof rawBmi === "string" ? Number(rawBmi) : rawBmi;

  if (bmi != null && !Number.isNaN(bmi) && !/\bBMI\b/i.test(letter)) {
    const obesityClass =
      bmi >= 40 ? "Class III obesity, " :
      bmi >= 35 ? "Class II obesity, " :
      bmi >= 30 ? "Class I obesity, " : "";
    const sentence = `The patient has a documented BMI of ${bmi}, ${obesityClass}which represents a significant contributor to articular cartilage loading and disease progression.`;
    letter = letter.replace(
      /(CLINICAL HISTORY AND PRESENTING COMPLAINT\s*\n+[^.!?]+[.!?])/i,
      `$1 ${sentence}`
    );
  }

  if (asa != null && asa !== "" && !/\bASA\b/i.test(letter)) {
    const sentence = `The patient carries an ASA ${asa} classification, reflecting the anesthetic risk profile accounted for in the perioperative surgical plan.`;
    letter = letter.replace(
      /(REQUESTED PROCEDURE\s*\n+)/i,
      `$1${sentence} `
    );
  }

  return letter;
}

// Remove duplicate signature blocks — keep only the last "Sincerely," onwards.
export function removeDuplicateSignatureBlocks(letter: string): string {
  const occurrences: number[] = [];
  const re = /Sincerely,/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(letter)) !== null) occurrences.push(m.index);
  if (occurrences.length <= 1) return letter;

  const firstIdx = occurrences[0];
  const lastIdx = occurrences[occurrences.length - 1];
  return letter.slice(0, firstIdx).trimEnd() + "\n\n" + letter.slice(lastIdx);
}

// Remove "not documented" language and sentences containing it.
export function removeNotDocumentedLanguage(letter: string): string {
  const phrases = [
    "not documented",
    "not well-documented",
    "not recorded",
    "not on file",
    "are not recorded",
    "is not recorded",
    "duration and outcome are not",
    "exact duration and follow-up are not"
  ];

  const before = letter;

  // First pass: replace phrases with placeholder
  phrases.forEach((phrase) => {
    letter = letter.replace(new RegExp(phrase, "gi"), "was not available for review");
  });

  // Second pass: remove entire sentences containing "was not available for review"
  letter = letter.replace(/[^.!?\n]*was not available for review[^.!?\n]*[.!?]/gi, "");

  // Nothing matched — return untouched so we never disturb the letter's structure.
  if (letter === before) return letter;

  // Clean up only the artifacts of removal: collapse runs of spaces/tabs (NOT
  // newlines — those carry the section structure), tidy stray space-before-
  // punctuation, and squeeze any 3+ blank-line gaps left by a removed sentence.
  letter = letter
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.!?,])/g, "$1")
    .replace(/\n{3,}/g, "\n\n");

  return letter;
}
