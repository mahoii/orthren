import type { PayerRule } from "@/lib/payer-rules";

export type ConservativeTreatment = {
  treatment: string | null;
  duration: string | null;
  outcome: string | null;
  dates: string | null;
  relief_duration?: string | null;
};

export type ImagingFindings = {
  modality: string | null;
  key_findings: string | null;
};

export type PaStrengthFactor = {
  score: 0 | 1;
  note: string;
  anchorText?: string;
};

export type PaStrength = {
  diagnosis_codes: PaStrengthFactor;
  conservative_treatments_named: PaStrengthFactor;
  conservative_treatment_duration: PaStrengthFactor;
  imaging_findings: PaStrengthFactor;
  functional_limitations: PaStrengthFactor;
  surgical_approach: PaStrengthFactor;
  cpt_code_valid: PaStrengthFactor;
  symptom_duration: PaStrengthFactor;
};

export type DenialRiskFlag = {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  explanation: string;
  recommendation: string;
  anchorText: string;
};

export type ExtractedChartData = {
  patient_name: string | null;
  date_of_birth: string | null;
  diagnosis_codes: string[];
  primary_complaint: string | null;
  symptom_duration: string | null;
  functional_limitations: string[];
  objective_measurements: string[];
  conservative_treatments_attempted: ConservativeTreatment[];
  imaging_findings: ImagingFindings | null;
  imaging_status: "pending" | "not_ordered" | "completed";
  requested_procedure: string | null;
  surgical_approach_if_mentioned: string | null;
  pain_score?: string | null;
  bmi?: number | string | null;
  asa_classification?: string | null;
  denial_risk_flags: DenialRiskFlag[];
  pa_strength: PaStrength;
};

export type ValidationBlock = {
  field: string;
  label: string;
  message: string;
};

export type Validation = {
  hard_blocks: ValidationBlock[];
  soft_warnings: ValidationBlock[];
};

export type ExtractedChartDataWithValidation = ExtractedChartData & {
  validation: Validation;
  /** QA discrepancies between the extraction and the source chart text — deterministic
   * date/code checks plus an LLM cross-check. Advisory only: never sent to the letter
   * prompt (see stripNonLetterFields in lib/pa-pipeline.ts), surfaced in the review UI. */
  extraction_warnings?: string[];
};

export type GeneratePaResponse = {
  extracted: ExtractedChartDataWithValidation;
  letter: string;
  payerRule?: PayerRule | null;
  sourceLockWarning?: string[];
  /** The exact dateline embedded in the letter header — round-tripped to
   * /api/export so it can re-verify SOURCE LOCK server-side. See
   * FinalizeLetterResult in lib/pa-pipeline.ts. Optional because the frozen
   * /sandbox demo fixtures (lib/demo-data.ts) predate this field and must not
   * be modified; /api/export rejects a request that omits it. */
  letterDate?: string;
};
