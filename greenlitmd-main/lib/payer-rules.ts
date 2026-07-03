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

// Provenance tier for a rule's data. Only "direct_fetch_quoted" — meaning the
// specific figures in this rule were confirmed against the primary source's own
// text, not inferred from a secondary source or left as an untraced legacy value
// — may be paired with validation_status: "validated". See the module-load
// invariant check below, which enforces this pairing at import time.
export type VerificationMethod = "direct_fetch_quoted" | "search_snippet" | "unverified";

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
  // Validation gate — distinguishes rules confirmed against a primary payer
  // source from rules that are still research-sourced/unconfirmed. Scoring and
  // letter-gen must only treat "validated" rules as authoritative.
  validation_status: "unvalidated" | "validated";
  source_type: "research" | "official_portal";
  source_url: string | null;
  last_verified_date: string | null; // ISO date, null unless validated
  verification_method: VerificationMethod;
}

export const PAYER_RULES: PayerRule[] = [
  {
    payer_id: "aetna",
    payer_name: "Aetna",
    cpt_code: "27447",
    procedure_name: "Total Knee Arthroplasty",
    pa_required: true,
    guideline_source: "Aetna CPB 0660 — Knee Arthroplasty",
    guideline_last_updated: "2026",
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://www.aetna.com/cpb/medical/data/600_699/0660.html",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "X-ray (weight-bearing bilateral)", required: true, minimum_findings: "KL Grade 3 or 4 required (\"moderate/severe osteoarthritis... Kellgren-Lawrence Grade 3 or 4\"). Grade 2 alone is insufficient — corrected from a prior 'Grade 2+' reading of this policy." },
      { modality: "MRI", required: false, notes: "Not routinely required; may be requested if X-ray insufficient" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy or supervised exercise", minimum_duration: "12 or 24 weeks depending on age/BMI", notes: "At least half of the required course must be formal in-person PT with a licensed physical therapist — home/virtual PT alone does not satisfy this. Corrected from a prior '≥6 weeks' reading, which understated the actual policy threshold." },
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "Documented trial", notes: "OR intra-articular corticosteroid injection" },
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
      "Conservative treatment course < required 12/24-week threshold (age/BMI-dependent) — corrected from a prior '< 6 weeks' flag, which understated Aetna's actual threshold",
      "Less than half the PT course was formal in-person therapy (home exercise program alone does not satisfy Aetna's requirement)",
      "KL Grade 2 or lower documented — Grade 3 or 4 required",
      "No formal radiology report (surgeon-read X-ray only)",
      "Missing functional limitation documentation (pain score without ADL impact)",
      "BMI ≥40 without surgical optimization counseling documented",
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
    guideline_source: "Aetna CPB 0287 — Hip Arthroplasty", // corrected citation — was wrongly cited as CPB 0660 (the knee policy)
    guideline_last_updated: "2026",
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://www.aetna.com/cpb/medical/data/200_299/0287.html",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true, minimum_findings: "Tönnis Grade 2 or 3 required (\"moderate/severe osteoarthritis... Tonnis grade 2 or 3\"). This is a DIFFERENT grading scale than knee (KL) — do not accept a KL grade entered for a hip case; corrected from a prior reading that implied KL applied here." },
      { modality: "MRI", required: false, notes: "May be required if X-ray does not definitively confirm advanced OA" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy or supervised exercise", minimum_duration: "12 or 24 weeks depending on age/BMI", notes: "Same structure as Aetna's knee policy: at least half the course must be formal in-person PT. Individuals with morbid obesity or age under 50 require the longer 24-week course. Corrected from a prior '≥6 weeks' reading." },
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "Documented trial" },
      { treatment: "Assistive devices (cane/walker)", minimum_duration: "Documented use", notes: "Not required but strengthens case" },
      { treatment: "Intra-articular corticosteroid injection", minimum_duration: "Trialed", notes: "Not mandatory but omission is a soft flag" },
    ],
    functional_criteria: [
      "Disabling pain ≥3 months interfering with ADLs",
      "Antalgic gait or significantly restricted ROM documented on physical exam",
      "Pain at rest and with activity",
    ],
    radiographic_criteria: [
      "Tönnis Grade 2–3 with formal radiologist interpretation — corrected from a prior 'KL Grade 3-4 preferred' entry, which used the wrong grading scale for hip",
      "Joint space narrowing, osteophytes, subchondral changes",
    ],
    additional_documentation: [
      "H&P with exam findings (ROM, leg length, gait)",
      "Conservative treatment records with dates and outcomes",
      "Formal radiology report using Tönnis grading",
    ],
    denial_risk_flags: [
      "Symptom duration < 3 months (very high denial risk — Vance fixture is exactly this problem)",
      "Radiology report uses KL grade instead of Tönnis grade — wrong scale for hip, will read as incomplete/incorrect",
      "No formal imaging completed at time of submission (imaging 'ordered but pending' = hard block)",
      "Conservative course short of the 12/24-week threshold, or less than half delivered as formal in-person PT",
    ],
    auto_approval_exceptions: [
      "Femoral neck fracture",
      "Avascular necrosis with collapse",
      "Failed prior conservative surgical procedure",
    ],
  },
  {
    // Do not re-attempt web-search validation on this rule — confirmed blocked
    // as of 2026-06-30, requires portal access or licensed source. No dedicated
    // Aetna CPB exists for this procedure (see guideline_source below); this is
    // not a search-effort gap, it's an absent primary source.
    payer_id: "aetna",
    payer_name: "Aetna",
    cpt_code: "29827",
    procedure_name: "Arthroscopic Rotator Cuff Repair",
    pa_required: true,
    guideline_source: "No dedicated Aetna CPB covers arthroscopic rotator cuff repair. Prior code cited 'Aetna CPB 0842' — direct fetch (2026-06-30) confirms CPB 0842 is actually about ziv-aflibercept (an oncology/ophthalmology drug), unrelated to orthopedics. That citation was wrong and has been removed; no replacement primary source has been found.",
    guideline_last_updated: "unknown",
    validation_status: "unvalidated",
    source_type: "research",
    source_url: null,
    last_verified_date: null,
    verification_method: "unverified",
    required_imaging: [
      { modality: "MRI shoulder (without contrast)", required: true, minimum_findings: "Full-thickness rotator cuff tear confirmed; partial-thickness tear must be high-grade (>50% thickness) — no Aetna-specific source for this threshold, carried forward from prior unverified content" },
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
    // Do not re-attempt web-search validation on this rule — confirmed blocked
    // as of 2026-06-30, requires portal access or licensed source. UHC's policy
    // text defers duration thresholds to InterQual® (licensed, not accessible);
    // no amount of further searching will surface those numbers from this policy.
    payer_id: "uhc",
    payer_name: "UnitedHealthcare",
    cpt_code: "27447",
    procedure_name: "Total Knee Arthroplasty",
    pa_required: true,
    guideline_source: "UHC Surgery of the Knee — Commercial Medical Policy (updated Sept 2025). Direct fetch (2026-06-30) confirms this policy defers duration thresholds to InterQual® criteria — a licensed proprietary product not accessible to us — rather than stating specific week counts in its own text.",
    guideline_last_updated: "2025-09-04",
    validation_status: "unvalidated",
    source_type: "research",
    source_url: "https://www.uhcprovider.com/content/dam/provider/docs/public/policies/comm-medical-drug/surgery-knee.pdf",
    last_verified_date: null,
    verification_method: "unverified",
    required_imaging: [
      { modality: "X-ray (weight-bearing)", required: true, minimum_findings: "CONFIRMED requirement (direct fetch): formal report must include relevant clinical info, detailed findings, impression, AND specialty of interpreting provider. Must document skeletal plate closure if <18yo, presence/absence of focal full-thickness cartilage defect, size/location, Outerbridge grade, joint space/alignment, ligament tear location/grade." },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "≥3 weeks (UNVERIFIED — InterQual-sourced, not stated in UHC's own policy text)", notes: "OR ≥1 intra-articular corticosteroid injection (either satisfies NSAID requirement for TKR)" },
      { treatment: "Physical therapy or home exercise program", minimum_duration: "≥12 weeks (UNVERIFIED — InterQual-sourced)", notes: "UHC's own policy text defers duration specifics to InterQual and does not state a week count directly. Document dates, sessions, therapist, outcomes regardless." },
      { treatment: "Activity modification", minimum_duration: "≥12 weeks (UNVERIFIED — InterQual-sourced)" },
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
      "Imaging report missing interpreting physician specialty (CONFIRMED — this specific requirement is verified accurate)",
      "Imaging report missing Outerbridge/KL grade",
      "PT duration claims (3wk/12wk) are UNVERIFIED against InterQual — do not present these thresholds to a design partner as confirmed",
      "Conservative treatment dates not documented (generic 'tried PT' without specifics)",
    ],
    auto_approval_exceptions: [
      "Acute fracture",
      "Failed prior arthroplasty requiring revision",
    ],
  },
  {
    // Do not re-attempt web-search validation on this rule — confirmed blocked
    // as of 2026-06-30, requires portal access or licensed source. Same
    // InterQual®-deferral structure as UHC's knee policy (CPT 27447 above).
    // NOTE: this rule's guideline_source explicitly says the hip policy's
    // InterQual-deferral was not independently re-fetched — it's presumed to
    // match the knee policy's structure, not confirmed. Keep that caveat
    // intact if this rule is ever touched; don't let "presumed" harden into
    // "confirmed" in a future summary.
    payer_id: "uhc",
    payer_name: "UnitedHealthcare",
    cpt_code: "27130",
    procedure_name: "Total Hip Arthroplasty",
    pa_required: true,
    guideline_source: "UHC Surgery of the Hip — Commercial Medical Policy (updated Sept 2025). Not independently fetched this pass — UHC's parallel knee policy defers duration thresholds to InterQual®, and the hip policy is presumed to follow the same structure, but that presumption has not been confirmed against this specific document.",
    guideline_last_updated: "2025-09-04",
    validation_status: "unvalidated",
    source_type: "research",
    source_url: null,
    last_verified_date: null,
    verification_method: "unverified",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true, minimum_findings: "Formal report required with: relevant clinical info, detailed findings, impression, AND specialty of interpreting provider. UHC may additionally request the actual images for review." },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or acetaminophen", minimum_duration: "≥3 weeks (UNVERIFIED — InterQual-sourced, carried forward unchanged; not independently re-checked this pass)" },
      { treatment: "Physical therapy or home exercise", minimum_duration: "≥12 weeks (UNVERIFIED — InterQual-sourced, carried forward unchanged)" },
      { treatment: "Activity modification", minimum_duration: "≥12 weeks (UNVERIFIED — InterQual-sourced, carried forward unchanged)" },
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
      "Imaging report lacking interpreting specialty",
      "PT duration claim (12 weeks) is UNVERIFIED against InterQual — do not present as confirmed",
      "Symptom duration < 3 months without acute precipitant",
    ],
    auto_approval_exceptions: [
      "Femoral neck fracture",
      "Avascular necrosis with collapse",
    ],
  },
  {
    // Do not re-attempt web-search validation on this rule — confirmed blocked
    // as of 2026-06-30, requires portal access or licensed source. Same
    // InterQual®-deferral structure as UHC's knee/hip policies above. Also
    // not independently re-fetched this pass — figures are carried forward
    // unchanged, same "presumed, not confirmed" caveat as the hip rule.
    payer_id: "uhc",
    payer_name: "UnitedHealthcare",
    cpt_code: "29827",
    procedure_name: "Arthroscopic Rotator Cuff Repair",
    pa_required: true,
    guideline_source: "UHC Arthroscopy Shoulder Policy (updated Feb 2025). Not independently fetched this pass — duration figures below are carried forward unchanged from prior research-sourced content and have not been confirmed against InterQual or a primary UHC document.",
    guideline_last_updated: "2025-02-01",
    validation_status: "unvalidated",
    source_type: "research",
    source_url: null,
    last_verified_date: null,
    verification_method: "unverified",
    required_imaging: [
      { modality: "MRI shoulder", required: true, minimum_findings: "Confirmed rotator cuff tear. Document: tendon(s) involved, full vs partial thickness, retraction distance if applicable" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy", minimum_duration: "≥6 weeks (UNVERIFIED — InterQual-sourced, carried forward unchanged)", notes: "Waived for acute traumatic full-thickness tear" },
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
      "PT duration claim (6 weeks) is UNVERIFIED against InterQual — do not present as confirmed",
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
    guideline_source: "EviCore CMM-311: Knee Replacement/Arthroplasty, V2.0.2025 (eff. March 7, 2026, pub. Nov 21, 2025). Direct fetch (2026-06-30) — the previously-cited URL pattern (matching CMM-315's naming) 404'd; the correct URL uses \"Knee Replacement Arthroplasty\" not \"Knee Replace Arthro\" in the filename. Full document read and quoted below.",
    guideline_last_updated: "2025-11-21",
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://www.evicore.com/sites/default/files/clinical-guidelines/2025-11/Cigna_CMM-311%20Knee%20Replacement%20Arthroplasty_V2.0.2025_Eff03.07.2026_Pub11.21.2025.pdf",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "X-ray (weight-bearing) or MRI/arthroscopy", required: true,
        minimum_findings: "Quoted: severe unicompartmental, bicompartmental, or tricompartmental osteoarthritis evidenced by ANY of: Kellgren-Lawrence Grade III or IV radiographic findings; OR Outerbridge Classification Grade IV arthroscopic findings AND not a candidate for joint-sparing procedure; OR Modified Outerbridge Classification Grade IV MRI findings AND not a candidate for joint-sparing procedure. OR avascular necrosis (AVN) of the femoral condyles and/or proximal tibia. Corrected from a prior 'KL Grade 3-4 preferred' reading — KL III/IV is one of three alternate qualifying pathways, not the only one, and it is not merely 'preferred.'" },
    ],
    conservative_treatment_requirements: [
      { treatment: "Provider-directed non-surgical management", minimum_duration: "3 months",
        notes: "Quoted: \"Failure of provider-directed non-surgical management for at least three (3) months duration.\" This is a single combined requirement (not split by NSAID vs. PT with different durations as previously coded). Criteria exception: non-surgical management may be skipped if the medical record clearly documents why it is not appropriate." },
    ],
    functional_criteria: [
      "Quoted: function-limiting pain at short distances (e.g., walking less than one-quarter mile, limiting activity to two city blocks, the equivalent of walking the length of a shopping mall) for at least three (3) months duration",
      "Quoted: loss of knee function which interferes with the ability to carry out age-appropriate activities of daily living and/or demands of employment",
    ],
    radiographic_criteria: [
      "Kellgren-Lawrence Grade III or IV (quoted) — corrected from 'Grade 3 or 4' framed as a single fixed cutoff; the guideline treats it as one of three alternate qualifying findings alongside Outerbridge/Modified Outerbridge Grade IV",
      "Formal report with grading",
    ],
    additional_documentation: [
      "Clinical notes spanning ≥3 months showing persistent function-limiting pain",
      "Documentation of failed provider-directed non-surgical management, or explicit documented rationale for why it was not appropriate",
      "Quoted: \"It is incumbent on the surgeon to preoperatively optimize reasonably modifiable medical and behavioral health comorbidities\" — no specific BMI cutoff (e.g., 45) appears in the indications criteria itself; a prior version of this rule cited a specific BMI≥45 threshold as if it were a hard Cigna criterion, which is not supported by the indications text and has been removed",
    ],
    denial_risk_flags: [
      "Pain history < 3 months without a documented reason non-surgical management was skipped",
      "KL Grade < III with no Outerbridge/Modified Outerbridge Grade IV or AVN finding as an alternate qualifying pathway",
      "Missing formal radiologist report",
      "No documentation of comorbidity optimization discussion (surgeon-level requirement per guideline, not tied to a specific BMI number)",
    ],
    auto_approval_exceptions: [
      "Fracture of distal femur (trochlea, condyles) where conservative management or surgical fixation is not a reasonable option — separate indication pathway from OA/AVN",
    ],
  },
  {
    payer_id: "cigna",
    payer_name: "Cigna (EviCore managed)",
    cpt_code: "27130",
    procedure_name: "Total Hip Arthroplasty",
    pa_required: true,
    guideline_source: "EviCore CMM-313: Hip Replacement/Arthroplasty, V2.0.2025 (eff. March 7, 2026, pub. Nov 21, 2025) — currently in effect as of last verification (2026-06-30). SUPERSEDED by V1.0.2026 (eff. Aug 4, 2026, pub. Apr 20, 2026) — direct fetch (2026-06-30) confirms V1.0.2026's Total Hip Replacement Indications section is substantively identical to V2.0.2025 (same Tönnis Grade 2-3 criterion, same 3-month duration, same exception language), so no re-verification of content should be needed after the Aug 4, 2026 transition, but re-confirm the citation/URL at that time. Original citation used filename 'Hip Replace Arthro' which 404's — correct filename is 'Hip Replacement Arthro'.",
    guideline_last_updated: "2025-11-21",
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://www.evicore.com/sites/default/files/clinical-guidelines/2025-11/Cigna_CMM-313%20Hip%20Replacement%20Arthro_V2.0.2025_Eff03.07.2026_Pub11.21.2025.pdf",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true,
        minimum_findings: "Quoted: imaging shows ANY of: Tönnis Grade 2-3 osteoarthritis; OR avascular necrosis with collapse of the femoral head; OR inflammatory arthritis affecting BOTH the femoral head and the acetabulum with joint space narrowing. Corrected from a prior 'Advanced degenerative joint disease' / 'KL Grade 3-4 preferred' framing — this is the wrong grading scale (KL is for knee); the hip document uses Tönnis exclusively, with two additional non-grade-based qualifying findings (AVN with collapse, inflammatory arthritis)." },
    ],
    conservative_treatment_requirements: [
      { treatment: "Provider-directed non-surgical management", minimum_duration: "3 months",
        notes: "Quoted: \"Failure of provider-directed non-surgical management for at least three (3) months' duration.\" Criteria exception: not required when the medical record clearly documents why it is inappropriate — this is a documentation-based exception only, NOT tied to a specific Tönnis grade or AVN/inflammatory-arthritis finding (unlike Anthem/Carelon's grade-triggered waiver for the same procedure — do not conflate the two payers' waiver structures)." },
    ],
    functional_criteria: [
      "Quoted: function-limiting pain at short distances (e.g., walking less than one-quarter mile, limiting activity to two city blocks, the equivalent of walking the length of a shopping mall) for at least three (3) months duration",
      "Quoted: loss of hip function which interferes with the ability to carry out age-appropriate activities of daily living and/or demands of employment",
    ],
    radiographic_criteria: [
      "Tönnis Grade 2-3 (quoted) — corrected from 'KL Grade 3-4 preferred', which was the wrong grading scale for hip",
      "Formal radiology report required",
    ],
    additional_documentation: [
      "Clinical notes spanning ≥3 months showing persistent function-limiting pain",
      "Documentation of failed provider-directed non-surgical management, or explicit documented rationale for why it was not appropriate",
      "Quoted: \"It is incumbent on the surgeon to preoperatively optimize reasonably modifiable medical and behavioral health comorbidities\" — no specific BMI cutoff appears in the indications text itself",
    ],
    denial_risk_flags: [
      "Symptom duration < 3 months without a documented reason non-surgical management was skipped",
      "Radiology report uses KL grade instead of Tönnis grade — wrong scale for hip",
      "Imaging not completed at submission",
      "No documented non-surgical management attempt, or no documented rationale for skipping it",
    ],
    auto_approval_exceptions: [
      "Femoral Head/Neck Fracture where conservative management or surgical fixation is not a reasonable option — separate indication pathway with no 3-month duration requirement at all",
    ],
  },
  {
    payer_id: "cigna",
    payer_name: "Cigna (EviCore managed)",
    cpt_code: "29827",
    procedure_name: "Arthroscopic Rotator Cuff Repair",
    pa_required: true,
    guideline_source: "EviCore CMM-315: Shoulder Surgery - Arthroscopic and Open Procedures, V2.0.2025 (eff. March 7, 2026, pub. Nov 21, 2025). Direct fetch (2026-06-30) — full document read; Rotator Cuff Repair Indications section is on pages 26-27 of 65, quoted below.",
    guideline_last_updated: "2025-11-21",
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://www.evicore.com/sites/default/files/clinical-guidelines/2025-11/Cigna_CMM-315%20Shoulder%20Surg%20Arthro%20Open%20Proc_V2.0.2025_Eff03.07.2026_Pub11.21.2025.pdf",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "MRI or CT shoulder", required: true,
        minimum_findings: "Quoted: MRI or CT shows EITHER of the following: Grade 2 or 3 partial-thickness rotator cuff tear (Ellman classification) OR full-thickness rotator cuff tear (Cofield classification). Ellman Grade 1 (<25% thickness) does not qualify." },
    ],
    conservative_treatment_requirements: [
      { treatment: "Provider-directed non-surgical management", minimum_duration: "3 months",
        notes: "Quoted: \"Failure of provider-directed non-surgical management for at least three (3) months duration.\" Criteria exception: not required for a discrete traumatic event resulting in an acute full-thickness tear WITHOUT evidence of a pre-existing chronic tear. Quoted: \"The presence of fatty infiltration and/or muscle atrophy on MRI or CT is considered evidence of pre-existing chronic rotator cuff tear... Therefore, when fatty infiltration and/or muscle atrophy is also present on MRI or CT, three (3) months of provider-directed non-surgical management is required, regardless of whether a discrete traumatic event occurred.\" Corrected from a prior '≥6 weeks' reading and from a prior claim that high-grade partial-thickness tears are also exempt — the exemption is acute-trauma-specific, not tear-grade-specific." },
    ],
    functional_criteria: [
      "Quoted: EITHER functionally-limited range of motion OR measurable loss of strength of the rotator cuff musculature (vs. non-involved side) — no VAS pain score threshold appears anywhere in this section; do not cross-apply Anthem/Carelon's VAS≥3 criterion here, they are different payers with different documents",
      "Quoted: ANY one positive orthopedic test/sign — Drop Arm Test, painful Arc Test, Jobe Test or Empty Can Test, External Rotation Lag Sign (Dropping Sign), Internal Rotation Lag Sign, Lift-Off Test, Bear Hug test, Belly Press Test (Napoleon), Belly-Off Test, Neer Impingement Test, Hawkins-Kennedy Impingement Test, or Hornblower Test (Patte)",
      "Function-limiting pain interfering with age-appropriate ADLs or occupational demands",
    ],
    radiographic_criteria: [
      "MRI or CT confirming Ellman Grade 2/3 partial-thickness OR Cofield full-thickness tear",
      "Note presence/absence of fatty infiltration or muscle atrophy on MRI/CT — this determines whether the 3-month conservative-care exception can apply",
    ],
    additional_documentation: [
      "MRI/CT report from interpreting radiologist",
      "Physical exam documenting the specific positive orthopedic test performed",
      "Quoted exclusion list: other pathological conditions excluded, including but not limited to fracture, thoracic outlet syndrome, brachial plexus disorders, referred neck pain, cervical radiculopathy, and advanced glenohumeral osteoarthritis",
    ],
    denial_risk_flags: [
      "MRI/CT not completed prior to submission",
      "Partial-thickness tear below Ellman Grade 2 (i.e., Grade 1, <25% thickness) — does not meet Cigna's threshold",
      "No documented positive orthopedic test from the accepted list",
      "Traumatic tear claimed as exempt from conservative care but fatty infiltration/atrophy present on imaging — the 3-month requirement still applies in this case per the guideline's explicit language",
      "VAS pain score referenced in the letter — Cigna's CMM-315 does not use a VAS threshold; that is an Anthem/Carelon-specific criterion",
    ],
    auto_approval_exceptions: [
      "Acute traumatic full-thickness tear with a discrete traumatic event, WITHOUT fatty infiltration or muscle atrophy on MRI/CT",
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
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "X-ray (weight-bearing)", required: true, minimum_findings: "KL Grade 2+ with formal report. Corrected waiver detail below." },
    ],
    conservative_treatment_requirements: [
      { treatment: "NSAIDs or analgesics", minimum_duration: "Documented trial" },
      { treatment: "Physical therapy", minimum_duration: "12 weeks", notes: "Direct fetch (2026-06-30): \"Failure of at least 12 weeks of non-surgical conservative management (unless radiographs show Kellgren-Lawrence grade 4, modified Outerbridge grade 4, or Tonnis grade 3).\" Corrected from a prior '6 weeks typically' reading — 12 weeks is the standard, not an upper-bound InterQual figure." },
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
      "Waiver of the 12-week conservative-care requirement triggers on ANY of: KL Grade 4, modified Outerbridge Grade 4, or Tönnis Grade 3 — corrected from a prior 'KL Grade 4 only' reading",
    ],
    additional_documentation: [
      "Clinical notes with ADL impact",
      "Conservative treatment records spanning the full 12-week course (unless a waiver grade applies)",
      "Radiology report with KL grade",
    ],
    denial_risk_flags: [
      "KL Grade < 2",
      "PT course < 12 weeks without a qualifying waiver grade (KL4 / Outerbridge4 / Tönnis3) documented",
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
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "X-ray (AP pelvis + lateral hip)", required: true, minimum_findings: "Advanced OA. Waiver detail corrected below — three grading scales can each independently trigger the waiver, not just KL." },
    ],
    conservative_treatment_requirements: [
      { treatment: "Conservative management", minimum_duration: "12 weeks", notes: "Direct fetch (2026-06-30): \"Failure of at least 12 weeks of non-surgical conservative management (unless radiographs show Kellgren-Lawrence grade 4, modified Outerbridge grade 4, or Tonnis grade 3).\" Corrected from a prior '6 weeks' reading." },
      { treatment: "Physical therapy or analgesics", minimum_duration: "Documented" },
    ],
    functional_criteria: [
      "Hip pain with functional impairment for ≥6 months",
      "Physical exam supporting OA diagnosis",
    ],
    radiographic_criteria: [
      "Advanced OA with formal radiologist interpretation",
      "Waiver of the 12-week conservative-care requirement triggers on ANY of: KL Grade 4, modified Outerbridge Grade 4, or Tönnis Grade 3 — corrected from a prior 'KL Grade 4 only' reading",
    ],
    additional_documentation: [
      "Conservative treatment records spanning the full 12-week course (unless a waiver grade applies)",
      "Radiology report with OA grading",
    ],
    denial_risk_flags: [
      "Symptom duration < 6 months without acute precipitant",
      "No completed imaging at submission",
      "Conservative course < 12 weeks without a qualifying waiver grade (KL4 / Outerbridge4 / Tönnis3) documented",
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
    validation_status: "validated",
    source_type: "official_portal",
    source_url: "https://guidelines.carelonmedicalbenefitsmanagement.com/joint-surgery-2025-11-15/",
    last_verified_date: "2026-06-30",
    verification_method: "direct_fetch_quoted",
    required_imaging: [
      { modality: "MRI shoulder", required: true, minimum_findings: "Full-thickness RTC tear confirmed OR partial-thickness. Tendon retraction distance should be documented." },
    ],
    conservative_treatment_requirements: [
      { treatment: "Physical therapy or supervised conservative management", minimum_duration: "≥6 weeks for chronic/degenerative full-thickness tears AND for partial-thickness tears; NOT required for acute full-thickness tears (injury within the preceding 3 months)", notes: "CORRECTION (direct fetch, 2026-06-30): the prior version of this rule claimed partial-thickness tears were also waived from the conservative-therapy requirement. The actual guideline text does not support that — partial-thickness tears carry the same ≥6-week/VAS≥3 requirement as chronic full-thickness tears. Only an acute traumatic full-thickness tear (documented onset within 3 months) skips conservative management." },
      { treatment: "NSAIDs or analgesics", minimum_duration: "Documented trial" },
      { treatment: "Subacromial injection", minimum_duration: "Considered", notes: "Not mandatory but absence is a soft flag for chronic non-traumatic presentation" },
    ],
    functional_criteria: [
      "VAS pain score ≥3 — confirmed via direct fetch (\"Pain ≥ 3 on the VAS scale which interferes with age-appropriate activities of daily living\" for chronic/degenerative and partial-thickness tears; \"Shoulder pain ≥ 3 on the VAS scale exacerbated by movement\" for acute tears)",
      "Functional impairment: shoulder weakness, ROM limitation, ADL impact",
      "Physical exam consistent with RTC pathology (positive provocative tests)",
    ],
    radiographic_criteria: [
      "MRI-confirmed rotator cuff tear",
      "Full-thickness or partial-thickness documentation required — high-grade classification is NOT a documented exception trigger per direct-fetch review; corrected from a prior claim that it was",
      "Retraction distance if present",
    ],
    additional_documentation: [
      "MRI report from radiologist",
      "Physical exam with provocative test findings",
      "Conservative treatment records — required for all tear types except acute traumatic full-thickness within 3 months of injury",
    ],
    denial_risk_flags: [
      "MRI not completed prior to PA submission",
      "Partial-thickness tear submitted without conservative treatment records, on the mistaken assumption that partial-thickness is exempt — it is not",
      "VAS pain score not documented",
      "No physical exam with provocative tests",
    ],
    auto_approval_exceptions: [
      "Acute traumatic full-thickness tear with documented onset within 3 months — conservative management not required",
    ],
  },
];

// Enforce the validation gate invariant at module load: a rule can only be
// "validated" if it was confirmed by directly fetching and quoting the primary
// source. This can't be expressed in the type system (TS can't cross-check one
// field's value against another's), so it's checked here instead — this way a
// future edit that flips validation_status without doing the underlying
// verification work fails loudly on import rather than silently shipping.
for (const rule of PAYER_RULES) {
  if (rule.validation_status === "validated" && rule.verification_method !== "direct_fetch_quoted") {
    throw new Error(
      `payer-rules invariant violation: ${rule.payer_name} ${rule.cpt_code} is marked "validated" but verification_method is "${rule.verification_method}", not "direct_fetch_quoted". Only rules with directly fetched/quoted primary-source confirmation may be validated.`
    );
  }
  if (rule.validation_status === "validated" && !rule.last_verified_date) {
    throw new Error(
      `payer-rules invariant violation: ${rule.payer_name} ${rule.cpt_code} is marked "validated" but has no last_verified_date.`
    );
  }
  if (rule.validation_status === "unvalidated" && rule.last_verified_date) {
    throw new Error(
      `payer-rules invariant violation: ${rule.payer_name} ${rule.cpt_code} is "unvalidated" but has a last_verified_date set. Clear the date or flip the status.`
    );
  }
}

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

INSTRUCTION: Address each criterion using only facts present in the extraction JSON; where a criterion is unmet, remain silent — gaps are surfaced upstream.`;
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
