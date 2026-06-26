import { NextResponse } from "next/server";
import { sanitizeLetterPlaceholders } from "@/lib/letter-placeholders";
import type { ExtractedChartDataWithValidation } from "@/lib/types";
import { rateLimiter } from "@/lib/rate-limit";
import { letterSystemPrompt } from "@/lib/letter-system-prompt";
import { buildBmiAsaPromptLines, postProcessLetter } from "@/lib/letter-postprocess";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { callAnthropicWithRetry } from "@/lib/anthropic";
import { deidentify } from "@/lib/deidentify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestDetails = {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName: string;
};

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await rateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const supabase = createSupabaseAuthServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured. Add it before generating a packet." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      extracted?: ExtractedChartDataWithValidation;
      requestDetails?: RequestDetails;
      resolutionContext?: string;
      softWarningResolutions?: Record<string, 'unresolved' | 'resolved' | 'cant_resolve'>;
    };

    if (!body?.extracted || !body.requestDetails) {
      return NextResponse.json({ error: "Missing updated chart data or request details." }, { status: 400 });
    }

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    const imagingFindingsJson = JSON.stringify(body.extracted.imaging_findings || null);
    const baseSystemPrompt = letterSystemPrompt
      .replace("[LETTER_DATE]", today)
      .replace("[IMAGING_FINDINGS_JSON]", imagingFindingsJson);
    const systemPromptWithContext = body.resolutionContext
      ? `${baseSystemPrompt}\n\n${body.resolutionContext}`
      : baseSystemPrompt;

    const { validation, pa_strength, ...chartDataOnly } = body.extracted as any;
    const objectiveMeasurementsStr = (body.extracted.objective_measurements ?? []).length
      ? `\nObjective measurements: ${body.extracted.objective_measurements.join("; ")}`
      : "";
    // BMI/ASA trigger lines the prompt rules scan the user message for — the
    // initial-generation path injects these too, and they must match here.
    const bmiAsaLines = buildBmiAsaPromptLines(body.extracted);

    if (process.env.NODE_ENV === "development") {
      console.log("[regenerate-letter] BMI/ASA before letter call:", {
        bmi: (body.extracted as any).bmi ?? null,
        asa_classification: (body.extracted as any).asa_classification ?? null
      });
    }

    const { redacted: deidentifiedChartData } = deidentify(JSON.stringify(chartDataOnly, null, 2));

    let letter = await callAnthropicWithRetry({
      system: systemPromptWithContext,
      prompt: `Structured patient data:
${deidentifiedChartData}

Request details:
CPT code: ${body.requestDetails.cptCode}
Insurance payer: ${body.requestDetails.payerName}
Requesting provider: ${body.requestDetails.providerName}
Practice name: ${body.requestDetails.practiceName}

Letter date: ${today}${bmiAsaLines}${objectiveMeasurementsStr}${buildSoftWarningContext(body.softWarningResolutions)}`,
      maxTokens: 6000,
      temperature: 0
    });

    // Deterministic post-processing — identical to the initial-generation path.
    // Without this, regeneration had no backstop for double signatures or
    // omitted BMI/ASA, which is why those rules failed on every regenerate.
    letter = postProcessLetter(letter, body.extracted);

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

function buildSoftWarningContext(
  resolutions: Record<string, string> | undefined
): string {
  if (!resolutions) return '';
  const labelMap: Record<string, string> = {
    surgical_approach_if_mentioned: 'Surgical approach details',
    imaging_findings: 'Imaging findings',
    conservative_treatments_attempted: 'Conservative treatment history',
    functional_limitations: 'Functional limitations',
    payer_mismatch: 'Payer name mismatch',
  };
  const lines: string[] = [];
  for (const [field, state] of Object.entries(resolutions)) {
    if (state === 'resolved') {
      lines.push(`- ${labelMap[field] ?? field}: User has confirmed this is addressed.`);
    } else if (state === 'cant_resolve') {
      lines.push(
        `- ${labelMap[field] ?? field}: User has confirmed this cannot be resolved. ` +
        `Write the letter to acknowledge this limitation professionally and frame it ` +
        `as a known clinical constraint rather than omitting it or implying it is present.`
      );
    }
  }
  return lines.length
    ? `\n\nSOFT WARNING RESOLUTIONS (incorporate these into the letter):\n${lines.join('\n')}`
    : '';
}
