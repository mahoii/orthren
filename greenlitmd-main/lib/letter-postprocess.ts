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

export type PostProcessResult = {
  letter: string;
  /** True when a duplicated draft was detected and truncated — the caller
   * should surface this to the reviewer rather than silently shipping a
   * letter whose signature block was determined heuristically. */
  duplicateDraftRemoved: boolean;
};

/**
 * Deterministic post-processing applied to every generated letter on every
 * path. The prompt asks the model to comply; this guarantees it regardless of
 * model temperature or per-attempt variance.
 */
export function postProcessLetter(letter: string, extracted: ExtractedChartData): PostProcessResult {
  const { letter: deduped, removed } = removeDuplicateSignatureBlocks(letter);
  let result = injectBmiAsa(deduped, extracted);
  result = removeNotDocumentedLanguage(result);
  return { letter: result, duplicateDraftRemoved: removed };
}

// Programmatic safety net: inject BMI/ASA sentences if the model omitted them.
export function injectBmiAsa(letter: string, extracted: ExtractedChartData): string {
  const { bmi: rawBmi, asa_classification: asa } = extracted as ExtractedChartData & WithBmiAsa;
  const bmi = typeof rawBmi === "string" ? Number(rawBmi) : rawBmi;

  if (bmi != null && !Number.isNaN(bmi) && !/\bBMI\b/i.test(letter)) {
    if (bmi >= 30) {
      const obesityClass =
        bmi >= 40 ? "Class III obesity, " :
        bmi >= 35 ? "Class II obesity, " :
        "Class I obesity, ";
      const sentence = `The patient has a documented BMI of ${bmi}, ${obesityClass}which represents a significant contributor to articular cartilage loading and disease progression.`;
      letter = letter.replace(
        /(CLINICAL HISTORY AND PRESENTING COMPLAINT\s*\n+[^.!?]+[.!?])/i,
        `$1 ${sentence}`
      );
    } else if (bmi >= 25 && asa != null && asa !== "") {
      // BMI 25–29.9: mention value in REQUESTED PROCEDURE only when ASA is also present
      const sentence = `The patient's BMI of ${bmi} and ASA ${asa} classification have been factored into the perioperative surgical plan.`;
      letter = letter.replace(
        /(REQUESTED PROCEDURE\s*\n+)/i,
        `$1${sentence} `
      );
    }
    // BMI < 25: omit entirely
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

// Remove duplicate signature blocks — keep only the FIRST "Sincerely," block,
// truncating everything that follows the first complete signature.
export function removeDuplicateSignatureBlocks(letter: string): { letter: string; removed: boolean } {
  const re = /Sincerely,/gi;
  const occurrences: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(letter)) !== null) occurrences.push(m.index);
  if (occurrences.length <= 1) return { letter, removed: false };

  // Truncating right before the second "Sincerely," (the old behavior) left
  // everything between the first signature and that second occurrence intact
  // — i.e. the entire body of a duplicated second draft, missing only its own
  // trailing signature.
  //
  // A hardcoded "keep exactly 2 non-blank lines" (name + practice) is also
  // wrong: a real signature block can legitimately run longer (credential
  // line, NPI, phone) and that content isn't distinguishable from a
  // duplicate by line count alone. Instead, use structure: a signature block
  // is a CONTIGUOUS run of non-blank lines with no blank-line gaps. Whatever
  // comes after the first blank-line gap following that run is a new
  // paragraph — either the start of a duplicated draft, or (in the
  // fallback case below) content we're not confident enough to keep — so
  // stop there regardless of how many lines the run was.
  const firstIdx = occurrences[0];
  const secondIdx = occurrences[1];
  const lines = letter.slice(firstIdx, secondIdx).split("\n");

  let kept = 0;
  let sawSignatureLine = false;
  for (let i = 0; i < lines.length; i++) {
    const isBlank = lines[i].trim() === "";
    if (i > 0 && isBlank && sawSignatureLine) break; // first gap after the contiguous signature run
    kept += lines[i].length + (i < lines.length - 1 ? 1 : 0);
    if (i === 0) continue; // the "Sincerely," line itself
    if (!isBlank) sawSignatureLine = true;
  }

  return { letter: letter.slice(0, firstIdx + kept).trimEnd(), removed: true };
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
