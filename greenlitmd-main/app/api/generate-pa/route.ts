import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { sanitizeLetterPlaceholders } from "@/lib/letter-placeholders";
import type { ExtractedChartData, PaStrength, PaStrengthFactor } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxUploadSizeBytes = 10 * 1024 * 1024;
const anthropicModel = "claude-sonnet-4-6";

type RequestDetails = {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName: string;
};

const extractionSystemPrompt =
  `You are a medical records analyst specializing in orthopedic prior authorization. Extract the following from the provided patient chart text and return ONLY valid JSON. Include these chart data keys: patient_name, date_of_birth, diagnosis_codes (array), primary_complaint, symptom_duration, functional_limitations (array of specific limitations mentioned), objective_measurements (array), conservative_treatments_attempted (array), imaging_findings (object with modality and key findings), requested_procedure, surgical_approach_if_mentioned, denial_risk_flags (array of strings describing specific, actionable missing or weak elements that could cause denial). If information is not found, use null for strings and empty arrays for arrays, except conservative_treatments_attempted must follow the instruction below. After extracting all fields, also return a 'validation' object with hard_blocks and soft_warnings arrays. For hard_blocks, include any of these fields that are missing or null: patient_name, diagnosis_codes (if empty), requested_procedure. For soft_warnings, include any of these fields that are missing or null: surgical_approach_if_mentioned, imaging_findings, conservative_treatments_attempted (if empty), functional_limitations (if empty). Each block/warning object must have: {field, label, message}. Return the complete JSON including chart data and validation object.

For objective_measurements, extract ALL quantified clinical measurements documented in the chart. This includes: range of motion values (e.g. "Knee flexion limited to 85 degrees"), pain scale scores (e.g. "Pain rated 8/10 at rest"), functional outcome scores (e.g. "KOOS score 32/100", "Oxford Knee Score 18/48", "VAS 7.5"), strength measurements, walking distance or tolerance, and any other numeric clinical findings. Return each as a plain English string (e.g. "ROM: knee flexion 85°, extension deficit 10°"). Return an empty array if no quantified measurements are documented.

Extract ALL conservative treatments attempted by the patient before surgery. For each treatment found, you MUST provide the treatment_name — never return null or unknown for this field. Search the chart for any mention of: physical therapy (PT), occupational therapy (OT), NSAIDs (ibuprofen, naproxen, celecoxib, meloxicam), corticosteroid injections (cortisone, kenalog, depomedrol), hyaluronic acid injections (synvisc, hyalgan, euflexxa), bracing or orthotics, activity modification, weight loss programs, chiropractic care, acupuncture, topical medications, opioid or non-opioid analgesics, or any other conservative intervention mentioned.
For each treatment found return an object with exactly these fields:

treatment_name: the specific name of the treatment (e.g. Physical Therapy, Ibuprofen/NSAID, Corticosteroid Injection — Kenalog, Hyaluronic Acid Injection — Synvisc). Never return null. If ambiguous, make the most reasonable clinical inference from context.
duration: how long the treatment was attempted (e.g. 6 months, 8 weeks). If explicit duration is not stated BUT dates are provided, calculate the duration based on the dates (e.g., if injections are dated January 2024 and May 2024, write "5 months between injections" or "ongoing from January to May 2024"). Return null only if neither duration nor dates are mentioned.
outcome: what happened (e.g. failed, minimal improvement, GI intolerance developed, temporary relief only, no improvement). Use the exact language from the chart where possible.
dates: any specific dates mentioned for this treatment. Return null if not found.

Return a minimum of 1 treatment object. If no treatments are found at all, return a single object with treatment_name: Conservative treatment history not documented, duration: null, outcome: null, dates: null.

For denial_risk_flags, provide SPECIFIC, ACTIONABLE flags based on actual gaps in the documentation. Examples of GOOD flags: "Only 4 weeks of PT documented before requesting surgery - payers typically require 6-12 weeks", "No imaging provided to confirm diagnosis despite reported pain", "Conservative care dates incomplete - unclear if treatments were concurrent or sequential", "Single corticosteroid injection on [date] with no documented follow-up imaging or repeat treatment". If fewer than 3 distinct conservative treatment modalities are documented, include this flag: 'Only [N] conservative treatment(s) documented — most payers require 3 or more distinct modalities (e.g., PT, NSAIDs, and injection) before approving elective joint replacement. Additional conservative care documentation should be retrieved or treatment initiated before submission.' Examples of BAD flags (too generic, avoid): "insufficient documentation of medical necessity", "missing pre-operative medical evaluation", "inadequate conservative care". Focus on: specific treatment durations, missing imaging modalities, unclear timelines, single attempts at treatment with no follow-up, gaps between dates that suggest inadequate trial periods.

CONSERVATIVE CARE COMPLETENESS CHECK: After extracting all treatments, evaluate whether the documented conservative care meets minimum payer standards. If fewer than 3 distinct treatment modalities are documented OR if any treatment has no documented duration OR if no physical therapy is documented for a surgical procedure request, add a denial_risk_flag with this exact pattern: "Insufficient conservative care: only [N] treatment(s) documented. Payers for CPT [code] typically require documented failure of physical therapy (minimum 6 weeks), NSAIDs, and at least one injection before approving surgical intervention." This flag is mandatory when conservative_treatments_attempted contains fewer than 3 entries with complete duration data.

PENDING IMAGING FLAG: If imaging_findings contains language indicating imaging is scheduled, pending, or not yet completed, add a denial_risk_flag: "Imaging pending at time of submission — payers require completed imaging results before authorizing surgical procedures. Do not submit until imaging is available."

After extracting all fields, evaluate the chart against these 8 factors and return a score object called pa_strength inside the JSON. For each factor, return a score of 0 or 1 (0 = missing or insufficient, 1 = present and adequate), and a one-sentence plain English note explaining the score. The pa_strength object must include: diagnosis_codes, conservative_treatments_named, conservative_treatment_duration, imaging_findings, functional_limitations, surgical_approach, cpt_code_valid, and symptom_duration. Each must be an object with score (0 or 1) and note (string).

Weight the overall score on the frontend as: diagnosis_codes 10%, conservative_treatments_named 20%, conservative_treatment_duration 10%, imaging_findings 15%, functional_limitations 15%, surgical_approach 10%, cpt_code_valid 10%, symptom_duration 10%.

Return ONLY valid JSON. Do not wrap in code fences or backticks. Start with { and end with }.`;

const letterSystemPrompt = `RULE 1 — ABSOLUTE: You are writing ONLY the letter body. All error detection, denial risk flagging, and documentation gap analysis has already been completed by a separate system upstream. You have NO responsibility to flag errors, warn the provider, or note deficiencies anywhere in this letter. Do not open with warnings. Do not embed advisory blocks. Do not add inline notes. Do not use phrases like 'Note to provider', 'Physician review required', 'Physician attestation required', 'CRITICAL', or any variant. If you include any advisory content anywhere in the letter, the output is invalid. This rule applies unconditionally regardless of data quality, CPT mismatches, missing fields, payer discrepancies, or any other anomaly detected in the source data. If errors are present in the request, write the letter using the best available data and let the upstream error detection system handle flagging. The letter must always be a clean clinical document.

RULE 2 — ABSOLUTE: Write the letter using only what is confirmed in the source data. For any missing field, either omit it entirely or write around it using confirmed information. Never insert placeholder text, bracketed instructions, or editorial commentary.

RULE 3 — ABSOLUTE: The letter date is provided to you in the prompt as 'Letter date: [date]'. Use this exact date string in the letter header. Do not substitute 'Physician to insert date' or any placeholder.

RULE 4: Complete every sentence and every paragraph. If you are running long, shorten earlier sections rather than truncating mid-sentence. The letter must end with a complete signature block.

RULE 5: When referencing symptom duration or onset, always use the most specific date or timeframe available in the source data. If a specific date is present, use it (e.g., 'since October 2024'). If only a relative reference exists (e.g., 'around the holidays'), convert it to the nearest calendar anchor using the chart visit date as reference. Never write 'approximately around' — use either a specific date or a clean duration string (e.g., 'approximately five months prior to presentation').

CRITICAL RULE — CONSERVATIVE CARE LANGUAGE: You are FORBIDDEN from using the phrase "conservative treatment modalities have been exhausted" or any equivalent claim unless the extracted data contains AT LEAST 3 distinct conservative treatments, each with a documented duration of at least 4 weeks OR explicit documentation of treatment failure. If fewer than 3 treatments are present, you MUST instead write: "Conservative management to date has included [list treatments]. Additional conservative measures including formal physical therapy and interventional pain management have been recommended prior to surgical intervention." Never overstate the completeness of conservative care relative to the source data.

RULE 7: When the source data contains any of the following objective measurements, they MUST be included in the clinical presentation paragraph: range of motion values (degrees), pain scale scores (VAS, NRS), functional assessment scores (HOOS, WOMAC, KOOS, Harris Hip Score, Oxford Knee Score), gait analysis findings, or strength testing results. Present these as specific values: 'demonstrating restricted internal rotation to 15 degrees' not 'demonstrating restricted internal rotation'. If these measurements are absent from source data, do not fabricate them. BMI is always mandatory when present in source data. When BMI is present, include it in the opening clinical presentation paragraph using this format: 'Ms./Mr. [Name] carries a documented BMI of [value], consistent with Class [I/II/III] obesity, which represents an independent contributor to accelerated articular cartilage degeneration and elevated mechanical joint loading.' For Class III obesity (BMI ≥40), also include in the conservative care section if weight loss counseling is documented: 'Weight management counseling has been initiated as part of surgical optimization.'

CRITICAL RULE — ASA CLASSIFICATION: If asa_classification is present in the structured data and is not null, you MUST include this exact sentence in the surgical plan paragraph: "Pre-operative evaluation has classified this patient as ASA [X], confirming surgical candidacy." Omitting ASA classification when it is present in the source data is a failure condition.

CRITICAL RULE — PENDING IMAGING: If imaging_findings indicates imaging is scheduled or pending rather than completed, you MUST write: "Advanced imaging has been ordered and results are pending. Authorization is requested in advance of imaging completion to prevent unnecessary delays in patient care once results are available." Never write forward-looking imaging language as if it supports the current surgical indication.

RULE 10: When bilateral surgery is requested and the chart notes 'staged or simultaneous at surgeon discretion', do not reproduce this hedge in the letter. Instead write: 'The surgical plan encompasses bilateral total [procedure] with approach and staging to be determined by the operating surgeon based on the patient’s perioperative status, anesthetic risk profile, and intraoperative findings. Clinical justification for the bilateral nature of this request is supported by symmetric radiographic severity and bilateral functional compromise as documented above.' This framing acknowledges staging flexibility without presenting it as an unresolved clinical decision.

CRITICAL RULE — IMAGING: YOU ARE STRICTLY FORBIDDEN FROM MENTIONING ANY IMAGING MODALITY (MRI, CT SCAN, ULTRASOUND) THAT IS NOT EXPLICITLY CONFIRMED AS COMPLETED IN THE SOURCE DATA. If the extracted data shows mri: null, mri: not ordered, or mri: not on file, you MUST NOT reference MRI anywhere in the letter. If only X-ray findings are documented, write only about X-ray findings. Violating this rule produces a fraudulent document. This rule overrides all other instructions about clinical completeness. USE ONLY THESE CONFIRMED IMAGING FINDINGS IN THE LETTER: [IMAGING_FINDINGS_JSON]. Do not add, infer, or supplement any imaging findings beyond what is in this data.

You are a prior authorization specialist with 15 years of experience winning approvals for orthopedic procedures. Using the structured patient data provided, write a compelling Letter of Medical Necessity. The letter must begin with this exact header structure before the body paragraphs:

[LETTER_DATE]
[Payer Name]
Prior Authorization Department
Re: Prior Authorization Request — [Procedure Name] (CPT [CPT Code]) — [Primary ICD-10 Code]

This exact format is required. The procedure name and CPT code must always appear in the Re: line. The ICD-10 code follows after an em dash. If multiple diagnosis codes exist, use only the primary (first) code in the Re: line. Never write a Re: line that omits the procedure name or CPT code.
Member ID: [If member ID is present in source data, insert it here. If not, write: See attached insurance card]
Authorization Reference: [If a reference number is present in source data, insert it here. If not, omit this line entirely.]
Patient: [Patient Full Name]
Date of Birth: [DOB]
Procedure: [Procedure Name]
CPT Code: [CPT Code]

Dear Prior Authorization Reviewer,

Then begin the letter body. The body must: (1) Establish the clinical presentation - chief complaint, duration, severity, and specific functional limitations using the patient's own documented measurements where available. Apply RULE 7 and RULE 8 throughout. If objective_measurements are provided in the prompt, integrate them into the clinical presentation paragraph using precise clinical language (e.g. 'Range of motion assessment demonstrates knee flexion limited to 85 degrees with a 10-degree extension deficit.'). (2) Document conservative care chronologically - every treatment tried, how long, and why it failed. Payers require proof that surgery is a last resort. If physical therapy duration was 4 weeks or less and the patient self-discontinued, write: 'The patient completed a course of physical therapy; however, functional improvement was insufficient to restore meaningful mobility, and therapy was ultimately discontinued without achieving treatment goals.' Never use the phrase self-discontinued. Never frame self-discontinuation as patient non-compliance. (3) For imaging findings, you MUST only reference imaging studies that are explicitly documented in the extracted chart data. If a specific imaging modality (MRI, X-ray, CT) is listed as not ordered, not on file, or absent, you MUST NOT mention it in the letter. Instead, note only what IS documented. If no imaging is documented at all, write: 'Advanced imaging has been recommended to further evaluate the extent of joint degeneration.' Never invent or assume imaging that is not confirmed in the source data. When writing the imaging paragraph, use the exact findings from the extracted imaging_findings field. If Kellgren-Lawrence grading is present, write: 'Weight-bearing radiographs of the bilateral knees demonstrate Kellgren-Lawrence Grade [X] changes bilaterally, with [specific findings from chart].' Use the verbatim clinical values — never generalize or substitute. Always use the actual grading values and findings from the chart. (4) State the specific procedure with anatomical detail - laterality, approach, implants if applicable. Apply RULE 9 for ASA classification and RULE 10 for bilateral staging language. (5) Close with a statement of medical necessity referencing the patient's inability to maintain activities of daily living. Apply RULE 6 to this closing paragraph.

For the Member ID header line: insert the member ID if present in source data; otherwise write 'See attached insurance card'. For the Authorization Reference line: include it only if a reference number is present in source data; omit the line entirely if not. Never include Claim Number or any other administrative field not present in source data. If a field does not exist in the extracted chart data, omit it entirely from the header block.

CRITICAL RULE — MISSING INFORMATION: If source data is insufficient for a specific field, either omit that detail entirely from the narrative or note it once at the end of the relevant paragraph using this exact phrase: "Chart review is recommended to confirm this detail prior to submission." Never use this phrase more than once per letter. Never use square brackets.

Never use the phrase 'not documented', 'not on file', 'not recorded', 'are not recorded', 'is not recorded', 'duration and outcome are not', or 'exact duration and follow-up are not' in the generated letter. If information is missing for a specific treatment or finding, either omit that detail entirely from the narrative or use clinical language such as 'clinical response was noted' or 'treatment was discontinued.' The letter must read as a polished clinical document, not a data extraction report. The letter must end with exactly one signature block in this exact format: 'Sincerely,' on one line, then '[Provider Name], MD' on the next line, then the practice name on the next line ONLY if a non-empty practice name was provided in the request details. If practice name is empty or was not provided, omit the practice name line entirely. Never write 'Orthopedic Practice' unless that was explicitly provided as the practice name. Never repeat the signature block. Write in formal clinical language. Do not use bullet points. CRITICAL: Never invent, assume, or fabricate a practice name, clinic name, or institution name.`;

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured. Add it before generating a packet." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const chart = formData.get("chart");
    const cptCode = stringField(formData.get("cptCode"));
    const payerName = stringField(formData.get("payerName"));
    const providerName = stringField(formData.get("providerName"));
    const practiceName = stringField(formData.get("practiceName"));

    if (!(chart instanceof File)) {
      return NextResponse.json({ error: "Upload a chart file before generating the packet." }, { status: 400 });
    }

    if (chart.size > maxUploadSizeBytes) {
      return NextResponse.json({ error: "File too large. Please upload a file under 10MB." }, { status: 400 });
    }

    if (!cptCode || !payerName || !providerName) {
      return NextResponse.json({ error: "CPT code, payer name, and provider name are required." }, { status: 400 });
    }

    const chartText = await extractChartText(chart);
    const requestDetails = { cptCode, payerName, providerName, practiceName };
    const extracted = await extractChartData(chartText, requestDetails);
    const letter = await generateLetter(extracted, requestDetails);

    return NextResponse.json({ extracted, letter });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate the PA packet.";
    const status = message.includes("PDF") || message.includes("chart") ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function extractPdfText(chart: File) {
  if (chart.type !== "application/pdf" && !chart.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a valid PDF chart.");
  }

  try {
    const buffer = Buffer.from(await chart.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text = parsed.text.trim();

    if (!text) {
      throw new Error("The PDF did not contain readable chart text. Please upload a text-based PDF.");
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.message.includes("readable chart text")) {
      throw error;
    }

    throw new Error("We could not read this PDF. Please upload a clear, text-based patient chart PDF.");
  }
}

async function extractDocxText(chart: File) {
  const isDocx =
    chart.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    chart.name.toLowerCase().endsWith(".docx");

  if (!isDocx) {
    throw new Error("Only PDF and DOCX files are supported");
  }

  try {
    const buffer = Buffer.from(await chart.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch {
    throw new Error(
      "Could not read the DOCX file. Please ensure it is not password protected and try again."
    );
  }
}

async function extractChartText(chart: File) {
  const lowerName = chart.name.toLowerCase();
  const isPdf = chart.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isDocx =
    chart.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx");

  if (!isPdf && !isDocx) {
    throw new Error("Only PDF and DOCX files are supported");
  }

  const text = isPdf ? await extractPdfText(chart) : await extractDocxText(chart);

  if (text.length < 100) {
    throw new Error("The uploaded file appears to be empty or unreadable. Please try a different file.");
  }

  return text;
}

async function extractChartData(
  chartText: string,
  requestDetails: RequestDetails
): Promise<ExtractedChartData & { validation: any }> {
  // ── Section C: Catastrophic try/catch wraps the entire parsing phase ──────
  try {
    const content = await callAnthropicWithRetry({
      system: extractionSystemPrompt,
      prompt: `Request details:
CPT code: ${requestDetails.cptCode}
Insurance payer: ${requestDetails.payerName}
Requesting provider: ${requestDetails.providerName}
Practice name: ${requestDetails.practiceName}

Patient chart text:
${chartText}`,
      maxTokens: 3000,
      useStructuredOutput: true
    });

    const parsed = await parseJsonObject(content);
    return normalizeChartData(parsed, requestDetails, chartText);
  } catch (err) {
    // ── Section C: Catastrophic fallback — never crash the server ─────────
    console.error("[generate-pa] Catastrophic parse failure — returning safe fallback object:", err);
    return buildCatastrophicFallback(requestDetails);
  }
}

async function generateLetter(
  extracted: ExtractedChartData,
  requestDetails: RequestDetails
) {
  const { validation, pa_strength, ...chartDataOnly } = extracted as any;

  // Fix 3: Generate today's date programmatically
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Fix 7: Extract BMI and ASA from extracted data for injection
  const bmi = (chartDataOnly as any).bmi || null;
  const asaClassification = (chartDataOnly as any).asa_classification || null;

  // Build imaging findings JSON string for injection
  const imagingFindingsJson = JSON.stringify(extracted.imaging_findings || null);

  // Build the system prompt with injected values
  const systemPromptWithContext = letterSystemPrompt
    .replace("[LETTER_DATE]", today)
    .replace("[IMAGING_FINDINGS_JSON]", imagingFindingsJson);

  const objectiveMeasurementsStr = extracted.objective_measurements?.length
    ? `\nObjective measurements: ${extracted.objective_measurements.join("; ")}`
    : "";

  // Fix 3: Pass letter_date to prompt context
  let letter = await callAnthropicWithRetry({
    system: systemPromptWithContext,
    prompt: `Structured patient data:
${JSON.stringify(chartDataOnly, null, 2)}

Request details:
CPT code: ${requestDetails.cptCode}
Insurance payer: ${requestDetails.payerName}
Requesting provider: ${requestDetails.providerName}
Practice name: ${requestDetails.practiceName}

Letter date: ${today}
${bmi ? "Patient BMI: " + bmi : ""}
${asaClassification ? "ASA Classification: " + asaClassification : ""}${objectiveMeasurementsStr}`,
    maxTokens: 8000
  });

  // Fix 4: Remove duplicate signature blocks
  letter = removeDuplicateSignatureBlocks(letter);

  // Fix 5: Remove "not documented" language and sentences containing it
  letter = removeNotDocumentedLanguage(letter);

  return sanitizeLetterPlaceholders(letter, {
    patientName: extracted.patient_name,
    payerName: requestDetails.payerName,
    providerName: requestDetails.providerName,
    practiceName: requestDetails.practiceName,
    cptCode: requestDetails.cptCode,
    requestedProcedure: extracted.requested_procedure
  });
}

// Fix 4: Remove duplicate signature blocks
function removeDuplicateSignatureBlocks(letter: string) {
  const signaturePattern = /Sincerely,[\s\S]*?MD[\s\S]*?(?=Sincerely,|$)/gi;
  const matches = letter.match(signaturePattern);

  if (matches && matches.length > 1) {
    // Remove all signature blocks first
    letter = letter.replace(signaturePattern, "");
    // Add back only the last one
    letter = letter + "\n" + matches[matches.length - 1];
  }

  return letter;
}

// Fix 5: Remove "not documented" language and sentences containing it
function removeNotDocumentedLanguage(letter: string) {
  const phrases = [
    "not documented",
    "not well-documented",
    "not recorded",
    "not on file",
    "are not recorded",
    "is not recorded",
    "duration and outcome are not",
    "exact duration and follow-up are not"
  ];

  // First pass: replace phrases with placeholder
  phrases.forEach((phrase) => {
    letter = letter.replace(new RegExp(phrase, "gi"), "was not available for review");
  });

  // Second pass: remove entire sentences containing "was not available for review"
  // Match sentences that start with capital letter and end with period
  letter = letter.replace(/[^.!?]*was not available for review[^.!?]*[.!?]/gi, "");

  // Clean up any resulting double spaces or weird punctuation
  letter = letter.replace(/\s+/g, " ").replace(/\s+([.!?,])/g, "$1");

  return letter;
}

const chartExtractionSchema = {
  type: "object",
  properties: {
    patient_name: { type: ["string", "null"] },
    date_of_birth: { type: ["string", "null"] },
    diagnosis_codes: { type: "array", items: { type: "string" } },
    primary_complaint: { type: ["string", "null"] },
    symptom_duration: { type: ["string", "null"] },
    functional_limitations: { type: "array", items: { type: "string" } },
    objective_measurements: { type: "array", items: { type: "string" } },
    conservative_treatments_attempted: {
      type: "array",
      items: {
        type: "object",
        properties: {
          treatment: { type: ["string", "null"] },
          duration: { type: ["string", "null"] },
          outcome: { type: ["string", "null"] },
          dates: { type: ["string", "null"] }
        },
        required: ["treatment", "duration", "outcome", "dates"]
      }
    },
    imaging_findings: {
      type: ["object", "null"],
      properties: {
        modality: { type: ["string", "null"] },
        key_findings: { type: ["string", "null"] }
      }
    },
    requested_procedure: { type: ["string", "null"] },
    surgical_approach_if_mentioned: { type: ["string", "null"] },
    denial_risk_flags: { type: "array", items: { type: "string" } },
    pa_strength: {
      type: "object",
      properties: {
        diagnosis_codes: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        },
        conservative_treatments_named: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        },
        conservative_treatment_duration: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        },
        imaging_findings: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        },
        functional_limitations: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        },
        surgical_approach: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        },
        cpt_code_valid: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        },
        symptom_duration: {
          type: "object",
          properties: { score: { enum: [0, 1] }, note: { type: "string" } },
          required: ["score", "note"]
        }
      },
      required: ["diagnosis_codes", "conservative_treatments_named", "conservative_treatment_duration", "imaging_findings", "functional_limitations", "surgical_approach", "cpt_code_valid", "symptom_duration"]
    },
    validation: {
      type: "object",
      properties: {
        hard_blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              label: { type: "string" },
              message: { type: "string" }
            },
            required: ["field", "label", "message"]
          }
        },
        soft_warnings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              label: { type: "string" },
              message: { type: "string" }
            },
            required: ["field", "label", "message"]
          }
        }
      },
      required: ["hard_blocks", "soft_warnings"]
    }
  },
  required: ["patient_name", "date_of_birth", "diagnosis_codes", "primary_complaint", "symptom_duration", "functional_limitations", "objective_measurements", "conservative_treatments_attempted", "imaging_findings", "requested_procedure", "surgical_approach_if_mentioned", "denial_risk_flags", "pa_strength", "validation"]
};

async function callAnthropic({
  system,
  prompt,
  maxTokens = 2000,
  useStructuredOutput = false
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
  useStructuredOutput?: boolean;
}) {
  // Only allow valid Anthropic parameters
  const requestBody: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: system,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    ...(useStructuredOutput ? { temperature: 0 } : {})
  };

  // No extra parameters allowed

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API request failed. ${text}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Anthropic did not return a usable response.");
  }

  return text;
}

// ── Section A: Defensive regex boundary parser ────────────────────────────
async function parseJsonObject(content: string): Promise<Record<string, unknown>> {
  // Step 1: Strip code-fence wrappers the LLM sometimes emits
  let extractionText = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // Step 2: Use regex to find the outermost JSON object boundaries
  const jsonMatch = extractionText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    extractionText = jsonMatch[0];
  } else {
    // Fallback: trim and try the raw text as-is
    extractionText = extractionText.trim();
  }

  // Step 3: Remove illegal control characters that break JSON.parse
  extractionText = extractionText.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ");

  try {
    return JSON.parse(extractionText) as Record<string, unknown>;
  } catch (err) {
    console.error("[generate-pa] JSON parse error. Raw content (first 600 chars):");
    console.error(content?.substring(0, 600));
    throw new Error("Failed to parse extraction response: " + (err instanceof Error ? err.message : String(err)));
  }
}

function cleanJsonContent(content: string): string {
  return content
    .trim()
    .replace(/^[\s`]*(?:json)?[\s`]*/, "")
    .replace(/[\s`]*$/, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .trim();
}

// ── Section B: Strict structural normalization layer ─────────────────────
function normalizeChartData(
  data: Record<string, unknown>,
  requestDetails: RequestDetails,
  chartText: string
): ExtractedChartData & { validation: any } {

  // ── B1: Critical string fields — default to "Not Documented" when falsy ──
  const patientName = nullableString(data.patient_name);
  const primaryComplaint = nullableString(data.primary_complaint);
  const symptomDuration = nullableString(data.symptom_duration);
  const requestedProcedure = nullableString(data.requested_procedure);
  const surgicalApproach = nullableString(data.surgical_approach_if_mentioned);

  // ── B2: Numerical fields ─────────────────────────────────────────────────
  const bmi = safeNumeric(data.bmi);
  const asa_classification = safeAsaClassification(data.asa_classification);

  // ── B3: Flat arrays ──────────────────────────────────────────────────────
  const diagnosisCodes = stringArray(data.diagnosis_codes);
  const functionalLimitations = stringArray(data.functional_limitations);
  const denialRiskFlags = stringArray(data.denial_risk_flags);
  const objectiveMeasurements = stringArray(data.objective_measurements);

  // ── B4: Conservative treatments — coerce strings and ensure key safety ───
  const conservativeTreatments = normalizeConservativeTreatments(data.conservative_treatments_attempted);

  // ── B5: Nested imaging findings object ───────────────────────────────────
  const imagingFindings = normalizeImagingFindings(data.imaging_findings);

  // ── B6: Validation object (hard_blocks, soft_warnings) ───────────────────
  // We re-derive hard_blocks and soft_warnings from validated data rather than
  // trusting what the LLM returned, so the PA Strength Meter always reflects
  // the true state of normalized data.
  const hard_blocks: any[] = [];
  const soft_warnings: any[] = [];
  const chartPayer = findChartPayer(chartText);
  const chartSurgeon = findChartSurgeon(chartText);

  // Hard blocks
  if (!patientName) {
    hard_blocks.push({
      field: "patient_name",
      label: "Patient Name",
      message: "Patient identity is required for payer authorization and medical records verification."
    });
  }

  if (diagnosisCodes.length === 0) {
    hard_blocks.push({
      field: "diagnosis_codes",
      label: "Diagnosis Codes",
      message: "At least one ICD diagnosis code is required to establish medical necessity."
    });
  }

  if (!requestedProcedure) {
    hard_blocks.push({
      field: "requested_procedure",
      label: "Requested Procedure",
      message: "The specific procedure being requested must be clearly documented for payer review."
    });
  }

  // Soft warnings
  if (!surgicalApproach) {
    soft_warnings.push({
      field: "surgical_approach_if_mentioned",
      label: "Surgical Approach",
      message: "Anatomical approach details strengthen the surgical indication but can be inferred."
    });
  }

  if (!imagingFindings) {
    soft_warnings.push({
      field: "imaging_findings",
      label: "Imaging Findings",
      message: "Imaging results provide critical objective evidence but may not always be documented."
    });
  }

  if (conservativeTreatments.length === 0) {
    soft_warnings.push({
      field: "conservative_treatments_attempted",
      label: "Conservative Treatments",
      message: "Documented prior conservative care is key to showing surgery is a last resort."
    });
  }

  if (functionalLimitations.length === 0) {
    soft_warnings.push({
      field: "functional_limitations",
      label: "Functional Limitations",
      message: "Specific limitations demonstrate impact on activities of daily living."
    });
  }

  // Payer mismatch detection
  const formPayer = requestDetails.payerName?.toLowerCase().trim();
  const chartTextLower = chartText?.toLowerCase();
  if (formPayer && chartTextLower && !chartTextLower.includes(formPayer.split(" ")[0])) {
    soft_warnings.push({
      field: "payer_mismatch",
      label: "Payer Name Mismatch",
      message: `Payer entered (${requestDetails.payerName}) was not found in the chart. Verify this matches the patient's actual insurance before submitting.`
    });
  }

  if (chartSurgeon && !partialNameMatch(requestDetails.providerName, chartSurgeon)) {
    soft_warnings.push({
      field: "provider_mismatch",
      label: "Provider Name Mismatch",
      message: `The provider entered (${requestDetails.providerName}) differs from the surgeon documented in the chart (${chartSurgeon}). Please verify.`
    });
  }

  return {
    patient_name: patientName,
    date_of_birth: nullableString(data.date_of_birth),
    diagnosis_codes: diagnosisCodes,
    primary_complaint: primaryComplaint,
    symptom_duration: symptomDuration,
    functional_limitations: functionalLimitations,
    objective_measurements: objectiveMeasurements,
    conservative_treatments_attempted: conservativeTreatments,
    imaging_findings: imagingFindings,
    requested_procedure: requestedProcedure,
    surgical_approach_if_mentioned: surgicalApproach,
    denial_risk_flags: denialRiskFlags,
    pa_strength: normalizePaStrength(data.pa_strength),
    // Expose bmi and asa_classification for letter generation (they pass through as any)
    ...(bmi !== null ? { bmi } : {}),
    ...(asa_classification !== null ? { asa_classification } : {}),
    validation: { hard_blocks, soft_warnings }
  };
}

// ── Section B4: Conservative treatment normalization ───────────────────────
function normalizeConservativeTreatments(raw: unknown): Array<{
  treatment: string | null;
  duration: string | null;
  outcome: string | null;
  dates: string | null;
}> {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    // If the element is a flat string, coerce it into a structured object
    if (typeof item === "string" && item.trim()) {
      return {
        treatment: item.trim(),
        duration: "Unknown",
        outcome: "Failed",
        dates: "Not documented"
      };
    }

    // If the element is an object, ensure key safety with fallbacks
    if (isObject(item)) {
      const treatmentName = nullableString(
        item.treatment_name ?? item.treatment ?? item.name
      );
      return {
        treatment: treatmentName ?? "Unknown Treatment",
        duration: nullableString(item.duration) ?? "Unknown",
        outcome: nullableString(item.outcome) ?? "Failed",
        dates: nullableString(item.dates) ?? "Not documented"
      };
    }

    // Unrecognised element shape — return safe sentinel
    return {
      treatment: "Unknown Treatment",
      duration: "Unknown",
      outcome: "Failed",
      dates: "Not documented"
    };
  });
}

// ── Section B5: Imaging findings normalization ────────────────────────────
function normalizeImagingFindings(raw: unknown): { modality: string | null; key_findings: string | null } | null {
  if (!isObject(raw)) return null;

  const modality = nullableString(raw.modality);
  const key_findings = nullableString(raw.key_findings ?? raw.findings);

  // Return null when both keys are absent — preserves existing soft-warning logic
  if (!modality && !key_findings) return null;

  return { modality, key_findings };
}

// ── Section B2: Numerical helpers ────────────────────────────────────────
function safeNumeric(value: unknown): number | null {
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) {
      const n = Number(match[0]);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function safeAsaClassification(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

// ── Section B6: PA Strength normalization ─────────────────────────────────
function normalizePaStrength(value: unknown): PaStrength {
  const defaultFactor: PaStrengthFactor = { score: 0, note: "" };
  const source = isObject(value) ? value : {};

  const readFactor = (key: string): PaStrengthFactor => {
    const factor = isObject(source[key]) ? source[key] : {};
    const score = typeof factor.score === "number" && factor.score === 1 ? 1 : 0;
    const note = typeof factor.note === "string" ? factor.note.trim() : "";
    return { score, note };
  };

  return {
    diagnosis_codes: readFactor("diagnosis_codes"),
    conservative_treatments_named: readFactor("conservative_treatments_named"),
    conservative_treatment_duration: readFactor("conservative_treatment_duration"),
    imaging_findings: readFactor("imaging_findings"),
    functional_limitations: readFactor("functional_limitations"),
    surgical_approach: readFactor("surgical_approach"),
    cpt_code_valid: readFactor("cpt_code_valid"),
    symptom_duration: readFactor("symptom_duration")
  };
}

// ── Section C: Catastrophic fallback builder ──────────────────────────────
function buildCatastrophicFallback(
  requestDetails: RequestDetails
): ExtractedChartData & { validation: any } {
  const defaultFactor: PaStrengthFactor = { score: 0, note: "Data could not be extracted from the chart." };

  return {
    patient_name: null,
    date_of_birth: null,
    diagnosis_codes: [],
    primary_complaint: null,
    symptom_duration: null,
    functional_limitations: [],
    objective_measurements: [],
    conservative_treatments_attempted: [],
    imaging_findings: null,
    requested_procedure: null,
    surgical_approach_if_mentioned: null,
    denial_risk_flags: [
      "CATASTROPHIC PARSING ERROR: The AI clinical data extractor returned a malformed response that could not be parsed. All values have defaulted to empty. Please manually enter all patient information in the PA Score panel below to remediate this record before submitting."
    ],
    pa_strength: {
      diagnosis_codes: defaultFactor,
      conservative_treatments_named: defaultFactor,
      conservative_treatment_duration: defaultFactor,
      imaging_findings: defaultFactor,
      functional_limitations: defaultFactor,
      surgical_approach: defaultFactor,
      cpt_code_valid: defaultFactor,
      symptom_duration: defaultFactor
    },
    validation: {
      hard_blocks: [
        {
          field: "patient_name",
          label: "Patient Name",
          message: "Patient identity is required for payer authorization and medical records verification."
        },
        {
          field: "diagnosis_codes",
          label: "Diagnosis Codes",
          message: "At least one ICD diagnosis code is required to establish medical necessity."
        },
        {
          field: "requested_procedure",
          label: "Requested Procedure",
          message: "The specific procedure being requested must be clearly documented for payer review."
        }
      ],
      soft_warnings: [
        {
          field: "parse_failure",
          label: "Extraction Failure",
          message: `The chart extraction returned an unparseable response for CPT ${requestDetails.cptCode} / ${requestDetails.payerName}. Retry generation or manually enter all fields.`
        }
      ]
    }
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function arrayOfObjects(value: unknown) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findChartPayer(chartText: string) {
  const payerPatterns = [
    /(?:payer|insurance|insurer|coverage)(?:\s*(?:name|plan|carrier))?\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,'\- ]{2,})/i,
    /(?:with|through|under)\s+([A-Z][A-Za-z0-9&.,'\- ]{2,})\s+(?:insurance|coverage|plan)/i
  ];

  for (const pattern of payerPatterns) {
    const match = chartText.match(pattern);
    if (match?.[1]) {
      return cleanChartMatch(match[1]);
    }
  }

  return null;
}

function findChartSurgeon(chartText: string) {
  const surgeonPatterns = [
    /(?:attending surgeon|surgeon|orthopedic surgeon|performed by|scheduled with|requesting surgeon)\s*[:\-]?\s*([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){1,3})/i,
    /(?:Dr\.?\s+)?([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){1,3})\s*,?\s*(?:MD|DO)\b/i
  ];

  for (const pattern of surgeonPatterns) {
    const match = chartText.match(pattern);
    if (match?.[1]) {
      return cleanChartMatch(match[1]);
    }
  }

  return null;
}

function cleanChartMatch(value: string) {
  return value.replace(/\s+/g, " ").replace(/[;,.]+$/, "").trim();
}

function partialNameMatch(first: string, second: string) {
  const normalizedFirst = first.toLowerCase();
  const normalizedSecond = second.toLowerCase();
  return normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst);
}

async function callAnthropicWithRetry(params: Parameters<typeof callAnthropic>[0], retries = 2): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callAnthropic(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const isOverloaded = message.includes('overloaded_error') || message.includes('overloaded');
      if (isOverloaded && attempt < retries) {
        await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}
