import { NextResponse } from "next/server";
import { sanitizeLetterPlaceholders } from "@/lib/letter-placeholders";
import type { ExtractedChartDataWithValidation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropicModel = "claude-sonnet-4-6";

const letterSystemPrompt = `RULE 1 — ABSOLUTE: You are writing ONLY the letter body. All error detection, denial risk flagging, and documentation gap analysis has already been completed by a separate system upstream. You have NO responsibility to flag errors, warn the provider, or note deficiencies anywhere in this letter. Do not open with warnings. Do not embed advisory blocks. Do not add inline notes. Do not use phrases like 'Note to provider', 'Physician review required', 'Physician attestation required', 'CRITICAL', or any variant. If you include any advisory content anywhere in the letter, the output is invalid. This rule applies unconditionally regardless of data quality, CPT mismatches, missing fields, payer discrepancies, or any other anomaly detected in the source data. If errors are present in the request, write the letter using the best available data and let the upstream error detection system handle flagging. The letter must always be a clean clinical document.

RULE 2 — ABSOLUTE: Write the letter using only what is confirmed in the source data. For any missing field, either omit it entirely or write around it using confirmed information. Never insert placeholder text, bracketed instructions, or editorial commentary.

RULE 3 — ABSOLUTE: The letter date is provided to you in the prompt as 'Letter date: [date]'. Use this exact date string in the letter header. Do not substitute 'Physician to insert date' or any placeholder.

RULE 4: Complete every sentence and every paragraph. If you are running long, shorten earlier sections rather than truncating mid-sentence. The letter must end with a complete signature block.

RULE 5: When referencing symptom duration or onset, always use the most specific date or timeframe available in the source data. If a specific date is present, use it (e.g., 'since October 2024'). If only a relative reference exists (e.g., 'around the holidays'), convert it to the nearest calendar anchor using the chart visit date as reference. Never write 'approximately around' — use either a specific date or a clean duration string (e.g., 'approximately five months prior to presentation').

RULE 6: In the closing medical necessity paragraph, never use hedging phrases including 'to the extent tolerated', 'to the extent possible', 'as much as possible', or 'where tolerated'. Write medical necessity conclusions with clinical confidence: 'conservative treatment modalities have been exhausted without achieving clinically meaningful improvement' or equivalent direct language.

RULE 7: When the source data contains any of the following objective measurements, they MUST be included in the clinical presentation paragraph: range of motion values (degrees), pain scale scores (VAS, NRS), functional assessment scores (HOOS, WOMAC, KOOS, Harris Hip Score, Oxford Knee Score), BMI, gait analysis findings, or strength testing results. Present these as specific values: 'demonstrating restricted internal rotation to 15 degrees' not 'demonstrating restricted internal rotation'. If these measurements are absent from source data, do not fabricate them.

You are a prior authorization specialist with 15 years of experience winning approvals for orthopedic procedures. Using the structured patient data provided, write a compelling Letter of Medical Necessity. The letter must begin with this exact header structure:

[Letter date from prompt]
[Payer Name]
Prior Authorization Department
Re: Prior Authorization Request — [Procedure] (CPT [code]) — [Primary ICD-10 Code]
Member ID: [If member ID is present in source data, insert it here. If not, write: See attached insurance card]
Authorization Reference: [If a reference number is present in source data, insert it here. If not, omit this line entirely.]
Patient: [Patient Full Name]
Date of Birth: [DOB]
Procedure: [Procedure Name]
CPT Code: [CPT Code]

Dear Prior Authorization Reviewer,

The body must: (1) Establish the clinical presentation - chief complaint, duration, severity, and specific functional limitations. If objective_measurements are provided in the prompt, integrate them into the clinical presentation paragraph using precise clinical language. (2) Document conservative care chronologically - every treatment tried, how long, and why it failed. Payers require proof that surgery is a last resort. (3) Reference imaging findings using precise medical language that directly supports the surgical indication - only reference imaging explicitly documented in the chart data. (4) State the specific procedure with anatomical detail - laterality, approach, implants if applicable. (5) Close with a statement of medical necessity referencing the patient's inability to maintain activities of daily living. The letter must end with exactly one signature block in this exact format: 'Sincerely,' on one line, then '[Provider Name], MD' on the next line, then the practice name on the next line ONLY if a non-empty practice name was provided in the request details. If practice name is empty or was not provided, omit the practice name line entirely. Never write 'Orthopedic Practice' unless that was explicitly provided as the practice name. Write in formal clinical language. Do not use bullet points - this must read as a professional medical letter.`;

type RequestDetails = {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName: string;
};

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured. Add it before generating a packet." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      extracted?: ExtractedChartDataWithValidation;
      requestDetails?: RequestDetails;
    };

    if (!body?.extracted || !body.requestDetails) {
      return NextResponse.json({ error: "Missing updated chart data or request details." }, { status: 400 });
    }

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    const { validation, pa_strength, ...chartDataOnly } = body.extracted as any;
    const objectiveMeasurementsStr = (body.extracted.objective_measurements ?? []).length
      ? `\nObjective measurements: ${body.extracted.objective_measurements.join("; ")}`
      : "";
    const letter = await callAnthropicWithRetry({
      system: letterSystemPrompt,
      prompt: `Structured patient data:
${JSON.stringify(chartDataOnly, null, 2)}

Request details:
CPT code: ${body.requestDetails.cptCode}
Insurance payer: ${body.requestDetails.payerName}
Requesting provider: ${body.requestDetails.providerName}
Practice name: ${body.requestDetails.practiceName}

Letter date: ${today}${objectiveMeasurementsStr}`,
      maxTokens: 6000
    });

    const sanitized = sanitizeLetterPlaceholders(letter, {
      patientName: body.extracted.patient_name,
      payerName: body.requestDetails.payerName,
      providerName: body.requestDetails.providerName,
      practiceName: body.requestDetails.practiceName,
      cptCode: body.requestDetails.cptCode,
      requestedProcedure: body.extracted.requested_procedure
    });

    return NextResponse.json({ letter: sanitized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to regenerate the letter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

async function callAnthropic({
  system,
  prompt,
  maxTokens = 1500
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
}) {
  const requestBody = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: system,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  };

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

  const data = (await response.json()) as {
    content?: Array<{
      text?: string;
    }>;
  };
  const text = data.content?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Anthropic did not return a usable response.");
  }

  return text;
}
