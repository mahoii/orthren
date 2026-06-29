import { NextResponse } from "next/server";
import { rateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";
import { deidentify, reidentify } from "@/lib/deidentify";
import { postProcessLetter } from "@/lib/letter-postprocess";
import { letterSystemPrompt } from "@/lib/letter-system-prompt";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import type { ExtractedChartData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        { error: "ANTHROPIC_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      extractionJson?: object;
      currentLetter?: string;
      supplements?: Record<string, string>;
    };

    if (!body?.extractionJson || !body.currentLetter || !body.supplements) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const { extractionJson, currentLetter, supplements } = body;

    const supplementList = Object.entries(supplements)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v.trim()}`)
      .join("\n");

    if (!supplementList) {
      return NextResponse.json({ error: "No supplemental data provided." }, { status: 400 });
    }

    const { redacted: redactedExtraction, map: extractionPhiMap } = deidentify(JSON.stringify(extractionJson, null, 2));
    const { redacted: redactedLetter, map: letterPhiMap } = deidentify(currentLetter);
    const mergedPhiMap = { ...extractionPhiMap, ...letterPhiMap };

    const userMessage = `You are performing a surgical revision of an existing Letter of Medical Necessity.

ORIGINAL EXTRACTION DATA:
${redactedExtraction}

CURRENT LETTER:
${redactedLetter}

PHYSICIAN-SUPPLIED SUPPLEMENTAL DATA:
The following clinical details were verified and supplied by the requesting physician to correct gaps in the original chart extraction:

${supplementList}

REVISION INSTRUCTIONS:
1. Revise ONLY the letter sections directly affected by the supplemental data above.
   - conservative_treatment_duration / conservative_treatments_named → conservative care paragraph only
   - imaging_findings → imaging paragraph only
   - functional_limitations → clinical presentation paragraph only
   - surgical_approach → procedure justification paragraph only
   - symptom_duration / diagnosis_codes → opening paragraph and Re: line only
2. All other sections: copy verbatim from CURRENT LETTER. No rewording, no additions.
3. Treat supplemental data as physician-verified chart content. Integrate naturally.
4. SOURCE LOCK: do not introduce any clinical content beyond what appears in ORIGINAL EXTRACTION DATA or PHYSICIAN-SUPPLIED SUPPLEMENTAL DATA above.
5. Single signature block only. Do not add a second signature.
6. Return the complete revised letter only. No preamble, no explanation, no markdown.`;

    const rawLetterText = await callAnthropicWithRetry({
      system: letterSystemPrompt,
      prompt: userMessage,
      maxTokens: 6000,
      temperature: 0,
    });

    const processedLetter = reidentify(
      postProcessLetter(rawLetterText, extractionJson as ExtractedChartData),
      mergedPhiMap
    );

    if (process.env.NODE_ENV === "development") {
      console.log("[regenerate-denial-fix] processed letter start:", processedLetter.slice(0, 200));
      console.log("[regenerate-denial-fix] processed letter end:", processedLetter.slice(-200));
    }

    return NextResponse.json({ letter: processedLetter });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to regenerate the letter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
