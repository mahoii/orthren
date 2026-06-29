// Runs a QA pass comparing extracted JSON against raw chart text.
// Returns array of discrepancy strings. Empty array = clean.

import { callAnthropicWithRetry } from "@/lib/anthropic";
import { deidentify } from "@/lib/deidentify";

export async function validateExtraction(
  chartText: string,
  extractedJson: Record<string, unknown>
): Promise<string[]> {
  const { redacted: deidentifiedText } = deidentify(chartText);
  const { redacted: redactedJson } = deidentify(JSON.stringify(extractedJson, null, 2));
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
