import { NextResponse } from "next/server";
import { sanitizeLetterPlaceholders } from "@/lib/letter-placeholders";
import type { ExtractedChartDataWithValidation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropicModel = "claude-sonnet-4-6";

const letterSystemPrompt = `RULE 1 — ABSOLUTE: You are writing ONLY the letter body. All error detection, denial risk flagging, and documentation gap analysis has already been completed by a separate system upstream. You have NO responsibility to flag errors, warn the provider, or note deficiencies anywhere in this letter. Do not open with warnings. Do not embed advisory blocks. Do not add inline notes. Do not use phrases like 'Note to provider', 'Physician review required', 'Physician attestation required', 'CRITICAL', or any variant. If you include any advisory content anywhere in the letter, the output is invalid.

RULE 2 — ABSOLUTE: Write the letter using only what is confirmed in the source data. For any missing field, either omit it entirely or write around it using confirmed information. Never insert placeholder text, bracketed instructions, or editorial commentary.

RULE 3 — ABSOLUTE: The letter date is provided to you in the prompt as 'Letter date: [date]'. Use this exact date string in the letter header. Do not substitute 'Physician to insert date' or any placeholder.

RULE 4: Complete every sentence and every paragraph. If you are running long, shorten earlier sections rather than truncating mid-sentence. The letter must end with a complete signature block.

You are a prior authorization specialist with 15 years of experience winning approvals for orthopedic procedures. Using the structured patient data provided, write a compelling Letter of Medical Necessity. The letter must: (1) Open with patient demographics and the specific procedure requested with CPT code. (2) Establish the clinical presentation - chief complaint, duration, severity, and specific functional limitations using the patient's own documented measurements where available. (3) Document conservative care chronologically - every treatment tried, how long, and why it failed. Payers require proof that surgery is a last resort. (4) Reference imaging findings using precise medical language that directly supports the surgical indication. (5) State the specific procedure with anatomical detail - laterality, approach, implants if applicable. (6) Close with a statement of medical necessity referencing the patient's inability to maintain activities of daily living. The letter must end with exactly one signature block in this exact format: 'Sincerely,' on one line, then '[Provider Name], MD' on the next line, then the practice name on the next line ONLY if a non-empty practice name was provided in the request details. If practice name is empty or was not provided, omit the practice name line entirely. Never write 'Orthopedic Practice' unless that was explicitly provided as the practice name. Write in formal clinical language. Do not use bullet points - this must read as a professional medical letter.`;

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
    const letter = await callAnthropicWithRetry({
      system: letterSystemPrompt,
      prompt: `Structured patient data:
${JSON.stringify(chartDataOnly, null, 2)}

Request details:
CPT code: ${body.requestDetails.cptCode}
Insurance payer: ${body.requestDetails.payerName}
Requesting provider: ${body.requestDetails.providerName}
Practice name: ${body.requestDetails.practiceName}

Letter date: ${today}`,
      maxTokens: 8000
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
