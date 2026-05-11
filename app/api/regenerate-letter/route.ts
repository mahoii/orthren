import { NextResponse } from "next/server";
import { sanitizeLetterPlaceholders } from "@/lib/letter-placeholders";
import type { ExtractedChartDataWithValidation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const letterSystemPrompt =
  "You are a prior authorization specialist with 15 years of experience winning approvals for orthopedic procedures. Using the structured patient data provided, write a compelling Letter of Medical Necessity. The letter must: (1) Open with patient demographics and the specific procedure requested with CPT code. (2) Establish the clinical presentation - chief complaint, duration, severity, and specific functional limitations using the patient's own documented measurements where available. (3) Document conservative care chronologically - every treatment tried, how long, and why it failed. Payers require proof that surgery is a last resort. (4) Reference imaging findings using precise medical language that directly supports the surgical indication. (5) State the specific procedure with anatomical detail - laterality, approach, implants if applicable. (6) Close with a statement of medical necessity referencing the patient's inability to maintain activities of daily living. End with a signature block containing the requesting provider name, MD, and the practice name from the request details. Write in formal clinical language. Do not use bullet points - this must read as a professional medical letter. If source data is insufficient, state that physician review is required without using square brackets.";

type RequestDetails = {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName: string;
};

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured. Add it before generating a packet." },
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

    const { validation, pa_strength, ...chartDataOnly } = body.extracted as any;
    const letter = await callGroq({
      system: letterSystemPrompt,
      prompt: `Structured patient data:
${JSON.stringify(chartDataOnly, null, 2)}

Request details:
CPT code: ${body.requestDetails.cptCode}
Insurance payer: ${body.requestDetails.payerName}
Requesting provider: ${body.requestDetails.providerName}
Practice name: ${body.requestDetails.practiceName}`
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
