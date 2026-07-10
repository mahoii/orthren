import type { ExtractedChartData, ConservativeTreatment } from "@/lib/types";

// Writes physician-supplied supplements back into the extraction record so the
// letter, extraction JSON, review-page state, and export stop diverging after a
// denial-fix regeneration. Pure function — never mutates `extracted` in place.
// Lives here (not inlined in app/api/regenerate-denial-fix/route.ts) so
// scripts/eval-pipeline.ts can import the exact same merge instead of
// duplicating it — a duplicated copy is exactly the kind of drift that caused
// A4 (see AUDIT-FINDINGS.md). Next's route-handler type contract also forbids
// route.ts files from exporting anything beyond the HTTP-verb handlers, so
// this couldn't live there anyway.
export function mergeSupplementsIntoExtraction(
  extracted: ExtractedChartData,
  supplements: Record<string, string>
): ExtractedChartData {
  const result: ExtractedChartData = { ...extracted };

  for (const [key, rawValue] of Object.entries(supplements)) {
    const supplement = rawValue.trim();
    if (!supplement) continue;

    switch (key) {
      case "symptom_duration":
        result.symptom_duration = appendOrSet(result.symptom_duration, supplement);
        break;

      case "surgical_approach":
        result.surgical_approach_if_mentioned = appendOrSet(result.surgical_approach_if_mentioned, supplement);
        break;

      case "diagnosis_codes":
        result.diagnosis_codes = pushDeduped(result.diagnosis_codes, supplement);
        break;

      case "functional_limitations":
        result.functional_limitations = pushDeduped(result.functional_limitations, supplement);
        break;

      case "imaging_findings":
        result.imaging_findings = result.imaging_findings
          ? { ...result.imaging_findings, key_findings: appendOrSet(result.imaging_findings.key_findings, supplement) }
          : { modality: null, key_findings: supplement };
        break;

      case "conservative_treatments_named":
        result.conservative_treatments_attempted = [
          ...result.conservative_treatments_attempted,
          { treatment: supplement, duration: null, outcome: null, dates: null, relief_duration: null },
        ];
        break;

      case "conservative_treatment_duration": {
        const candidates = result.conservative_treatments_attempted.filter(
          (t) => t.duration === null
        );
        if (candidates.length === 1) {
          result.conservative_treatments_attempted = result.conservative_treatments_attempted.map((t) =>
            t === candidates[0] ? { ...t, duration: supplement } : t
          );
        } else {
          const synthetic: ConservativeTreatment = {
            treatment: "Conservative care duration clarification",
            duration: supplement,
            outcome: null,
            dates: null,
            relief_duration: null,
          };
          result.conservative_treatments_attempted = [...result.conservative_treatments_attempted, synthetic];
        }
        break;
      }

      case "cpt_code_valid":
        // Handled separately (routed into effectiveRequestDetails.cptCode by
        // the caller) — this is a requestDetails-level correction, not
        // chart-derived clinical data, so it never belongs in
        // ExtractedChartData.
        break;

      default:
        break;
    }
  }

  return result;
}

function appendOrSet(existing: string | null, supplement: string): string {
  if (!existing || !existing.trim()) return supplement;
  return `${existing}; physician-supplied clarification: ${supplement}`;
}

function pushDeduped(existing: string[], supplement: string): string[] {
  const alreadyPresent = existing.some((e) => e.toLowerCase() === supplement.toLowerCase());
  return alreadyPresent ? existing : [...existing, supplement];
}
