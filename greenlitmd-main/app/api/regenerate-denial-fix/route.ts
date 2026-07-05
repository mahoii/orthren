import { NextResponse } from "next/server";
import { rateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";
import { createDeidentifyState, deidentify } from "@/lib/deidentify";
import { assertDeidentified, DeidVerificationError } from "@/lib/deid-verify";
import { serverPosthog } from "@/lib/posthog";
import { letterSystemPrompt } from "@/lib/letter-system-prompt";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { finalizeLetter, computeDeterministicPaStrength, type RequestDetails } from "@/lib/pa-pipeline";
import { getPayerRule, normalizePayerName, applyValidatedPayerDurationPenalty } from "@/lib/payer-rules";
import type { ExtractedChartData, ConservativeTreatment } from "@/lib/types";

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
      requestDetails?: RequestDetails;
    };

    if (!body?.extractionJson || !body.currentLetter || !body.supplements || !body.requestDetails) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const { extractionJson, currentLetter, supplements, requestDetails } = body;

    const supplementList = Object.entries(supplements)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v.trim()}`)
      .join("\n");

    if (!supplementList) {
      return NextResponse.json({ error: "No supplemental data provided." }, { status: 400 });
    }

    // Shared state so the second deidentify() call extends token numbering
    // instead of restarting it — otherwise e.g. [DATE_1] could mean a
    // different real date in each map, silently resolved in the letter
    // map's favor by the old object-spread merge.
    const phiState = createDeidentifyState();
    const { redacted: redactedExtraction } = deidentify(JSON.stringify(extractionJson, null, 2), phiState);
    const { redacted: redactedLetter } = deidentify(currentLetter, phiState);
    const mergedPhiMap = phiState.map;
    // Verify both redacted strings against the FINAL shared map -- a value
    // discovered while redacting the letter but missed in the (already
    // redacted) extraction JSON would otherwise go unchecked.
    assertDeidentified(redactedExtraction, mergedPhiMap, "regenerate-denial-fix.extraction");
    assertDeidentified(redactedLetter, mergedPhiMap, "regenerate-denial-fix.letter");

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

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const systemPromptWithDate = letterSystemPrompt.replace("[LETTER_DATE]", today);

    const rawLetterText = await callAnthropicWithRetry({
      system: systemPromptWithDate,
      prompt: userMessage,
      maxTokens: 6000,
      temperature: 0,
    });

    const { letter: processedLetter, sourceLockWarning } = await finalizeLetter({
      rawLetter: rawLetterText,
      extracted: extractionJson as ExtractedChartData,
      requestDetails,
      phiMap: mergedPhiMap,
      letterDate: today,
      regenerateRawLetter: () =>
        callAnthropicWithRetry({
          system: systemPromptWithDate,
          prompt: userMessage,
          maxTokens: 6000,
          temperature: 0,
        }),
    });

    const mergedExtraction = mergeSupplementsIntoExtraction(
      extractionJson as ExtractedChartData,
      supplements
    );

    // Re-score deterministically against the merged (post-supplement) extraction
    // instead of trusting a client-side force-set — see app/review/page.tsx
    // handleRegenerate, which used to bump every supplemented factor to score 1
    // regardless of the rubric or any validated-payer penalty. diagnosis_codes and
    // surgical_approach fall back to presence checks here since there's no fresh
    // extraction LLM call on this path (computeDeterministicPaStrength's 3rd arg
    // is intentionally omitted).
    const normalizedPayer = normalizePayerName(requestDetails.payerName);
    const payerRule = normalizedPayer ? getPayerRule(normalizedPayer, requestDetails.cptCode) : null;
    const pa_strength = applyValidatedPayerDurationPenalty(
      computeDeterministicPaStrength(mergedExtraction, requestDetails.cptCode),
      payerRule,
      mergedExtraction.conservative_treatments_attempted
    );
    const updatedExtractionJson: ExtractedChartData = { ...mergedExtraction, pa_strength };

    if (process.env.NODE_ENV === "development") {
      console.log("[regenerate-denial-fix] processed letter start:", processedLetter.slice(0, 200));
      console.log("[regenerate-denial-fix] processed letter end:", processedLetter.slice(-200));
    }

    return NextResponse.json({
      letter: processedLetter,
      extractionJson: updatedExtractionJson,
      sourceLockWarning,
    });
  } catch (error) {
    if (error instanceof DeidVerificationError) {
      serverPosthog.capture({
        distinctId: "server",
        event: "deid_verification_failed",
        properties: {
          seam: error.seam,
          route: "regenerate-denial-fix",
          categories: error.categories,
          leak_count: error.leakCount,
        },
      });
      return NextResponse.json(
        { error: "DEID_VERIFICATION_FAILED", categories: error.categories },
        { status: 422 }
      );
    }
    const message = error instanceof Error ? error.message : "Unable to regenerate the letter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Writes physician-supplied supplements back into the extraction record so the
// letter, extraction JSON, review-page state, and export stop diverging after a
// denial-fix regeneration. Pure function — never mutates `extracted` in place.
function mergeSupplementsIntoExtraction(
  extracted: ExtractedChartData,
  supplements: Record<string, string>
): ExtractedChartData {
  const result: ExtractedChartData = { ...extracted };

  for (const [key, rawValue] of Object.entries(supplements)) {
    const supplement = rawValue.trim();
    if (!supplement) continue;

    switch (key) {
      case "symptom_duration":
        result.symptom_duration = appendOrSet(result.symptom_duration, supplement);
        break;

      case "surgical_approach":
        result.surgical_approach_if_mentioned = appendOrSet(result.surgical_approach_if_mentioned, supplement);
        break;

      case "diagnosis_codes":
        result.diagnosis_codes = pushDeduped(result.diagnosis_codes, supplement);
        break;

      case "functional_limitations":
        result.functional_limitations = pushDeduped(result.functional_limitations, supplement);
        break;

      case "imaging_findings":
        result.imaging_findings = result.imaging_findings
          ? { ...result.imaging_findings, key_findings: appendOrSet(result.imaging_findings.key_findings, supplement) }
          : { modality: null, key_findings: supplement };
        break;

      case "conservative_treatments_named":
        result.conservative_treatments_attempted = [
          ...result.conservative_treatments_attempted,
          { treatment: supplement, duration: null, outcome: null, dates: null, relief_duration: null },
        ];
        break;

      case "conservative_treatment_duration": {
        const candidates = result.conservative_treatments_attempted.filter(
          (t) => t.duration === null
        );
        if (candidates.length === 1) {
          result.conservative_treatments_attempted = result.conservative_treatments_attempted.map((t) =>
            t === candidates[0] ? { ...t, duration: supplement } : t
          );
        } else {
          const synthetic: ConservativeTreatment = {
            treatment: "Conservative care duration clarification",
            duration: supplement,
            outcome: null,
            dates: null,
            relief_duration: null,
          };
          result.conservative_treatments_attempted = [...result.conservative_treatments_attempted, synthetic];
        }
        break;
      }

      case "cpt_code_valid":
        // Form-validation result (CPT-vs-payer-rules check), not chart-derived
        // data — does not belong in ExtractedChartData. It already reaches the
        // letter via the supplementList prompt injection above and already
        // bumps pa_strength client-side (app/review/page.tsx handleRegenerate) —
        // both paths are unchanged, so this key is intentionally skipped here.
        break;

      default:
        break;
    }
  }

  return result;
}

function appendOrSet(existing: string | null, supplement: string): string {
  if (!existing || !existing.trim()) return supplement;
  return `${existing}; physician-supplied clarification: ${supplement}`;
}

function pushDeduped(existing: string[], supplement: string): string[] {
  const alreadyPresent = existing.some((e) => e.toLowerCase() === supplement.toLowerCase());
  return alreadyPresent ? existing : [...existing, supplement];
}
