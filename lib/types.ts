export type ConservativeTreatment = {
  treatment: string | null;
  duration: string | null;
  outcome: string | null;
  dates: string | null;
};

export type ImagingFindings = {
  modality: string | null;
  key_findings: string | null;
};

export type PaStrengthFactor = {
  score: 0 | 1;
  note: string;
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

export type ExtractedChartData = {
  patient_name: string | null;
  date_of_birth: string | null;
  diagnosis_codes: string[];
  primary_complaint: string | null;
  symptom_duration: string | null;
  functional_limitations: string[];
  conservative_treatments_attempted: ConservativeTreatment[];
  imaging_findings: ImagingFindings | null;
  requested_procedure: string | null;
  surgical_approach_if_mentioned: string | null;
  denial_risk_flags: string[];
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
};

export type GeneratePaResponse = {
  extracted: ExtractedChartDataWithValidation;
  letter: string;
};
