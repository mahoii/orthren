// Payer Rules Engine — static registry of payer-specific PA criteria.
//
// IMPORTANT: this module must stay free of server-only imports (no `server-only`,
// no Supabase, no Node built-ins) so it can be imported by both server routes and
// client components (e.g. components/PayerCombobox.tsx).

export interface ImageRequirement {
  modality: string;
  required: boolean;
  minimum_findings?: string;
  notes?: string;
}

export interface ConservativeTxRequirement {
  treatment: string;
  minimum_duration: string;
  notes?: string;
}

export interface PayerRule {
  payer_id: string;
  payer_name: string;
  cpt_code: string;
  procedure_name: string;
  pa_required: boolean;
  guideline_source: string;
  guideline_last_updated: string;
  required_imaging: ImageRequirement[];
  conservative_treatment_requirements: ConservativeTxRequirement[];
  functional_criteria: string[];
  radiographic_criteria: string[];
  additional_documentation: string[];
  denial_risk_flags: string[];
  auto_approval_exceptions: string[];
}

export const PAYER_RULES: PayerRule[] = [
  {
    payer_id: "aetna",
    payer_name: "Aetna",
    cpt_code: "27447",
    procedure_name: "Total Knee Arthroplasty",
    pa_required: true,
    guideline_source: "Aetna CPB 0660 + CMS LCD L33456/L36575",
    guideline_last_updated: "2026",
    required_imaging: [
      { modality: "X-ray (weight-bearing bilateral)", required: true, minimum_findings: "Moderate-to-severe OA; KL Grade 2+ required (Grade 3–4 strongly preferred)" },
      { modality: "MRI", required: false, notes: "Not routinely required; may be requested if X-ray insufficient" },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "≥3 weeks", notes: "OR ≥1 intra-articular corticosteroid injection" },
      { treatment: "Physical therapy or home exercise program", minimum_duration: "≥6 weeks", notes: "Documented supervised PT preferred; note dates and outcomes" },
      { treatment: "Activity modification", minimum_duration: "≥6 weeks" },
      { treatment: "Weight management (if BMI ≥30)", minimum_duration: "Documented attempt", notes: "Not hard-blocking but strengthens case" },
    ],
    functional_criteria: [
      "Disabling pain ≥3 months duration",
      "Functional impairment interfering with ADLs (walking, stair use, self-care)",
      "Pain rated consistently limiting ambulation or daily function",
    ],
    radiographic_criteria: [
      "KL Grade 2+ (moderate-severe OA)",
      "Joint space narrowing with or without osteophytes, subchondral sclerosis",
      "Formal radiology report required — office X-ray reads without radiologist interpretation are a denial risk",
    ],
    additional_documentation: [
      "H&P with documented pain score and functional limitations",
      "Conservative treatment notes with dates, duration, and documented failure",
      "Radiology report from interpreting radiologist (not surgeon read-off)",
    ],
    denial_risk_flags: [
      "Conservative treatment < 6 weeks",
      "No formal radiology report (surgeon-read X-ray only)",
      "Missing functional limitation documentation (pain score without ADL impact)",
      "BMI ≥40 without surgical optimization counseling documented",
      "No intra-articular injection trialed when NSAIDs are contraindicated",
    ],
    auto_approval_exceptions: [
      "Acute fracture requiring immediate reconstruction",
      "Septic joint / periprosthetic infection requiring revision",
    ],
  },
  {
    payer_id: "aetna",
    payer_name: "Aetna",
    cpt_code: "27130",
    procedure_name: "Total Hip Arthroplasty",
    pa_required: true,
    guideline_source: "Aetna CPB 0660 + CMS LCD L33456/L36007",
    guideline_last_updated: "2026",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true, minimum_findings: "Advanced degenerative joint disease; formal radiology report required" },
      { modality: "MRI", required: false, notes: "May be required if X-ray does not definitively confirm advanced OA" },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "≥3 weeks" },
      { treatment: "Physical therapy or supervised exercise", minimum_duration: "≥6 weeks" },
      { treatment: "Activity modification", minimum_duration: "≥6 weeks" },
      { treatment: "Assistive devices (cane/walker)", minimum_duration: "Documented use", notes: "Not required but strengthens case" },
      { treatment: "Intra-articular corticosteroid injection", minimum_duration: "Trialed", notes: "Not mandatory but omission is a soft flag" },
    ],
    functional_criteria: [
      "Disabling pain ≥3 months interfering with ADLs",
      "Antalgic gait or significantly restricted ROM documented on physical exam",
      "Pain at rest and with activity",
    ],
    radiographic_criteria: [
      "Advanced OA confirmed by X-ray with formal radiologist interpretation",
      "Joint space narrowing, osteophytes, subchondral changes",
      "KL Grade 3–4 preferred but not always explicitly stated — 'advanced degenerative change' sufficient",
    ],
    additional_documentation: [
      "H&P with exam findings (ROM, leg length, gait)",
      "Conservative treatment records with dates and outcomes",
      "Formal radiology report",
    ],
    denial_risk_flags: [
      "Symptom duration < 3 months (very high denial risk — Vance fixture is exactly this problem)",
      "No formal imaging completed at time of submission (imaging 'ordered but pending' = hard block)",
      "No PT attempted",
      "Only acetaminophen trialed with no additional conservative modalities",
    ],
    auto_approval_exceptions: [
      "Femoral neck fracture",
      "Avascular necrosis with collapse",
      "Failed prior conservative surgical procedure",
    ],
  },
  {
    payer_id: "aetna",
    payer_name: "Aetna",
    cpt_code: "29827",
    procedure_name: "Arthroscopic Rotator Cuff Repair",
    pa_required: true,
    guideline_source: "Aetna CPB 0842 + Carelon Joint Surgery 2025-11-15",
    guideline_last_updated: "2025-11-15",
    required_imaging: [
      { modality: "MRI shoulder (without contrast)", required: true, minimum_findings: "Full-thickness rotator cuff tear confirmed; partial-thickness tear must be high-grade (>50% thickness)" },
      { modality: "X-ray shoulder", required: false, notes: "Often obtained but not gating requirement; rules out other pathology" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy", minimum_duration: "≥6 weeks", notes: "EXCEPTION: Conservative management NOT required for acute full-thickness tears (traumatic onset, short duration). Note: Carelon 2025 update removed conservative management requirement for high-grade partial-thickness tears." },
      { treatment: "NSAIDs or analgesics", minimum_duration: "Documented trial" },
      { treatment: "Subacromial corticosteroid injection", minimum_duration: "Trialed", notes: "Not mandatory but absence is a soft flag for chronic presentation" },
    ],
    functional_criteria: [
      "Shoulder pain with functional impairment (inability to elevate arm above shoulder height)",
      "Weakness on rotator cuff strength testing documented",
      "ADL impairment: overhead activities, dressing, nighttime pain",
      "VAS pain score ≥3 (Carelon 2025 update lowered threshold from 4 to 3)",
    ],
    radiographic_criteria: [
      "MRI-confirmed full-thickness supraspinatus tear (or other RTC tendon)",
      "Document tendon retraction distance in cm if present",
      "Note concomitant findings: infraspinatus tendinosis, bursitis, AC joint arthropathy",
    ],
    additional_documentation: [
      "MRI report from interpreting radiologist (not surgeon interpretation of images)",
      "Physical exam: positive Neer, Hawkins, empty can, drop arm tests as applicable",
      "Conservative treatment notes with dates, therapist name if PT, and documented failure",
    ],
    denial_risk_flags: [
      "MRI not completed prior to submission",
      "Partial thickness tear without documentation of high-grade (>50%) involvement",
      "Conservative treatment < 6 weeks for non-acute/non-traumatic presentation",
      "Functional limitations vague (pain only without ROM or strength deficit documented)",
    ],
    auto_approval_exceptions: [
      "Acute traumatic full-thickness tear with functional deficit — conservative management not required",
      "High-grade partial-thickness tear (>50%) — conservative management not required per Carelon 2025 update",
    ],
  },
  {
    payer_id: "uhc",
    payer_name: "UnitedHealthcare",
    cpt_code: "27447",
    procedure_name: "Total Knee Arthroplasty",
    pa_required: true,
    guideline_source: "UHC Surgery of the Knee — Commercial Medical Policy (updated Sept 2025)",
    guideline_last_updated: "2025-09-04",
    required_imaging: [
      { modality: "X-ray (weight-bearing)", required: true, minimum_findings: "Formal report must include: relevant clinical info, detailed findings, impression, AND specialty of interpreting provider. Must document: skeletal plate closure if <18yo, presence/absence of focal full-thickness cartilage defect, size/location, Outerbridge grade, joint space/alignment, ligament tear location/grade." },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "≥3 weeks", notes: "OR ≥1 intra-articular corticosteroid injection (either satisfies NSAID requirement for TKR)" },
      { treatment: "Physical therapy or home exercise program", minimum_duration: "≥12 weeks", notes: "UHC is stricter than most — 12 weeks minimum. Document dates, sessions, therapist, outcomes." },
      { treatment: "Activity modification", minimum_duration: "≥12 weeks" },
    ],
    functional_criteria: [
      "Disabling pain interfering with ADLs",
      "ROM limitations documented on physical exam",
      "Functional decline quantified (ambulation distance, stair use, self-care)",
    ],
    radiographic_criteria: [
      "Formal radiology report with Outerbridge grading or KL grading",
      "Interpreting physician specialty must be documented in report",
      "Joint space narrowing and/or cartilage defect size and location required",
    ],
    additional_documentation: [
      "Last 6–12 months of clinical notes",
      "Conservative treatment records with exact dates and duration",
      "Imaging report meeting UHC's specific documentation format (clinical info + findings + impression + specialty)",
    ],
    denial_risk_flags: [
      "PT < 12 weeks (most common UHC denial reason — stricter than other payers)",
      "Imaging report missing Outerbridge/KL grade",
      "Imaging report missing interpreting physician specialty",
      "Conservative treatment dates not documented (generic 'tried PT' without specifics)",
      "No intra-articular injection AND NSAIDs < 3 weeks",
    ],
    auto_approval_exceptions: [
      "Acute fracture",
      "Failed prior arthroplasty requiring revision",
    ],
  },
  {
    payer_id: "uhc",
    payer_name: "UnitedHealthcare",
    cpt_code: "27130",
    procedure_name: "Total Hip Arthroplasty",
    pa_required: true,
    guideline_source: "UHC Surgery of the Hip — Commercial Medical Policy (updated Sept 2025)",
    guideline_last_updated: "2025-09-04",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true, minimum_findings: "Formal report required with: relevant clinical info, detailed findings, impression, AND specialty of interpreting provider. UHC may additionally request the actual images for review." },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "≥3 weeks" },
      { treatment: "Physical therapy or home exercise", minimum_duration: "≥12 weeks" },
      { treatment: "Activity modification", minimum_duration: "≥12 weeks" },
    ],
    functional_criteria: [
      "Pain and functional disability documented with ADL impact",
      "Antalgic gait or ROM restriction on exam",
      "Pain not responsive to conservative management",
    ],
    radiographic_criteria: [
      "Formal radiology report with findings and impression",
      "Interpreting physician specialty documented",
      "Evidence of advanced hip OA or structural pathology",
    ],
    additional_documentation: [
      "Clinical notes showing progression of symptoms",
      "Documentation of failed conservative management with dates",
    ],
    denial_risk_flags: [
      "Imaging completed but formal report not available at time of PA submission",
      "PT < 12 weeks",
      "Imaging report lacking interpreting specialty",
      "Symptom duration < 3 months without acute precipitant",
    ],
    auto_approval_exceptions: [
      "Femoral neck fracture",
      "Avascular necrosis with collapse",
    ],
  },
  {
    payer_id: "uhc",
    payer_name: "UnitedHealthcare",
    cpt_code: "29827",
    procedure_name: "Arthroscopic Rotator Cuff Repair",
    pa_required: true,
    guideline_source: "UHC Arthroscopy Shoulder Policy (updated Feb 2025)",
    guideline_last_updated: "2025-02-01",
    required_imaging: [
      { modality: "MRI shoulder", required: true, minimum_findings: "Confirmed rotator cuff tear. Document: tendon(s) involved, full vs partial thickness, retraction distance if applicable" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy", minimum_duration: "≥6 weeks", notes: "Waived for acute traumatic full-thickness tear" },
      { treatment: "NSAIDs or analgesics", minimum_duration: "Documented trial" },
      { treatment: "Activity modification", minimum_duration: "Documented" },
    ],
    functional_criteria: [
      "Shoulder pain with functional deficit",
      "ROM limitation or strength deficit on physical exam",
      "ADL impairment (overhead activity, dressing, sleep disturbance)",
    ],
    radiographic_criteria: [
      "MRI confirming full-thickness or high-grade partial-thickness rotator cuff tear",
      "Tendon retraction documented if present",
    ],
    additional_documentation: [
      "Physical exam findings (positive provocative tests)",
      "Conservative treatment records with dates",
      "MRI report with interpreting radiologist",
    ],
    denial_risk_flags: [
      "MRI pending at time of submission",
      "Partial thickness tear without high-grade documentation",
      "No PT trial for non-acute presentation",
      "Functional limitation not documented (pain only)",
    ],
    auto_approval_exceptions: [
      "Acute traumatic full-thickness tear",
    ],
  },
  {
    payer_id: "cigna",
    payer_name: "Cigna (EviCore managed)",
    cpt_code: "27447",
    procedure_name: "Total Knee Arthroplasty",
    pa_required: true,
    guideline_source: "EviCore CMM-311 v2.0.2025 (eff. March 7, 2026)",
    guideline_last_updated: "2025-11-21",
    required_imaging: [
      { modality: "X-ray (weight-bearing)", required: true, minimum_findings: "KL Grade 3–4 preferred. Document: grade, joint space narrowing severity, osteophyte formation, bone contour changes" },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or analgesics", minimum_duration: "≥3 months", notes: "Cigna CMM-311 requires ≥3 months of documented pain — longer than UHC/Aetna 3-week NSAID requirement. The 3-month threshold applies to pain duration, not treatment duration." },
      { treatment: "Physical therapy", minimum_duration: "Documented attempt", notes: "Duration not specified in same way as UHC but documented PT failure required" },
      { treatment: "Weight management", minimum_duration: "Documented", notes: "BMI ≥45 kg/m2 is associated with dramatically higher complication risk — Cigna may flag for surgical optimization" },
    ],
    functional_criteria: [
      "Functional disabling pain ≥3 months interfering with ADLs",
      "Pain not controlled with non-operative management",
      "Radiographic evidence supporting clinical presentation",
    ],
    radiographic_criteria: [
      "KL Grade 3 or 4 on weight-bearing X-ray",
      "Formal report with grading",
      "Moderate-to-severe joint space narrowing",
    ],
    additional_documentation: [
      "Clinical notes spanning ≥3 months showing persistent disabling pain",
      "Documentation of prior conservative modalities and failure",
      "For morbidly obese patients (BMI ≥40): document surgical optimization/weight management discussion",
    ],
    denial_risk_flags: [
      "Pain history < 3 months (shorter than Cigna's minimum)",
      "BMI ≥45 without surgical optimization documentation",
      "KL Grade < 2 on X-ray",
      "Missing formal radiologist report",
    ],
    auto_approval_exceptions: [
      "Failed prior knee arthroplasty requiring revision",
      "Post-traumatic arthritis with functional deficit",
    ],
  },
  {
    payer_id: "cigna",
    payer_name: "Cigna (EviCore managed)",
    cpt_code: "27130",
    procedure_name: "Total Hip Arthroplasty",
    pa_required: true,
    guideline_source: "EviCore CMM-313 (eff. March 7, 2026)",
    guideline_last_updated: "2025-11-21",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true, minimum_findings: "Advanced degenerative joint disease; formal radiologist report" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Analgesics/NSAIDs", minimum_duration: "Documented" },
      { treatment: "Physical therapy", minimum_duration: "Documented" },
      { treatment: "Activity modification", minimum_duration: "Documented" },
    ],
    functional_criteria: [
      "Disabling pain ≥3 months interfering with ADLs",
      "Failed conservative management documented",
    ],
    radiographic_criteria: [
      "Advanced OA on AP pelvis and lateral hip X-ray",
      "KL Grade 3–4 preferred",
      "Formal radiology report required",
    ],
    additional_documentation: [
      "3+ months of clinical notes documenting persistent symptoms",
      "Conservative treatment records",
    ],
    denial_risk_flags: [
      "Symptom duration < 3 months",
      "Imaging not completed at submission",
      "No documented PT attempt",
    ],
    auto_approval_exceptions: [
      "Femoral neck fracture",
      "Avascular necrosis",
    ],
  },
  {
    payer_id: "cigna",
    payer_name: "Cigna (EviCore managed)",
    cpt_code: "29827",
    procedure_name: "Arthroscopic Rotator Cuff Repair",
    pa_required: true,
    guideline_source: "EviCore CMM-315 (eff. March 7, 2026)",
    guideline_last_updated: "2025-11-21",
    required_imaging: [
      { modality: "MRI shoulder", required: true, minimum_findings: "Confirmed rotator cuff tear (full-thickness or high-grade partial-thickness)" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy", minimum_duration: "≥6 weeks", notes: "Waived for acute traumatic full-thickness tears" },
      { treatment: "Analgesics or NSAIDs", minimum_duration: "Documented" },
    ],
    functional_criteria: [
      "Shoulder pain with functional impairment",
      "Weakness or ROM limitation on physical exam",
      "ADL impairment documented",
    ],
    radiographic_criteria: [
      "MRI-confirmed rotator cuff tear with tear type and tendon specified",
    ],
    additional_documentation: [
      "MRI report from radiologist",
      "Physical exam findings",
      "Conservative treatment notes",
    ],
    denial_risk_flags: [
      "MRI not completed",
      "PT < 6 weeks without acute injury exception",
      "Partial thickness tear without high-grade classification",
    ],
    auto_approval_exceptions: [
      "Acute traumatic full-thickness tear",
    ],
  },
  {
    payer_id: "anthem_empire",
    payer_name: "Anthem / Empire BCBS (Carelon managed)",
    cpt_code: "27447",
    procedure_name: "Total Knee Arthroplasty",
    pa_required: true,
    guideline_source: "Carelon Joint Surgery 2025-11-15",
    guideline_last_updated: "2025-11-15",
    required_imaging: [
      { modality: "X-ray (weight-bearing)", required: true, minimum_findings: "KL Grade 2+ with formal report. KL Grade 4 may waive some conservative treatment requirements." },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or analgesics", minimum_duration: "Documented trial" },
      { treatment: "Physical therapy", minimum_duration: "≥6 weeks typically; ≥12 weeks per InterQual for commercial", notes: "Uses InterQual criteria for commercial members. Conservative management waived if KL Grade 4." },
      { treatment: "Activity modification", minimum_duration: "Documented" },
      { treatment: "Intra-articular corticosteroid injection", minimum_duration: "Documented attempt", notes: "Hyaluronic acid injections are acceptable alternative" },
    ],
    functional_criteria: [
      "Disabling pain interfering with ADLs",
      "Post-traumatic arthritis accepted as indication (2023 Carelon update)",
      "Unicompartmental damage accepted as indication for total (not just partial) replacement",
    ],
    radiographic_criteria: [
      "KL Grade 2+ with formal report",
      "KL Grade 4 = auto-qualify for surgery without full conservative treatment",
    ],
    additional_documentation: [
      "Clinical notes with ADL impact",
      "Conservative treatment records",
      "Radiology report with KL grade",
    ],
    denial_risk_flags: [
      "KL Grade < 2",
      "Missing PT documentation",
      "No formal radiology report with KL grading",
    ],
    auto_approval_exceptions: [
      "KL Grade 4 — conservative management waivable",
      "Post-traumatic arthritis",
      "Failed prior arthroplasty",
    ],
  },
  {
    payer_id: "anthem_empire",
    payer_name: "Anthem / Empire BCBS (Carelon managed)",
    cpt_code: "27130",
    procedure_name: "Total Hip Arthroplasty",
    pa_required: true,
    guideline_source: "Carelon Joint Surgery 2025-11-15",
    guideline_last_updated: "2025-11-15",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true, minimum_findings: "Advanced OA; KL Grade 4 waives conservative care requirement" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Conservative management", minimum_duration: "≥6 weeks", notes: "Waived if KL Grade 4 confirmed on imaging" },
      { treatment: "Physical therapy or analgesics", minimum_duration: "Documented" },
    ],
    functional_criteria: [
      "Hip pain with functional impairment for ≥6 months",
      "Physical exam supporting OA diagnosis",
    ],
    radiographic_criteria: [
      "Advanced OA with formal radiologist interpretation",
      "KL Grade 3–4 for faster approval",
    ],
    additional_documentation: [
      "Conservative treatment records",
      "Radiology report with OA grading",
    ],
    denial_risk_flags: [
      "Symptom duration < 6 months without acute precipitant",
      "No completed imaging at submission",
      "No conservative management attempted",
    ],
    auto_approval_exceptions: [
      "KL Grade 4",
      "Avascular necrosis",
      "Femoral neck fracture",
    ],
  },
  {
    payer_id: "anthem_empire",
    payer_name: "Anthem / Empire BCBS (Carelon managed)",
    cpt_code: "29827",
    procedure_name: "Arthroscopic Rotator Cuff Repair",
    pa_required: true,
    guideline_source: "Carelon Joint Surgery 2025-11-15",
    guideline_last_updated: "2025-11-15",
    required_imaging: [
      { modality: "MRI shoulder", required: true, minimum_findings: "Full-thickness RTC tear confirmed OR high-grade partial-thickness (>50%). Tendon retraction distance should be documented." },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy or supervised conservative management", minimum_duration: "≥6 weeks for full-thickness tears; WAIVED for acute traumatic tears; WAIVED for high-grade partial-thickness tears (2023 Carelon update)", notes: "KEY CHANGE: High-grade partial thickness tears no longer require conservative management trial. Acute full-thickness traumatic tears also exempt." },
      { treatment: "NSAIDs or analgesics", minimum_duration: "Documented trial" },
      { treatment: "Subacromial injection", minimum_duration: "Considered", notes: "Not mandatory but absence is a soft flag for chronic non-traumatic presentation" },
    ],
    functional_criteria: [
      "VAS pain score ≥3 (lowered from 4 per Nov 2025 Carelon update)",
      "Functional impairment: shoulder weakness, ROM limitation, ADL impact",
      "Physical exam consistent with RTC pathology (positive provocative tests)",
    ],
    radiographic_criteria: [
      "MRI-confirmed rotator cuff tear",
      "Full-thickness or high-grade partial-thickness documentation required",
      "Retraction distance if present",
    ],
    additional_documentation: [
      "MRI report from radiologist",
      "Physical exam with provocative test findings",
      "Conservative treatment records if required by tear type",
    ],
    denial_risk_flags: [
      "MRI not completed prior to PA submission",
      "Partial thickness without high-grade classification",
      "VAS pain score not documented",
      "No physical exam with provocative tests",
    ],
    auto_approval_exceptions: [
      "Acute traumatic full-thickness tear",
      "High-grade partial-thickness tear (>50%) — per 2023 Carelon guideline update",
    ],
  },
];

// ── Payer name normalization ─────────────────────────────────────────────────
//
// Maps freetext / display payer names to a canonical payer_id. Exact matches are
// tried first, then substring matches with the longest alias winning (so
// "anthem / empire bcbs" resolves via "empire bcbs" before the shorter "bcbs").

const PAYER_ALIASES: Record<string, string> = {
  aetna: "aetna",
  united: "uhc",
  uhc: "uhc",
  "united healthcare": "uhc",
  unitedhealthcare: "uhc",
  "united health": "uhc",
  cigna: "cigna",
  "cigna evicore": "cigna",
  evicore: "cigna",
  bcbs: "anthem_empire",
  "blue cross": "anthem_empire",
  empire: "anthem_empire",
  anthem: "anthem_empire",
  "anthem bcbs": "anthem_empire",
  "empire bcbs": "anthem_empire",
  carelon: "anthem_empire",
};

// Aliases sorted longest-first for substring fallback matching.
const SORTED_ALIASES: Array<[string, string]> = Object.entries(PAYER_ALIASES).sort(
  (a, b) => b[0].length - a[0].length
);

export function normalizePayerName(input: string): string | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;

  // Exact alias match.
  if (PAYER_ALIASES[cleaned]) return PAYER_ALIASES[cleaned];

  // Substring match, longest alias first.
  for (const [alias, id] of SORTED_ALIASES) {
    if (cleaned.includes(alias)) return id;
  }

  return null;
}

const KNOWN_PAYER_IDS = new Set(PAYER_RULES.map((r) => r.payer_id));

// Primary lookup — returns null if no rule found (graceful fallback to generic).
// Robust to both raw payer names and already-normalized payer_ids.
export function getPayerRule(payerName: string, cptCode: string): PayerRule | null {
  if (!payerName) return null;
  const id = KNOWN_PAYER_IDS.has(payerName) ? payerName : normalizePayerName(payerName);
  if (!id) return null;
  return PAYER_RULES.find((r) => r.payer_id === id && r.cpt_code === cptCode) ?? null;
}

// ── Letter-gen system prompt injection ───────────────────────────────────────

// Build the payer-specific injection block appended to the letter-gen system prompt.
export function buildPayerInjectionBlock(rule: PayerRule): string {
  const conservativeLines = rule.conservative_treatment_requirements
    .map((c) => `- ${c.treatment}: ${c.minimum_duration}${c.notes ? ` [${c.notes}]` : ""}`)
    .join("\n");

  const imagingLines = rule.required_imaging
    .map((img) => {
      const tag = img.required ? "REQUIRED" : "OPTIONAL";
      const detail = img.minimum_findings ?? img.notes ?? "";
      return `- ${img.modality} [${tag}]: ${detail}`;
    })
    .join("\n");

  const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

  return `PAYER-SPECIFIC REQUIREMENTS — ${rule.payer_name} | CPT ${rule.cpt_code}:

Guideline source: ${rule.guideline_source} (updated ${rule.guideline_last_updated})

CONSERVATIVE CARE MINIMUMS:
${conservativeLines}

IMAGING REQUIREMENTS:
${imagingLines}

FUNCTIONAL CRITERIA — all must be addressed:
${bullets(rule.functional_criteria)}

DENIAL RISK FLAGS — if any apply, explicitly preempt in the letter body:
${bullets(rule.denial_risk_flags)}

AUTO-APPROVAL EXCEPTIONS — check if applicable:
${bullets(rule.auto_approval_exceptions)}

INSTRUCTION: The letter MUST explicitly satisfy each conservative care minimum and address each denial risk flag. If a flag condition exists in the extracted chart data, address it head-on in the letter. If a required element is absent from the chart, flag it with [REQUIRES PHYSICIAN REVIEW] — do not fabricate or omit silently.`;
}

// ── Review-page checklist ────────────────────────────────────────────────────

export interface PayerChecklistItem {
  label: string;
  requirement: string;
  isHardRequirement: boolean;
}

// Build a flat pre-flight checklist for the review page. Conservative treatment
// minimums and required imaging are hard requirements; optional imaging,
// functional/radiographic criteria, and additional docs are soft.
export function getPayerChecklist(rule: PayerRule): PayerChecklistItem[] {
  const items: PayerChecklistItem[] = [];

  for (const c of rule.conservative_treatment_requirements) {
    items.push({
      label: c.treatment,
      requirement: `${c.minimum_duration}${c.notes ? ` — ${c.notes}` : ""}`,
      isHardRequirement: true,
    });
  }

  for (const img of rule.required_imaging) {
    items.push({
      label: img.modality,
      requirement: img.minimum_findings ?? img.notes ?? (img.required ? "Required" : "Optional"),
      isHardRequirement: img.required,
    });
  }

  for (const f of rule.functional_criteria) {
    items.push({ label: f, requirement: "Functional criterion — address in letter", isHardRequirement: false });
  }

  for (const r of rule.radiographic_criteria) {
    items.push({ label: r, requirement: "Radiographic criterion", isHardRequirement: false });
  }

  for (const d of rule.additional_documentation) {
    items.push({ label: d, requirement: "Supporting documentation", isHardRequirement: false });
  }

  return items;
}
