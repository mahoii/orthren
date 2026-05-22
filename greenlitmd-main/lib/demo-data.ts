import type { GeneratePaResponse } from "@/lib/types";

export const DEMO_PA_DATA: GeneratePaResponse = {
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
      "Physical therapy documented for only 4 weeks \u2014 BCBS commercial PPO typically requires 6\u201312 weeks before approving TKA",
      "Corticosteroid injection dates not documented for right knee \u2014 unclear if injections were sequential or concurrent",
      "Weight loss counseling outcome not recorded \u2014 payers may question whether obesity was adequately addressed pre-operatively",
      "No MRI on file \u2014 some payers require advanced imaging to confirm end-stage OA diagnosis before approving bilateral TKA"
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
        note: "PT duration only 4 weeks \u2014 below typical payer threshold of 6\u201312 weeks."
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
