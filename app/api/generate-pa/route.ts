import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { sanitizeLetterPlaceholders } from "@/lib/letter-placeholders";
import type { ExtractedChartData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestDetails = {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName: string;
};

const extractionSystemPrompt =
  `You are a medical records analyst specializing in orthopedic prior authorization. Extract the following from the provided patient chart text and return ONLY valid JSON. Include these chart data keys: patient_name, date_of_birth, diagnosis_codes (array), primary_complaint, symptom_duration, functional_limitations (array of specific limitations mentioned), conservative_treatments_attempted (array), imaging_findings (object with modality and key findings), requested_procedure, surgical_approach_if_mentioned, denial_risk_flags (array of strings describing missing or weak elements that could cause denial). If information is not found, use null for strings and empty arrays for arrays, except conservative_treatments_attempted must follow the instruction below. After extracting all fields, also return a 'validation' object with hard_blocks and soft_warnings arrays. For hard_blocks, include any of these fields that are missing or null: patient_name, diagnosis_codes (if empty), requested_procedure. For soft_warnings, include any of these fields that are missing or null: surgical_approach_if_mentioned, imaging_findings, conservative_treatments_attempted (if empty), functional_limitations (if empty). Each block/warning object must have: {field, label, message}. Return the complete JSON including chart data and validation object.

Extract ALL conservative treatments attempted by the patient before surgery. For each treatment found, you MUST provide the treatment_name — never return null or unknown for this field. Search the chart for any mention of: physical therapy (PT), occupational therapy (OT), NSAIDs (ibuprofen, naproxen, celecoxib, meloxicam), corticosteroid injections (cortisone, kenalog, depomedrol), hyaluronic acid injections (synvisc, hyalgan, euflexxa), bracing or orthotics, activity modification, weight loss programs, chiropractic care, acupuncture, topical medications, opioid or non-opioid analgesics, or any other conservative intervention mentioned.
For each treatment found return an object with exactly these fields:

treatment_name: the specific name of the treatment (e.g. Physical Therapy, Ibuprofen/NSAID, Corticosteroid Injection — Kenalog, Hyaluronic Acid Injection — Synvisc). Never return null. If ambiguous, make the most reasonable clinical inference from context.
duration: how long the treatment was attempted (e.g. 6 months, 8 weeks). Return null only if truly not mentioned.
outcome: what happened (e.g. failed, minimal improvement, GI intolerance developed, temporary relief only, no improvement). Use the exact language from the chart where possible.
dates: any specific dates mentioned for this treatment. Return null if not found.

Return a minimum of 1 treatment object. If no treatments are found at all, return a single object with treatment_name: Conservative treatment history not documented, duration: null, outcome: null, dates: null.`;

const letterSystemPrompt =
  "You are a prior authorization specialist with 15 years of experience winning approvals for orthopedic procedures. Using the structured patient data provided, write a compelling Letter of Medical Necessity. The letter must: (1) Open with patient demographics and the specific procedure requested with CPT code. (2) Establish the clinical presentation - chief complaint, duration, severity, and specific functional limitations using the patient's own documented measurements where available. (3) Document conservative care chronologically - every treatment tried, how long, and why it failed. Payers require proof that surgery is a last resort. (4) Reference imaging findings using precise medical language that directly supports the surgical indication. (5) State the specific procedure with anatomical detail - laterality, approach, implants if applicable. (6) Close with a statement of medical necessity referencing the patient's inability to maintain activities of daily living. End with a signature block containing the requesting provider name, MD, and the practice name from the request details. Write in formal clinical language. Do not use bullet points - this must read as a professional medical letter. If source data is insufficient, state that physician review is required without using square brackets.";

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured. Add it before generating a packet." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const chart = formData.get("chart");
    const cptCode = stringField(formData.get("cptCode"));
    const payerName = stringField(formData.get("payerName"));
    const providerName = stringField(formData.get("providerName"));
    const practiceName = stringField(formData.get("practiceName")) || "Orthopedic Practice";

    if (!(chart instanceof File)) {
      return NextResponse.json({ error: "Upload a PDF chart before generating the packet." }, { status: 400 });
    }

    if (!cptCode || !payerName || !providerName) {
      return NextResponse.json({ error: "CPT code, payer name, and provider name are required." }, { status: 400 });
    }

    const chartText = await extractPdfText(chart);
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

async function extractChartData(
  chartText: string,
  requestDetails: RequestDetails
) {
  const content = await callGroq({
    system: extractionSystemPrompt,
    prompt: `Request details:
CPT code: ${requestDetails.cptCode}
Insurance payer: ${requestDetails.payerName}
Requesting provider: ${requestDetails.providerName}
Practice name: ${requestDetails.practiceName}

Patient chart text:
${chartText}`
  });

  const parsed = parseJsonObject(content);
  return normalizeChartData(parsed, requestDetails);
}

async function generateLetter(
  extracted: ExtractedChartData,
  requestDetails: RequestDetails
) {
  const { validation, ...chartDataOnly } = extracted as any;
  const letter = await callGroq({
    system: letterSystemPrompt,
    prompt: `Structured patient data:
${JSON.stringify(chartDataOnly, null, 2)}

Request details:
CPT code: ${requestDetails.cptCode}
Insurance payer: ${requestDetails.payerName}
Requesting provider: ${requestDetails.providerName}
Practice name: ${requestDetails.practiceName}`
  });

  return sanitizeLetterPlaceholders(letter, {
    patientName: extracted.patient_name,
    payerName: requestDetails.payerName,
    providerName: requestDetails.providerName,
    practiceName: requestDetails.practiceName,
    cptCode: requestDetails.cptCode,
    requestedProcedure: extracted.requested_procedure
  });
}

async function callGroq({
  system,
  prompt
}: {
  system: string;
  prompt: string;
}) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API request failed. ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("Groq did not return a usable response.");
  }

  return text;
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("Groq did not return valid chart extraction JSON.");
    }

    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function normalizeChartData(
  data: Record<string, unknown>,
  requestDetails: RequestDetails
): ExtractedChartData & { validation: any } {
  const imaging = isObject(data.imaging_findings) ? data.imaging_findings : null;
  const patientName = nullableString(data.patient_name);
  const diagnosisCodes = stringArray(data.diagnosis_codes);
  const requestedProcedure = nullableString(data.requested_procedure);
  const surgicalApproach = nullableString(data.surgical_approach_if_mentioned);
  const imagingFindings = imaging
    ? {
        modality: nullableString(imaging.modality),
        key_findings: nullableString(imaging.key_findings ?? imaging.findings)
      }
    : null;
  const conservativeTreatments = arrayOfObjects(data.conservative_treatments_attempted).map((item) => ({
    treatment: nullableString(item.treatment_name ?? item.treatment ?? item.name),
    duration: nullableString(item.duration),
    outcome: nullableString(item.outcome),
    dates: nullableString(item.dates)
  }));
  const functionalLimitations = stringArray(data.functional_limitations);

  const hard_blocks: any[] = [];
  const soft_warnings: any[] = [];

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

  const normalized = {
    patient_name: patientName,
    date_of_birth: nullableString(data.date_of_birth),
    diagnosis_codes: diagnosisCodes,
    primary_complaint: nullableString(data.primary_complaint),
    symptom_duration: nullableString(data.symptom_duration),
    functional_limitations: functionalLimitations,
    conservative_treatments_attempted: conservativeTreatments,
    imaging_findings: imagingFindings,
    requested_procedure: requestedProcedure,
    surgical_approach_if_mentioned: surgicalApproach,
    denial_risk_flags: stringArray(data.denial_risk_flags),
    validation: { hard_blocks, soft_warnings }
  };

  return normalized;
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
