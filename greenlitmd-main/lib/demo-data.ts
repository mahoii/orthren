import type { GeneratePaResponse } from "@/lib/types";

// ─── Profile 1: Clean TKA — Maria A. Delgado ─────────────────────────────────
// High PA Strength Score (≈ 8.0). All core factors present.
// Payer: BlueCross BlueShield | CPT: 27447
export const CLEAN_TKA: GeneratePaResponse = {
  letter: `May 21, 2026

BlueCross BlueShield
Prior Authorization Department

Re: Prior Authorization Request — Bilateral Total Knee Arthroplasty (CPT 27447)
Patient: Maria A. Delgado | DOB: 09/22/1959
Requesting Provider: Dr. R. Chambers, MD — Westbrook Orthopedic Surgery Center

Dear Prior Authorization Reviewer,

I am writing to request prior authorization for bilateral total knee arthroplasty (CPT 27447) on behalf of my patient, Maria A. Delgado (DOB: 09/22/1959). Ms. Delgado presents with end-stage bilateral knee osteoarthritis, confirmed by clinical examination, radiographic imaging, and an extended history of conservative treatment failure. This procedure is medically necessary and meets the established clinical criteria for surgical intervention under BlueCross BlueShield coverage guidelines.

CLINICAL HISTORY AND PRESENTING COMPLAINT

Ms. Delgado is a 64-year-old female with a 24-month history of progressive bilateral knee pain, left worse than right, consistent with advanced degenerative joint disease. She reports constant, moderate-to-severe pain rated 7–8/10 on the Visual Analog Scale at rest, escalating to 9/10 with activity. Symptoms have progressively worsened despite comprehensive conservative management and now significantly impair her activities of daily living.

DIAGNOSIS

Primary diagnoses:
  • M17.11 — Primary osteoarthritis, right knee
  • M17.12 — Primary osteoarthritis, left knee

Radiographic Assessment: Weight-bearing anteroposterior and lateral X-rays of bilateral knees demonstrate Kellgren-Lawrence Grade 3 changes bilaterally, with moderate-to-severe joint space narrowing and marginal osteophyte formation consistent with end-stage degenerative joint disease.

FUNCTIONAL LIMITATIONS

Ms. Delgado's bilateral knee OA has resulted in significant and measurable functional impairment, including:

  1. Cannot walk more than half a block without stopping due to pain — severely limiting her ability to perform community ambulation and basic outdoor activities.
  2. Unable to climb or descend stairs without bilateral rail support — precluding safe independent access to multi-level environments.
  3. Significant difficulty with prolonged standing — unable to prepare meals or perform household tasks exceeding 10 minutes of standing.
  4. Unable to perform grocery shopping independently — requires assistance for all shopping, creating a significant burden on family caregivers.

These impairments represent a substantial reduction in Ms. Delgado's quality of life and independence. Her limitations are directly attributable to bilateral knee osteoarthritis and are not adequately addressed by continued conservative measures.

CONSERVATIVE TREATMENT HISTORY

Ms. Delgado has undergone an extensive and documented course of conservative treatment prior to this surgical request. The following interventions have been attempted without achieving durable functional improvement:

  1. Physical Therapy (4 weeks): Structured outpatient physical therapy was completed. Ms. Delgado demonstrated mild short-term improvement in ROM but experienced persistent pain with all weight-bearing activities. Therapy was discontinued due to inability to tolerate exercise intensity secondary to bilateral pain.

  2. NSAIDs — Naproxen 500mg (January–March 2024, 3 months): Prescribed for pain management. Patient experienced partial relief during the first month; however, therapy was limited by the development of gastrointestinal discomfort, requiring dose reduction and eventual discontinuation.

  3. Corticosteroid Injection — Left Knee: Intra-articular corticosteroid injection was administered to the left knee. Patient reported temporary pain relief of approximately three weeks duration, followed by return of baseline pain. The short-lived benefit supports progression of disease beyond the scope of injectable management.

  4. Corticosteroid Injection — Right Knee: Intra-articular corticosteroid injection was also performed on the right knee to manage bilateral symptom burden.

  5. Weight Loss Counseling: Ms. Delgado was referred to a structured weight loss counseling program to address obesity as a modifiable risk factor for knee OA progression and surgical candidacy.

Despite this comprehensive conservative care program, Ms. Delgado continues to experience debilitating bilateral knee pain and functional limitation. The clinical evidence supports that she has exhausted appropriate non-operative options and is a suitable candidate for surgical intervention.

REQUESTED PROCEDURE

Procedure: Bilateral Total Knee Arthroplasty
CPT Code: 27447
Surgical Approach: Cemented implant, bilateral
Facility: Westbrook Orthopedic Surgery Center

Bilateral simultaneous TKA is appropriate for this patient given the symmetric severity of disease in both knees, as documented radiographically and clinically. A staged approach would expose the patient to two separate anesthetic events and prolonged periods of impaired function.

MEDICAL NECESSITY SUMMARY

The request for bilateral total knee arthroplasty for Ms. Maria A. Delgado meets the criteria for medical necessity on the following grounds:

  • Confirmed radiographic evidence of bilateral end-stage osteoarthritis (KL Grade 3)
  • 24-month history of progressive bilateral knee pain refractory to conservative treatment
  • Failure of multiple evidence-based conservative interventions over an extended treatment period
  • Documented, measurable functional impairment affecting activities of daily living and independent living
  • Clear indication for surgical intervention consistent with established orthopedic standards of care

I respectfully request approval for CPT 27447 — Bilateral Total Knee Arthroplasty for Ms. Maria A. Delgado. I am available to discuss this case further or provide any additional clinical documentation required to support this request.

Sincerely,

Dr. R. Chambers, MD
Westbrook Orthopedic Surgery Center`,

  extracted: {
    patient_name: "Maria A. Delgado",
    date_of_birth: "09/22/1959",
    diagnosis_codes: ["M17.11", "M17.12"],
    primary_complaint: "Bilateral knee pain, left worse than right",
    symptom_duration: "24 months",
    functional_limitations: [
      "Cannot walk more than half a block without stopping due to pain",
      "Unable to climb or descend stairs without bilateral rail support",
      "Significant difficulty with prolonged standing",
      "Unable to perform grocery shopping independently"
    ],
    objective_measurements: [],
    conservative_treatments_attempted: [
      {
        treatment: "Physical therapy",
        duration: "4 weeks",
        outcome: "Mild improvement; therapy discontinued",
        dates: null
      },
      {
        treatment: "NSAIDs (naproxen 500mg)",
        duration: "3 months",
        outcome: "Partial relief; GI discomfort developed",
        dates: "Jan\u2013Mar 2024"
      },
      {
        treatment: "Corticosteroid injection (left knee)",
        duration: null,
        outcome: "Temporary relief approximately 3 weeks",
        dates: null
      },
      {
        treatment: "Corticosteroid injection (right knee)",
        duration: null,
        outcome: null,
        dates: null
      },
      {
        treatment: "Weight loss counseling",
        duration: null,
        outcome: "No outcome recorded",
        dates: null
      }
    ],
    imaging_findings: {
      modality: "X-ray (bilateral)",
      key_findings:
        "Kellgren-Lawrence Grade 3 bilateral; moderate joint space narrowing; marginal osteophytes"
    },
    requested_procedure: "Bilateral Total Knee Arthroplasty",
    surgical_approach_if_mentioned: "Cemented implant, bilateral",
    denial_risk_flags: [
      {
        id: "flag-pt-duration",
        label: "PT Duration Below Payer Threshold",
        severity: "high",
        explanation: "Physical therapy documented for only 4 weeks. BCBS commercial PPO typically requires 6\u201312 weeks of structured PT before approving TKA.",
        recommendation: "Obtain PT records documenting additional sessions or initiate and document a full 6-week PT program before submission.",
        anchorText: "Physical Therapy (4 weeks)"
      },
      {
        id: "flag-injection-dates",
        label: "Injection Dates Incomplete",
        severity: "medium",
        explanation: "Corticosteroid injection dates not documented for right knee \u2014 unclear if injections were sequential or concurrent.",
        recommendation: "Retrieve injection procedure notes with exact dates and document each knee separately with outcome and follow-up.",
        anchorText: "Corticosteroid Injection \u2014 Right Knee"
      },
      {
        id: "flag-weight-loss-outcome",
        label: "Weight Loss Counseling Outcome Missing",
        severity: "low",
        explanation: "Weight loss counseling outcome not recorded. Payers may question whether obesity was adequately addressed pre-operatively.",
        recommendation: "Document weight loss counseling outcomes, including patient BMI trend and any achieved weight reduction.",
        anchorText: "Weight Loss Counseling"
      },
      {
        id: "flag-no-mri",
        label: "No MRI to Confirm End-Stage OA",
        severity: "medium",
        explanation: "No MRI on file. Some payers require advanced imaging to confirm end-stage OA diagnosis before approving bilateral TKA.",
        recommendation: "Order and document MRI or refer to prior MRI reports confirming cartilage loss consistent with end-stage OA.",
        anchorText: "Radiographic Assessment"
      }
    ],
    pa_strength: {
      diagnosis_codes: {
        score: 1,
        note: "Two ICD-10 codes documented for bilateral knee OA."
      },
      conservative_treatments_named: {
        score: 1,
        note: "Five distinct conservative treatments documented."
      },
      conservative_treatment_duration: {
        score: 0,
        note: "PT duration only 4 weeks \u2014 below typical payer threshold of 6\u201312 weeks.",
        anchorText: "Physical Therapy (4 weeks)"
      },
      imaging_findings: {
        score: 1,
        note: "Bilateral weight-bearing X-rays with KL Grade 3 findings documented."
      },
      functional_limitations: {
        score: 1,
        note: "Four specific functional limitations documented with measurable detail."
      },
      surgical_approach: {
        score: 1,
        note: "Cemented bilateral implant approach documented."
      },
      cpt_code_valid: {
        score: 1,
        note: "CPT 27447 is a recognized orthopedic surgical code."
      },
      symptom_duration: {
        score: 1,
        note: "24 months of symptoms documented."
      }
    },
    validation: {
      hard_blocks: [],
      soft_warnings: [
        {
          field: "conservative_treatment_duration",
          label: "Conservative Treatment Duration",
          message:
            "PT duration of 4 weeks is below the 6\u201312 week threshold most payers require."
        },
        {
          field: "imaging_findings",
          label: "Advanced Imaging",
          message:
            "No MRI on file \u2014 some payers require advanced imaging before approving bilateral TKA."
        }
      ]
    }
  }
};

// Backwards-compatible alias — keeps all existing imports in builder/page.tsx working.
export const DEMO_PA_DATA: GeneratePaResponse = CLEAN_TKA;

// ─── Profile 2: Messy Rotator Cuff — Robert Chen ─────────────────────────────
// Intermediate PA Strength Score (≈ 7.0). Surgical approach detail and precise
// symptom duration are missing. Flags target unstructured narrative extraction.
// Payer: UnitedHealthcare | CPT: 29827
export const MESSY_ROTATOR_CUFF: GeneratePaResponse = {
  letter: `May 21, 2026

UnitedHealthcare
Prior Authorization Department

Re: Prior Authorization Request — Arthroscopic Rotator Cuff Repair (CPT 29827)
Patient: Robert Chen | DOB: 11/14/1978
Requesting Provider: Dr. Alex Mercer, MD — Brooklyn Sports Medicine

Dear Prior Authorization Reviewer,

I am writing to request prior authorization for arthroscopic rotator cuff repair (CPT 29827) for my patient, Robert Chen (DOB: 11/14/1978). Mr. Chen presents with a confirmed full-thickness supraspinatus tear with significant functional impairment that has failed to respond to an appropriate course of conservative management. Surgical intervention is medically necessary and consistent with UnitedHealthcare clinical coverage guidelines for rotator cuff pathology.

CLINICAL HISTORY AND PRESENTING COMPLAINT

Mr. Chen is a 47-year-old male presenting with right shoulder pain and weakness of several months duration. He reports progressive right shoulder pain rated 6–8/10 with overhead activity and 4/10 at rest. The patient first noted symptoms following a lifting injury at work and has experienced progressive loss of function, including difficulty with overhead reaching, grooming, and sleep disruption due to positional pain.

DIAGNOSIS

Primary diagnosis:
  • M75.121 — Complete rotator cuff tear, right shoulder, not specified as traumatic

MRI Assessment (March 2026): MRI of the right shoulder demonstrates a full-thickness tear of the supraspinatus tendon measuring approximately 2.1 cm in the anterior-posterior dimension with mild retraction. Mild degenerative change at the acromioclavicular joint is noted. No biceps tendon pathology identified.

FUNCTIONAL LIMITATIONS

Mr. Chen's rotator cuff tear has resulted in the following functional impairments:

  1. Unable to perform overhead lifting beyond shoulder height — cannot perform job duties requiring overhead reach.
  2. Significant difficulty with grooming and dressing — unable to reach behind back or overhead without sharp pain.
  3. Sleep disruption — unable to sleep on affected right side due to positional shoulder pain.
  4. Reduced grip strength and shoulder stability — limiting activities of daily living and occupational performance.

CONSERVATIVE TREATMENT HISTORY

Mr. Chen completed the following conservative interventions prior to this surgical request:

  1. Physical Therapy (6 weeks): Structured rotator cuff strengthening and periscapular stabilization program completed. Patient showed limited improvement in ROM but persistent pain and weakness with resisted abduction and external rotation.

  2. NSAIDs — Meloxicam 15mg (6 weeks): Prescribed for pain and inflammation management. Patient reported mild partial relief but persistent functional impairment.

  3. Subacromial Corticosteroid Injection (x1): Subacromial injection administered under ultrasound guidance. Patient reported 3–4 weeks of partial pain relief followed by return of baseline symptoms.

Despite completion of conservative management, Mr. Chen continues to demonstrate pain, weakness, and functional impairment consistent with a surgically significant full-thickness rotator cuff tear. Conservative measures have been exhausted.

REQUESTED PROCEDURE

Procedure: Arthroscopic Rotator Cuff Repair
CPT Code: 29827
Surgical Approach: Arthroscopic technique
Facility: Brooklyn Sports Medicine

MEDICAL NECESSITY SUMMARY

  • MRI-confirmed full-thickness supraspinatus tear (2.1 cm, mild retraction)
  • Failure of 6-week structured physical therapy program
  • Failure of NSAIDs and subacromial injection
  • Documented functional impairment affecting occupation and daily activities
  • Surgical repair indicated to restore tendon integrity and prevent further retraction

I respectfully request approval for CPT 29827 — Arthroscopic Rotator Cuff Repair for Mr. Robert Chen. Please contact our office if additional documentation is required.

Sincerely,

Dr. Alex Mercer, MD
Brooklyn Sports Medicine`,

  extracted: {
    patient_name: "Robert Chen",
    date_of_birth: "11/14/1978",
    diagnosis_codes: ["M75.121"],
    primary_complaint: "Right shoulder pain and weakness following lifting injury",
    symptom_duration: "Several months",
    functional_limitations: [
      "Unable to perform overhead lifting beyond shoulder height",
      "Significant difficulty with grooming and dressing",
      "Sleep disruption due to positional shoulder pain",
      "Reduced grip strength and shoulder stability"
    ],
    objective_measurements: [
      "Full-thickness supraspinatus tear — 2.1 cm AP dimension, mild retraction (MRI March 2026)"
    ],
    conservative_treatments_attempted: [
      {
        treatment: "Physical therapy",
        duration: "6 weeks",
        outcome: "Limited ROM improvement; persistent pain and weakness",
        dates: null
      },
      {
        treatment: "NSAIDs (Meloxicam 15mg)",
        duration: "6 weeks",
        outcome: "Partial relief; persistent functional impairment",
        dates: null
      },
      {
        treatment: "Subacromial corticosteroid injection",
        duration: null,
        outcome: "3–4 weeks partial pain relief; symptoms returned to baseline",
        dates: null
      }
    ],
    imaging_findings: {
      modality: "MRI (right shoulder)",
      key_findings:
        "Full-thickness supraspinatus tear, 2.1 cm AP, mild retraction; mild AC joint degenerative change"
    },
    requested_procedure: "Arthroscopic Rotator Cuff Repair",
    surgical_approach_if_mentioned: "Arthroscopic technique",
    denial_risk_flags: [
      {
        id: "flag-approach-detail",
        label: "Repair Technique Not Specified",
        severity: "medium",
        explanation: "Arthroscopic approach documented but lacks specific portal count or double-row vs. single-row repair technique detail. UHC may request operative specifics.",
        recommendation: "Document the planned repair construct (e.g., double-row suture anchor technique) and portal configuration in the operative plan.",
        anchorText: "Arthroscopic technique"
      },
      {
        id: "flag-symptom-duration",
        label: "Symptom Duration Imprecise",
        severity: "medium",
        explanation: "Symptom duration noted as 'several months'. Payers typically require a precise timeline (e.g., '4 months') to assess conservative treatment adequacy.",
        recommendation: "Document the exact onset date or duration in weeks or months from the patient's reported first symptoms.",
        anchorText: "several months duration"
      },
      {
        id: "flag-single-injection",
        label: "Only One Injection Documented",
        severity: "medium",
        explanation: "Only one subacromial injection documented. Some UHC plans require two failed injections before approving rotator cuff repair.",
        recommendation: "Retrieve any prior injection records or document that a second injection was contraindicated and explain why.",
        anchorText: "Subacromial Corticosteroid Injection"
      },
      {
        id: "flag-workers-comp",
        label: "Workers' Comp Status Undocumented",
        severity: "low",
        explanation: "Work-related injury noted but no workers' comp authorization status documented. This may require separate handling or a different payer pathway.",
        recommendation: "Clarify whether this claim is under workers' compensation or private insurance and document the authorization pathway accordingly.",
        anchorText: "lifting injury at work"
      }
    ],
    pa_strength: {
      diagnosis_codes: {
        score: 1,
        note: "Primary diagnosis of right rotator cuff tear (M75.121) is fully documented."
      },
      conservative_treatments_named: {
        score: 1,
        note: "PT, NSAIDs, and subacromial injection are all documented."
      },
      conservative_treatment_duration: {
        score: 1,
        note: "PT was completed for 6 weeks, satisfying minimum duration guidelines."
      },
      imaging_findings: {
        score: 1,
        note: "MRI confirming full-thickness supraspinatus tear is present."
      },
      functional_limitations: {
        score: 1,
        note: "Four functional limitations (lifting, grooming, sleep, grip) are documented."
      },
      surgical_approach: {
        score: 0,
        note: "Arthroscopic approach is mentioned but lacks specific portal or repair technique details.",
        anchorText: "Arthroscopic technique"
      },
      cpt_code_valid: {
        score: 1,
        note: "CPT 29827 is a recognized arthroscopic rotator cuff repair code."
      },
      symptom_duration: {
        score: 0,
        note: "Symptom duration noted as 'several months' — lacks precise measurable timeline.",
        anchorText: "several months duration"
      }
    },
    validation: {
      hard_blocks: [],
      soft_warnings: [
        {
          field: "surgical_approach",
          label: "Surgical Approach Detail",
          message:
            "Arthroscopic repair technique is not fully specified — document portal count and repair construct (e.g., double-row) to strengthen the submission."
        },
        {
          field: "symptom_duration",
          label: "Symptom Duration",
          message:
            "Symptom duration of 'several months' is imprecise — replace with an exact onset date or duration in weeks/months."
        }
      ]
    }
  }
};

// ─── Profile 3: Incomplete Lumbar Fusion — Eleanor Vance ─────────────────────
// Low PA Strength Score (≈ 4.5). Missing PT documentation, duration data, and
// advanced imaging. Hard blocks present. Heavy denial risk.
// Payer: Cigna | CPT: 22630
export const INCOMPLETE_LUMBAR_FUSION: GeneratePaResponse = {
  letter: `May 21, 2026

Cigna
Prior Authorization Department

Re: Prior Authorization Request — Lumbar Interbody Fusion (CPT 22630)
Patient: Eleanor Vance | DOB: 04/05/1966
Requesting Provider: Dr. Sarah Jenkins, MD — Spine & Joint Institute

Dear Prior Authorization Reviewer,

I am writing to request prior authorization for lumbar interbody fusion (CPT 22630) for my patient, Eleanor Vance (DOB: 04/05/1966). Ms. Vance presents with lumbar disc displacement at L4-L5 with progressive neurogenic claudication and significant functional impairment. The requested surgical intervention is medically necessary given the severity of her symptoms and the impact on her daily activities.

CLINICAL HISTORY AND PRESENTING COMPLAINT

Ms. Vance is a 60-year-old female with a history of low back pain and bilateral leg pain of approximately 6 months duration. She reports worsening low back pain rated 7/10 with radiation into both lower extremities, left worse than right, consistent with lumbar nerve root compression. Symptoms have progressed significantly over the past several weeks with increasing neurological involvement.

DIAGNOSIS

Primary diagnosis:
  • M51.26 — Intervertebral disc displacement, lumbar region

Imaging: Lumbar spine X-rays demonstrate L4-L5 disc space narrowing with moderate degenerative changes. Foraminal stenosis is suspected on clinical grounds.

FUNCTIONAL LIMITATIONS

Ms. Vance's lumbar disc disease has resulted in the following documented functional limitations:

  1. Unable to walk more than one city block without severe bilateral leg pain — severely limiting community mobility.
  2. Cannot sit for more than 20 minutes without increasing low back and leg pain — prevents sustained work activities.
  3. Cannot perform bending, lifting, or prolonged standing — limiting ability to perform household and occupational tasks.

REQUESTED PROCEDURE

Procedure: Lumbar Interbody Fusion
CPT Code: 22630
Surgical Approach: Posterior lumbar interbody fusion (PLIF) at L4-L5
Facility: Spine & Joint Institute

MEDICAL NECESSITY SUMMARY

  • Confirmed lumbar disc displacement at L4-L5 with neurogenic claudication
  • Progressive symptoms over 6 months with significant functional impairment
  • Documented limitations affecting mobility and daily activities
  • Surgical fusion indicated to stabilize the affected segment and relieve neural compression

I respectfully request approval for CPT 22630 — Lumbar Interbody Fusion for Ms. Eleanor Vance.

Sincerely,

Dr. Sarah Jenkins, MD
Spine & Joint Institute`,

  extracted: {
    patient_name: "Eleanor Vance",
    date_of_birth: "04/05/1966",
    diagnosis_codes: ["M51.26"],
    primary_complaint: "Low back pain with bilateral leg radiation, left worse than right",
    symptom_duration: "Approximately 6 months",
    functional_limitations: [
      "Unable to walk more than one city block without severe bilateral leg pain",
      "Cannot sit for more than 20 minutes without increasing pain",
      "Cannot perform bending, lifting, or prolonged standing"
    ],
    objective_measurements: [],
    conservative_treatments_attempted: [],
    imaging_findings: {
      modality: "X-ray (lumbar spine)",
      key_findings:
        "L4-L5 disc space narrowing; moderate degenerative changes; foraminal stenosis suspected clinically"
    },
    requested_procedure: "Lumbar Interbody Fusion",
    surgical_approach_if_mentioned: "Posterior lumbar interbody fusion (PLIF) at L4-L5",
    denial_risk_flags: [
      {
        id: "flag-no-pt",
        label: "No Physical Therapy Documented",
        severity: "high",
        explanation: "No physical therapy documented. Cigna requires at least 6 weeks of structured PT before approving lumbar fusion in non-emergent cases.",
        recommendation: "Initiate and document a structured PT program of at least 6 weeks, then resubmit with PT records and discharge summary.",
        anchorText: "MEDICAL NECESSITY SUMMARY"
      },
      {
        id: "flag-no-conservative-care",
        label: "Conservative Care Pathway Absent",
        severity: "high",
        explanation: "No chiropractic, pain management, or epidural steroid injection documented. The conservative care pathway is completely absent from the record.",
        recommendation: "Document all prior conservative care attempts or initiate a multi-modal conservative care program before resubmission.",
        anchorText: "MEDICAL NECESSITY SUMMARY"
      },
      {
        id: "flag-no-mri",
        label: "No MRI or CT to Confirm Compression",
        severity: "high",
        explanation: "MRI or CT not documented. X-ray findings alone are insufficient to confirm disc herniation or nerve root compression for Cigna fusion criteria.",
        recommendation: "Order and obtain MRI or CT of the lumbar spine and include the radiology report with the prior auth submission.",
        anchorText: "Imaging: Lumbar spine X-rays"
      },
      {
        id: "flag-no-neuro-exam",
        label: "Neurological Examination Not Documented",
        severity: "high",
        explanation: "No neurological examination findings documented. Motor deficit or reflex changes are typically required to support fusion authorization.",
        recommendation: "Document a formal neurological examination including motor strength grading, deep tendon reflexes, and sensory testing.",
        anchorText: "neurogenic claudication"
      },
      {
        id: "flag-duration-no-treatment",
        label: "Duration Without Treatment History",
        severity: "high",
        explanation: "Symptom duration of 6 months without conservative treatment is insufficient. Payers require documented failure of treatment, not just duration.",
        recommendation: "Provide records of conservative treatment attempts or document a clinical reason why conservative care was contraindicated.",
        anchorText: "approximately 6 months"
      },
      {
        id: "flag-suspected-stenosis",
        label: "Foraminal Stenosis Unconfirmed",
        severity: "high",
        explanation: "Foraminal stenosis is 'suspected on clinical grounds' rather than confirmed on advanced imaging. This language will likely trigger automatic denial.",
        recommendation: "Replace speculative language with confirmed imaging findings. Obtain MRI to confirm or rule out foraminal stenosis before submission.",
        anchorText: "Foraminal stenosis is suspected"
      }
    ],
    pa_strength: {
      diagnosis_codes: {
        score: 1,
        note: "Diagnosis of lumbar disc displacement (M51.26) is documented."
      },
      conservative_treatments_named: {
        score: 0,
        note: "No conservative treatments (PT, chiropractic, injections) are documented in the record.",
        anchorText: "MEDICAL NECESSITY SUMMARY"
      },
      conservative_treatment_duration: {
        score: 0,
        note: "Duration of conservative treatments is completely absent — no treatment was documented.",
        anchorText: "MEDICAL NECESSITY SUMMARY"
      },
      imaging_findings: {
        score: 0,
        note: "Only X-ray findings are present; MRI or CT required to confirm disc herniation and nerve compression for fusion authorization.",
        anchorText: "Imaging: Lumbar spine X-rays"
      },
      functional_limitations: {
        score: 1,
        note: "Three specific functional limitations (walking, sitting, bending) are documented."
      },
      surgical_approach: {
        score: 1,
        note: "PLIF approach at L4-L5 is clearly specified."
      },
      cpt_code_valid: {
        score: 1,
        note: "CPT 22630 is a valid lumbar interbody fusion surgical code."
      },
      symptom_duration: {
        score: 0,
        note: "6-month symptom duration without documented conservative therapy does not satisfy Cigna criteria.",
        anchorText: "approximately 6 months"
      }
    },
    validation: {
      hard_blocks: [
        {
          field: "conservative_treatments_named",
          label: "Conservative Treatment Documentation",
          message:
            "No physical therapy, chiropractic, or injection therapy is documented. Cigna requires documented failure of at least 6 weeks of structured conservative care before approving lumbar fusion."
        },
        {
          field: "imaging_findings",
          label: "Advanced Imaging Required",
          message:
            "MRI or CT of the lumbar spine is required to confirm disc herniation, nerve root compression, and degree of foraminal stenosis. X-ray alone does not meet Cigna's fusion authorization criteria."
        }
      ],
      soft_warnings: [
        {
          field: "symptom_duration",
          label: "Symptom Duration vs. Treatment History",
          message:
            "6 months of symptoms without any documented conservative treatment creates a significant gap in the medical necessity narrative."
        },
        {
          field: "functional_limitations",
          label: "Neurological Documentation",
          message:
            "No neurological examination findings (motor deficits, reflex changes, sensory loss) are documented to support neurogenic claudication diagnosis."
        }
      ]
    }
  }
};
