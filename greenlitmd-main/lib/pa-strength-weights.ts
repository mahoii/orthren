// Single source of truth for PA Strength Score weighting — imported by both server
// code (lib/pa-pipeline.ts, app/api/generate-pa/route.ts) and the client review page
// (app/review/page.tsx). Kept dependency-free (type-only import) so it's safe to
// pull into a 'use client' component without dragging in server-only modules.
import type { PaStrength } from "@/lib/types";

export type PaStrengthFactorKey = keyof PaStrength;

export const PA_STRENGTH_WEIGHTS: Record<PaStrengthFactorKey, number> = {
  diagnosis_codes: 10,
  conservative_treatments_named: 20,
  conservative_treatment_duration: 10,
  imaging_findings: 15,
  functional_limitations: 15,
  surgical_approach: 10,
  cpt_code_valid: 10,
  symptom_duration: 10,
};

// Returns the earned weight on a 0-100 scale (sum of weights for factors scoring 1).
// Divide by 10 for the 0-10 display score shown in the review UI.
export function computeEarnedWeight(pa: PaStrength): number {
  let earned = 0;
  for (const key of Object.keys(PA_STRENGTH_WEIGHTS) as PaStrengthFactorKey[]) {
    if (pa[key]?.score === 1) earned += PA_STRENGTH_WEIGHTS[key];
  }
  return earned;
}
