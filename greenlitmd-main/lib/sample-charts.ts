/**
 * Sample chart constants — single source of truth for the three built-in demo
 * profiles.  The patient name (from extracted.patient_name) is used as the
 * cache key in sample-fix-cache.json because it is already present in every
 * suggest-fix request body and requires zero client-side changes.
 */

import { CLEAN_TKA, MESSY_ROTATOR_CUFF, INCOMPLETE_LUMBAR_FUSION } from "@/lib/demo-data";
import type { ExtractedChartDataWithValidation } from "@/lib/types";

// Stable string IDs — MUST match extracted.patient_name in each demo profile.
export const SAMPLE_CHART_IDS = {
  CLEAN_TKA: "Maria A. Delgado",
  MESSY_ROTATOR_CUFF: "Robert Chen",
  INCOMPLETE_LUMBAR_FUSION: "Eleanor Vance",
} as const;

export type SampleChartId = (typeof SAMPLE_CHART_IDS)[keyof typeof SAMPLE_CHART_IDS];

/** The set of patient names that identify a sample/demo chart. */
export const SAMPLE_PATIENT_NAMES = new Set<string>(Object.values(SAMPLE_CHART_IDS));

/** All three extracted payloads — used by the cache-generation script. */
export const SAMPLE_CHART_EXTRACTED: Record<SampleChartId, ExtractedChartDataWithValidation> = {
  [SAMPLE_CHART_IDS.CLEAN_TKA]: CLEAN_TKA.extracted,
  [SAMPLE_CHART_IDS.MESSY_ROTATOR_CUFF]: MESSY_ROTATOR_CUFF.extracted,
  [SAMPLE_CHART_IDS.INCOMPLETE_LUMBAR_FUSION]: INCOMPLETE_LUMBAR_FUSION.extracted,
};
