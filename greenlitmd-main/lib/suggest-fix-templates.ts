type FixGuidance = {
  guidance: string;
  inputLabel: string;
  inputPlaceholder: string;
};

// Returns null when score >= 8 (factor is strong — no fix needed). In practice this
// is only ever called from app/review/page.tsx with score=0 — attention items are
// only built for factors below their max score, and pa_strength factors are binary
// (0 or 1) — so every call resolves to the single "critical gap" guidance below.
// There used to be "moderate"/"minor" tiers here from a pre-binary 0-10 scoring
// scheme; they were unreachable dead code and have been removed.
export function getSuggestFixGuidance(
  factorKey: string,
  score: number,
  note: string
): FixGuidance | null {
  if (score >= 8) return null;

  switch (factorKey) {
    case "conservative_treatment_duration":
      return {
        guidance: `Critical gap: letter lacks specific dates and duration for one or more treatments. Payers deny for vague timelines. Find exact start/end dates in the chart notes or billing records. Note: ${note}`,
        inputLabel: "Treatment timeline details",
        inputPlaceholder: "Physical therapy: Oct 2024 – Dec 2024, 3x/week, 18 sessions, no functional ROM improvement. NSAIDs: Oct 2024 – Jan 2025, 4 months, minimal relief.",
      };

    case "imaging_findings":
      return {
        guidance: `No confirmed imaging in letter. If imaging exists in the chart, provide date, facility, modality, and exact findings. If imaging is pending, do NOT submit PA — this is a hard denial trigger. ${note}`,
        inputLabel: "Imaging details",
        inputPlaceholder: "MRI right shoulder, March 1 2025, Westbrook Imaging Center: full-thickness supraspinatus tear, 2.0cm retraction to musculotendinous junction. X-ray Feb 10 2025: mild AC joint arthropathy, no fracture.",
      };

    case "conservative_treatments_named":
      return {
        guidance: `No conservative treatments documented. This is a hard denial trigger for most payers. Find any PT, injections, NSAIDs, or activity modification in the chart and supply here. Even patient-reported treatments count if documented. ${note}`,
        inputLabel: "Conservative treatments attempted",
        inputPlaceholder: "Physical therapy x6 weeks. Naproxen 500mg BID x3 months discontinued GI intolerance. Corticosteroid injection x2 (right knee Jan 2024, left knee Mar 2024).",
      };

    case "functional_limitations":
      return {
        guidance: `No specific functional limitations documented. Payers need measurable impairment. Find ROM measurements, walking distance limits, ADL deficits, pain scores, or work limitations in the chart. ${note}`,
        inputLabel: "Functional limitations",
        inputPlaceholder: "ROM: flexion 60°, abduction 45°. Cannot walk >half block. Unable to climb stairs without rail. Cannot lift >2 lbs. Pain 8/10. Nighttime pain 3-4 awakenings/night.",
      };

    case "surgical_approach":
      return {
        guidance: `Surgical approach not specified or incorrect. Provide the exact approach, implant type, and laterality from the plan section. ${note}`,
        inputLabel: "Surgical approach details",
        inputPlaceholder: "Arthroscopic approach, suture anchor fixation, right shoulder. OR: Cemented total knee arthroplasty, right knee, posterior-stabilized implant.",
      };

    case "symptom_duration":
      return {
        guidance: `Symptom duration not documented. Find the onset date or 'x months of pain' language in HPI. Payers want to see duration >= 3 months for most procedures. ${note}`,
        inputLabel: "Symptom onset / duration",
        inputPlaceholder: "8-month history of right shoulder pain beginning August 2024 following fall. OR: Progressive bilateral knee pain for 24 months.",
      };

    case "diagnosis_codes":
      return {
        guidance: `Diagnosis code missing or invalid. Find the ICD-10 codes in the assessment section of the chart. ${note}`,
        inputLabel: "Diagnosis codes",
        inputPlaceholder: "M75.121 — Complete rotator cuff tear, right shoulder. M75.31 — Calcific tendinitis, right shoulder.",
      };

    case "cpt_code_valid":
      return {
        guidance: `CPT code does not match the procedure. Verify the correct code against the plan section. Common orthopedic codes: 27447 (TKA), 27130 (THA), 29827 (rotator cuff repair). ${note}`,
        inputLabel: "Correct CPT code",
        inputPlaceholder: "27447 — Total Knee Arthroplasty",
      };

    default:
      return null;
  }
}
