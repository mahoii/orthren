// Runs a QA pass comparing extracted JSON against raw chart text.
// Returns array of discrepancy strings. Empty array = clean.

import { callAnthropicWithRetry } from "@/lib/anthropic";
import { createDeidentifyState, deidentify } from "@/lib/deidentify";
import { assertDeidentified } from "@/lib/deid-verify";

export async function validateExtraction(
  chartText: string,
  extractedJson: Record<string, unknown>
): Promise<string[]> {
  // Shared state so both calls extend the same token numbering — otherwise
  // a placeholder like [DATE_1] could refer to different real dates in the
  // chart text vs. the extracted JSON, since each text has its own date
  // ordering.
  const phiState = createDeidentifyState();
  const { redacted: deidentifiedText } = deidentify(chartText, phiState);
  assertDeidentified(deidentifiedText, phiState.map, "extraction-validator.chart");

  // Seed patient_name/date_of_birth so the variant sweep also catches any
  // free-text mention of the name elsewhere in the JSON — deidentify() now
  // natively recognizes JSON-quoted keys like "patient_name", so this
  // seeding is a redundant net rather than the sole defense (see
  // lib/pa-pipeline.ts for the same pattern).
  const jsonForRedaction: Record<string, unknown> = { ...extractedJson };
  if (typeof jsonForRedaction.patient_name === "string" && jsonForRedaction.patient_name.trim()) {
    if (!phiState.map["[PATIENT_NAME]"]) {
      phiState.map["[PATIENT_NAME]"] = jsonForRedaction.patient_name.trim();
    }
  }
  if (typeof jsonForRedaction.date_of_birth === "string" && jsonForRedaction.date_of_birth.trim()) {
    if (!phiState.map["[DOB]"]) {
      phiState.map["[DOB]"] = jsonForRedaction.date_of_birth.trim();
    }
  }

  const { redacted: redactedJson } = deidentify(JSON.stringify(jsonForRedaction, null, 2), phiState);
  assertDeidentified(redactedJson, phiState.map, "extraction-validator.json");
  const prompt = `You are a medical data auditor. Compare the EXTRACTED JSON against the SOURCE CHART TEXT and identify any factual discrepancies.

SOURCE CHART TEXT:
${deidentifiedText}

EXTRACTED JSON:
${redactedJson}

Check specifically:
1. Are all dates in the JSON exactly as written in the source? Flag any year changes.
2. Are treatment durations independently correct for each treatment?
3. Is symptom_duration exactly as stated in the source?
4. Are functional limitations limited to what the source explicitly states?
5. Is any imaging marked as completed that is pending/scheduled in the source?
6. Are surgical approach details only what the source states?
7. Is relief_duration for each injection/treatment exactly as stated?

Return ONLY a JSON array of discrepancy strings.
If no discrepancies found, return [].
No markdown. No explanation. Only the JSON array.`;

  try {
    const text = await callAnthropicWithRetry({
      system: "You are a medical data auditor. Return only valid JSON arrays.",
      prompt,
      maxTokens: 1000,
      useStructuredOutput: true
    });

    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("[extractionValidator] Failed to run or parse QA response:", err);
    return [];
  }
}
