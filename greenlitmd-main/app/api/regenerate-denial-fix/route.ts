import { NextResponse } from "next/server";
import { sanitizeLetterPlaceholders } from "@/lib/letter-placeholders";
import type { ExtractedChartDataWithValidation } from "@/lib/types";
import { rateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestDetails = {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName: string;
};

const SYSTEM_PROMPT =
  "You are rewriting a prior authorization letter to address a specific denial risk. " +
  "The extracted chart data is provided. You must not invent clinical data. " +
  "You may reframe, emphasize existing evidence, acknowledge limitations, or restructure the narrative.";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await rateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      denialRiskType?: "soft_warning" | "hard_block" | "denial_flag";
      fieldOrFlag?: string;
      currentLetter?: string;
      extractedData?: ExtractedChartDataWithValidation;
      requestDetails?: RequestDetails;
    };

    if (!body?.fieldOrFlag || !body.currentLetter || !body.extractedData || !body.requestDetails) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Strip patient identity and scoring fields — denial-fix rewriting needs clinical evidence only.
    const { validation, pa_strength, patient_name: _pn, date_of_birth: _dob, ...chartDataOnly } = body.extractedData as ExtractedChartDataWithValidation & { validation: unknown; pa_strength: unknown };

    const letter = await callAnthropicWithRetry({
      system: SYSTEM_PROMPT,
      prompt: `Rewrite the letter to specifically address this concern: ${body.fieldOrFlag}.\n\nUse only data from the provided extracted chart data.\n\nCurrent letter:\n${body.currentLetter}\n\nExtracted chart data:\n${JSON.stringify(chartDataOnly, null, 2)}`,
      maxTokens: 6000,
      useStructuredOutput: true,
    });

    const sanitized = sanitizeLetterPlaceholders(letter, {
      patientName: body.extractedData.patient_name,
      payerName: body.requestDetails.payerName,
      providerName: body.requestDetails.providerName,
      practiceName: body.requestDetails.practiceName,
      cptCode: body.requestDetails.cptCode,
      requestedProcedure: body.extractedData.requested_procedure,
    });

    return NextResponse.json({ regeneratedLetter: sanitized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to regenerate the letter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
