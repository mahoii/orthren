type FixGuidance = {
  guidance: string;
  inputLabel: string;
  inputPlaceholder: string;
};

// Returns null when score >= 8 (factor is strong — no fix needed).
// With binary 0/1 scores from pa_strength, score=0 always lands in the 0–3 tier.
export function getSuggestFixGuidance(
  factorKey: string,
  score: number,
  note: string
): FixGuidance | null {
  if (score >= 8) return null;

  const tier: "critical" | "moderate" | "minor" =
    score <= 3 ? "critical" : score <= 6 ? "moderate" : "minor";

  switch (factorKey) {
    case "conservative_treatment_duration":
      if (tier === "critical") return {
        guidance: `Critical gap: letter lacks specific dates and duration for one or more treatments. Payers deny for vague timelines. Find exact start/end dates in the chart notes or billing records. Note: ${note}`,
        inputLabel: "Treatment timeline details",
        inputPlaceholder: "Physical therapy: Oct 2024 – Dec 2024, 3x/week, 18 sessions, no functional ROM improvement. NSAIDs: Oct 2024 – Jan 2025, 4 months, minimal relief.",
      };
      if (tier === "moderate") return {
        guidance: `Duration present but incomplete. Add frequency and session count where available. ${note}`,
        inputLabel: "Treatment timeline details",
        inputPlaceholder: "PT: 6 weeks, 2x/week. Corticosteroid injection: Jan 15 2025, transient 2-week relief.",
      };
      return {
        guidance: `Add outcome language to each treatment. ${note}`,
        inputLabel: "Treatment timeline details",
        inputPlaceholder: "PT completed full course without functional improvement. NSAID discontinued after 4 months, no durable relief.",
      };

    case "imaging_findings":
      if (tier === "critical") return {
        guidance: `No confirmed imaging in letter. If imaging exists in the chart, provide date, facility, modality, and exact findings. If imaging is pending, do NOT submit PA — this is a hard denial trigger. ${note}`,
        inputLabel: "Imaging details",
        inputPlaceholder: "MRI right shoulder, March 1 2025, Westbrook Imaging Center: full-thickness supraspinatus tear, 2.0cm retraction to musculotendinous junction. X-ray Feb 10 2025: mild AC joint arthropathy, no fracture.",
      };
      if (tier === "moderate") return {
        guidance: `Imaging present but missing quantitative findings. Add specific values (KL grade, tear size, retraction distance, joint space narrowing mm). ${note}`,
        inputLabel: "Imaging details",
        inputPlaceholder: "KL Grade 3 bilateral knees. Right knee medial JSN 2mm. Left knee mild osteophyte formation.",
      };
      return {
        guidance: `Add imaging facility and date if not already present. ${note}`,
        inputLabel: "Imaging details",
        inputPlaceholder: "Obtained at Westbrook Imaging Center, March 1 2025.",
      };

    case "conservative_treatments_named":
      if (tier === "critical") return {
        guidance: `No conservative treatments documented. This is a hard denial trigger for most payers. Find any PT, injections, NSAIDs, or activity modification in the chart and supply here. Even patient-reported treatments count if documented. ${note}`,
        inputLabel: "Conservative treatments attempted",
        inputPlaceholder: "Physical therapy x6 weeks. Naproxen 500mg BID x3 months discontinued GI intolerance. Corticosteroid injection x2 (right knee Jan 2024, left knee Mar 2024).",
      };
      if (tier === "moderate") return {
        guidance: `Some treatments listed but incomplete. Add any additional treatments not captured, including OTC medications, activity modification, bracing, ice. ${note}`,
        inputLabel: "Conservative treatments attempted",
        inputPlaceholder: "Also: ibuprofen OTC stopped due to GI issues. Ice and rest x6 weeks. Knee sleeve worn during ambulation.",
      };
      return {
        guidance: note,
        inputLabel: "Conservative treatments attempted",
        inputPlaceholder: "Add any treatment omitted from chart extract.",
      };

    case "functional_limitations":
      if (tier === "critical") return {
        guidance: `No specific functional limitations documented. Payers need measurable impairment. Find ROM measurements, walking distance limits, ADL deficits, pain scores, or work limitations in the chart. ${note}`,
        inputLabel: "Functional limitations",
        inputPlaceholder: "ROM: flexion 60°, abduction 45°. Cannot walk >half block. Unable to climb stairs without rail. Cannot lift >2 lbs. Pain 8/10. Nighttime pain 3-4 awakenings/night.",
      };
      if (tier === "moderate") return {
        guidance: `Limitations listed but vague. Add objective measurements where available. ${note}`,
        inputLabel: "Functional limitations",
        inputPlaceholder: "Active flexion 60°, abduction 45°. Walking limited to one-half block. Cannot perform job duties (overhead filing, lifting).",
      };
      return {
        guidance: note,
        inputLabel: "Functional limitations",
        inputPlaceholder: "Add any specific ADL deficit or measurement not captured.",
      };

    case "surgical_approach":
      if (tier === "critical") return {
        guidance: `Surgical approach not specified or incorrect. Provide the exact approach, implant type, and laterality from the plan section. ${note}`,
        inputLabel: "Surgical approach details",
        inputPlaceholder: "Arthroscopic approach, suture anchor fixation, right shoulder. OR: Cemented total knee arthroplasty, right knee, posterior-stabilized implant.",
      };
      if (tier === "moderate") return {
        guidance: `Approach present but missing implant or laterality. ${note}`,
        inputLabel: "Surgical approach details",
        inputPlaceholder: "Cemented implant fixation. Right knee. Medial parapatellar approach.",
      };
      return {
        guidance: note,
        inputLabel: "Surgical approach details",
        inputPlaceholder: "Add specific implant type or technique if available.",
      };

    case "symptom_duration":
      if (tier === "critical") return {
        guidance: `Symptom duration not documented. Find the onset date or 'x months of pain' language in HPI. Payers want to see duration >= 3 months for most procedures. ${note}`,
        inputLabel: "Symptom onset / duration",
        inputPlaceholder: "8-month history of right shoulder pain beginning August 2024 following fall. OR: Progressive bilateral knee pain for 24 months.",
      };
      if (tier === "moderate") return {
        guidance: `Duration present but imprecise. Add onset date or anchor to a clinical event if documented. ${note}`,
        inputLabel: "Symptom onset / duration",
        inputPlaceholder: "Pain onset following occupational lifting injury approximately 18 months ago. First documented visit for this complaint: October 2023.",
      };
      return {
        guidance: note,
        inputLabel: "Symptom onset / duration",
        inputPlaceholder: "Add specific onset date if available.",
      };

    case "diagnosis_codes":
      if (tier === "critical") return {
        guidance: `Diagnosis code missing or invalid. Find the ICD-10 codes in the assessment section of the chart. ${note}`,
        inputLabel: "Diagnosis codes",
        inputPlaceholder: "M75.121 — Complete rotator cuff tear, right shoulder. M75.31 — Calcific tendinitis, right shoulder.",
      };
      if (tier === "moderate") return {
        guidance: `Primary code present but secondary codes missing. ${note}`,
        inputLabel: "Diagnosis codes",
        inputPlaceholder: "Secondary: M17.12 primary osteoarthritis left knee.",
      };
      return {
        guidance: note,
        inputLabel: "Diagnosis codes",
        inputPlaceholder: "Add any secondary diagnosis codes from assessment.",
      };

    case "cpt_code_valid":
      if (tier === "critical") return {
        guidance: `CPT code does not match the procedure. Verify the correct code against the plan section. Common orthopedic codes: 27447 (TKA), 27130 (THA), 29827 (rotator cuff repair). ${note}`,
        inputLabel: "Correct CPT code",
        inputPlaceholder: "27447 — Total Knee Arthroplasty",
      };
      if (tier === "moderate") return {
        guidance: note,
        inputLabel: "Correct CPT code",
        inputPlaceholder: "Confirm CPT matches procedure in plan section.",
      };
      // minor tier: code is effectively valid — no guidance needed
      return null;

    default:
      return null;
  }
}
