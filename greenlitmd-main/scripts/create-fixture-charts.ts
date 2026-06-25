/**
 * create-fixture-charts.ts
 *
 * Generates the three synthetic DOCX fixture charts used by eval-pipeline.ts.
 * Run once (or whenever chart content needs to change):
 *   npx tsx scripts/create-fixture-charts.ts
 */

import * as path from "path";
import * as fs from "fs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const OUT_DIR = path.join(__dirname, "../lib/sample-charts");

function makeDoc(lines: string[]): Document {
  return new Document({
    sections: [
      {
        children: lines.map(
          (line) =>
            new Paragraph({
              children: [new TextRun(line)],
            })
        ),
      },
    ],
  });
}

async function write(filename: string, lines: string[]) {
  const doc = makeDoc(lines);
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT_DIR, filename), buf);
  console.log("  wrote", filename);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── Chart 1: Kim Rachel — Rotator Cuff Repair CPT 29827 — CLEAN ─────────
  await write("chart-kim-rachel-rotator-cuff-cpt29827-CLEAN.docx", [
    "PATIENT CHART — ORTHOPEDIC PRIOR AUTHORIZATION",
    "",
    "Patient Name: Kim, Rachel",
    "Date of Birth: 04/15/1975",
    "MRN: 7723910",
    "Date of Visit: 02/10/2025",
    "Insurance: Blue Cross Blue Shield",
    "",
    "Attending Surgeon: Dr. Michael Torres, MD",
    "Practice: Summit Orthopedic Group",
    "",
    "Chief Complaint:",
    "Ms. Kim presents with right shoulder pain and weakness that began following a work-related lifting",
    "injury in June 2024. She reports pain rated 7/10 at rest and 9/10 with overhead activity.",
    "She has been unable to perform overhead work duties and has difficulty sleeping on the right side.",
    "",
    "Diagnosis:",
    "Full-thickness rotator cuff tear, right shoulder (M75.121)",
    "Shoulder impingement syndrome (M75.111)",
    "",
    "Functional Limitations:",
    "- Unable to lift objects above shoulder height",
    "- Cannot perform overhead reaching for daily tasks",
    "- Disturbed sleep due to shoulder pain",
    "- Unable to return to work duties requiring arm elevation",
    "",
    "Objective Measurements:",
    "Active forward flexion: 95 degrees (limited by pain)",
    "Active abduction: 80 degrees",
    "Internal rotation: 40 degrees",
    "External rotation: 55 degrees",
    "Strength testing: 3/5 supraspinatus on empty can test",
    "ASES Score: 35.2/100",
    "",
    "Imaging:",
    "MRI Right Shoulder (01/22/2025): Full-thickness supraspinatus tear measuring 2.1 cm with",
    "retraction to the musculotendinous junction. Moderate subacromial bursitis. Intact subscapularis.",
    "X-ray Right Shoulder (01/22/2025): AC joint arthrosis Grade II. No calcific deposits.",
    "No significant glenohumeral arthrosis.",
    "",
    "Conservative Treatments Attempted:",
    "1. Physical Therapy: 8 weeks (September–October 2024). Focused on rotator cuff strengthening",
    "   and scapular stabilization. Outcome: minimal improvement, pain persisted with overhead activity.",
    "2. Corticosteroid Injection — Kenalog 40mg: administered 11/05/2024.",
    "   Outcome: 2 weeks of partial relief, then return to baseline symptoms.",
    "3. NSAIDs — Meloxicam 15mg daily: 3 months (July–October 2024).",
    "   Outcome: inadequate pain control, GI intolerance developed.",
    "",
    "ASA Classification: ASA II",
    "BMI: 27.4",
    "",
    "Requested Procedure:",
    "Arthroscopic rotator cuff repair, right shoulder — CPT 29827",
    "Surgical approach: Arthroscopic with mini-open rotator cuff repair",
    "",
    "Medical Necessity Statement:",
    "Conservative management for 8 months has failed to provide durable relief. Structural imaging",
    "confirms the diagnosis and surgical candidacy. Surgical intervention is indicated.",
  ]);

  // ── Chart 2: Webb Marcus — TKA CPT 27447 — MESSY ───────────────────────
  await write("chart-webb-marcus-tka-cpt27447-MESSY.docx", [
    "Pre-Operative Evaluation Form",
    "Lakeside Orthopedic Surgery Center",
    "",
    "Pt: Webb, Marcus D   DOB: 11/03/1958  Insurance: Aetna PPO  Date: 03/04/2025",
    "OR: Dr. Sandra Reyes MD  Dx: Primary OA bilateral knees worse on right",
    "",
    "HPI: 66yo male c/o bilateral knee pain x 3+ years. Right > left. Denies trauma.",
    "Has tried 'everything' per pt. Cannot walk more than 1 block. Cannot use stairs",
    "without hand rail. Works as retired postal worker, now volunteer coach — pain",
    "limits ability to demonstrate drills.",
    "",
    "PMH: HTN, T2DM (A1c 7.1), OSA on CPAP",
    "Meds: Metformin, Lisinopril, Atorvastatin",
    "Allergies: PCN",
    "",
    "ICD-10: M17.11 (primary OA right knee), M17.12 (primary OA left knee)",
    "",
    "Pain: 8/10 with activity, 4/10 at rest.",
    "ROM Right Knee: Flexion 95 degrees, extension -5 degrees (flex contracture)",
    "KOOS Score Right: 28/100",
    "",
    "X-Ray Right Knee 02/15/2025: Severe tricompartmental osteoarthritis with bone-on-bone",
    "medial compartment involvement, Kellgren-Lawrence Grade IV. Varus deformity 8 degrees.",
    "X-Ray Left Knee 02/15/2025: Moderate OA, KL Grade III. Less severe than right.",
    "",
    "Treatments:",
    "- PT at Lakeside Rehab for 6 weeks — did not help right knee",
    "- Cortisone shots x2 in right knee (approx 2023, exact date unclear) — helped maybe",
    "  2-3 weeks each time",
    "- Synvisc-One hyaluronic acid injection right knee 06/2024 — minimal benefit",
    "- Tylenol + ibuprofen OTC, ongoing, not effective for weeks now",
    "",
    "ASA: ASA III (HTN, DM, OSA)",
    "BMI: 34.2",
    "",
    "Plan: Right TKA. Patient counseled on risks. Surgical consent obtained.",
    "CPT 27447 — total knee arthroplasty right knee",
    "Anterior approach. Will perform standard primary TKA.",
    "",
    "Note: Bilateral knee OA documented but only requesting right side at this time.",
    "Anesthesia: General vs spinal per anesthesia team assessment.",
  ]);

  // ── Chart 3: Vance Sandra — THA CPT 27130 — INCOMPLETE ─────────────────
  await write("chart-vance-sandra-tha-cpt27130-INCOMPLETE.docx", [
    "REFERRAL SUMMARY — ORTHOPEDIC CONSULTATION",
    "Riverside Medical Associates",
    "",
    "Patient: Vance, Sandra M.",
    "Date of Birth: 07/28/1962",
    "Date of Consultation: 01/30/2025",
    "Referred By: Dr. Linda Park, PCP",
    "Insurance: United Healthcare",
    "",
    "Reason for Referral: Worsening left hip pain, evaluate for surgical intervention.",
    "",
    "Presenting Complaint:",
    "Ms. Vance is a 62-year-old female with progressive left hip pain over the past several months.",
    "She describes difficulty walking and getting in/out of her car.",
    "",
    "Assessment:",
    "Left hip osteoarthritis. Patient is a surgical candidate pending imaging review.",
    "ICD-10 code: M16.12",
    "",
    "Functional Limitations:",
    "- Difficulty ambulating distances greater than 200 feet",
    "- Unable to perform prolonged standing",
    "",
    "Conservative Care:",
    "Patient reports trying over-the-counter pain medication at home.",
    "No formal physical therapy documented in referral.",
    "",
    "Imaging:",
    "X-ray left hip was ordered at today's visit — results pending.",
    "MRI not yet ordered.",
    "",
    "Provider: Dr. James Holloway, MD",
    "Practice: Riverside Orthopedic Associates",
    "",
    "Requested Procedure: Left total hip arthroplasty — CPT 27130",
    "",
    "Note: Chart is preliminary referral documentation. Full pre-op workup pending.",
    "PA submission requested in advance of imaging completion.",
  ]);

  console.log("\nAll fixture charts written to lib/sample-charts/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
