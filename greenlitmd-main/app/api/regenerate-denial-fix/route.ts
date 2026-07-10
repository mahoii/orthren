import { NextResponse } from "next/server";
import { regenerationRateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";
import { createDeidentifyState, deidentify } from "@/lib/deidentify";
import { assertDeidentified, DeidVerificationError } from "@/lib/deid-verify";
import { captureEvent } from "@/lib/posthog";
import { letterSystemPrompt } from "@/lib/letter-system-prompt";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { finalizeLetter, computeDeterministicPaStrength, type RequestDetails } from "@/lib/pa-pipeline";
import { isKnownCptCode } from "@/lib/known-cpt-codes";
import { isSampleChartPatientName } from "@/lib/sample-charts";
import { mergeSupplementsIntoExtraction } from "@/lib/merge-supplements";
import {
  getPayerRule,
  normalizePayerName,
  applyValidatedPayerDurationPenalty,
  getPayerChecklist,
  deriveHardRequirementRiskFlags,
} from "@/lib/payer-rules";
import type { ExtractedChartData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidRequestBody(body: unknown): body is {
  extractionJson: ExtractedChartData;
  currentLetter: string;
  supplements: Record<string, string>;
  requestDetails: RequestDetails;
} {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.currentLetter !== "string") return false;
  if (!b.extractionJson || typeof b.extractionJson !== "object") return false;
  const extraction = b.extractionJson as Record<string, unknown>;
  if (!Array.isArray(extraction.conservative_treatments_attempted)) return false;
  if (!Array.isArray(extraction.denial_risk_flags)) return false;
  if (!b.supplements || typeof b.supplements !== "object" || Array.isArray(b.supplements)) return false;
  if (Object.values(b.supplements as Record<string, unknown>).some((v) => typeof v !== "string")) return false;
  if (!b.requestDetails || typeof b.requestDetails !== "object") return false;
  const rd = b.requestDetails as Record<string, unknown>;
  if (typeof rd.cptCode !== "string" || typeof rd.payerName !== "string" || typeof rd.providerName !== "string") {
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await regenerationRateLimiter.limit(ip);
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

    const body: unknown = await request.json();
    if (!isValidRequestBody(body)) {
      return NextResponse.json({ error: "Missing or malformed required fields." }, { status: 400 });
    }

    const { extractionJson, currentLetter, supplements, requestDetails } = body;

    // Sandbox isolation: the client demo flow never calls a live route, but
    // nothing previously stopped Regenerate from doing so against a demo
    // profile's extraction. Zero live Anthropic calls from sandbox, ever.
    if (isSampleChartPatientName(extractionJson.patient_name)) {
      return NextResponse.json(
        { error: "This is a demo chart — regeneration is disabled in sandbox mode." },
        { status: 400 }
      );
    }

    // cpt_code_valid is a corrected-CPT-code signal, not chart narrative — it
    // never belongs in ExtractedChartData (see mergeSupplementsIntoExtraction
    // below) and it shouldn't be sent to the letter model as free text either.
    // Extract a valid 5-digit code from the physician's input (the fix-card
    // placeholder invites text like "27447 — Total Knee Arthroplasty") and
    // route it into requestDetails.cptCode instead, so the score, the Re:
    // line, and every other CPT-derived field move together. See B1 in
    // AUDIT-FINDINGS.md — previously this supplement was silently discarded
    // both by the merge (which skipped the key) and the rescore (which reused
    // the stale requestDetails.cptCode), so "Apply Fix" for this factor did
    // nothing at all.
    const cptSupplementRaw = supplements.cpt_code_valid?.trim();
    let effectiveCptCode = requestDetails.cptCode;
    let cptCorrectionNote: string | null = null;
    if (cptSupplementRaw) {
      const candidate = cptSupplementRaw.match(/\d{5}/)?.[0];
      if (candidate && isKnownCptCode(candidate) && candidate !== requestDetails.cptCode) {
        effectiveCptCode = candidate;
        cptCorrectionNote = `cpt_code_valid: Corrected CPT code to ${candidate} (previously ${requestDetails.cptCode}).`;
      }
    }
    const effectiveRequestDetails: RequestDetails = { ...requestDetails, cptCode: effectiveCptCode };

    const supplementListLines = Object.entries(supplements)
      .filter(([k, v]) => k !== "cpt_code_valid" && v.trim())
      .map(([k, v]) => `${k}: ${v.trim()}`);
    if (cptCorrectionNote) supplementListLines.push(cptCorrectionNote);
    const supplementList = supplementListLines.join("\n");

    if (!supplementList) {
      return NextResponse.json({ error: "No supplemental data provided." }, { status: 400 });
    }

    // Shared state so the second/third deidentify() calls extend token
    // numbering instead of restarting it — otherwise e.g. [DATE_1] could mean
    // a different real date in each map, silently resolved in the wrong
    // field's favor. Supplements are physician-typed free text (the fix-card
    // placeholders solicit dates, durations, dosages) and are PHI-bearing
    // exactly like the extraction/letter text — they are redacted through
    // this same state and the FULL assembled prompt is asserted below, not
    // just the extraction/letter substrings. See A2 in AUDIT-FINDINGS.md.
    const phiState = createDeidentifyState();
    const { redacted: redactedExtraction } = deidentify(JSON.stringify(extractionJson, null, 2), phiState);
    const { redacted: redactedLetter } = deidentify(currentLetter, phiState);
    const { redacted: redactedSupplementList } = deidentify(supplementList, phiState);
    const mergedPhiMap = phiState.map;

    const userMessage = `You are performing a surgical revision of an existing Letter of Medical Necessity.

ORIGINAL EXTRACTION DATA:
${redactedExtraction}

CURRENT LETTER:
${redactedLetter}

PHYSICIAN-SUPPLIED SUPPLEMENTAL DATA:
The following clinical details were verified and supplied by the requesting physician to correct gaps in the original chart extraction:

${redactedSupplementList}

REVISION INSTRUCTIONS:
1. Revise ONLY the letter sections directly affected by the supplemental data above.
   - conservative_treatment_duration / conservative_treatments_named → conservative care paragraph only
   - imaging_findings → imaging paragraph only
   - functional_limitations → clinical presentation paragraph only
   - surgical_approach → procedure justification paragraph only
   - symptom_duration / diagnosis_codes → opening paragraph and Re: line only
   - cpt_code_valid → CPT code references in the procedure justification paragraph only; the Re: line CPT is stamped separately, do not alter it
2. All other sections: copy verbatim from CURRENT LETTER. No rewording, no additions.
3. Treat supplemental data as physician-verified chart content. Integrate naturally.
4. SOURCE LOCK: do not introduce any clinical content beyond what appears in ORIGINAL EXTRACTION DATA or PHYSICIAN-SUPPLIED SUPPLEMENTAL DATA above.
5. Single signature block only. Do not add a second signature.
6. Return the complete revised letter only. No preamble, no explanation, no markdown.`;

    assertDeidentified(userMessage, mergedPhiMap, "regenerate-denial-fix.prompt");

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

    // Merge supplements into the extraction BEFORE finalizeLetter runs, so
    // verifySourceLock's grounding haystack (built from `extracted`) already
    // contains whatever the physician supplied. Previously this ran on the
    // pre-merge extraction, so any supplied date/duration/dosage/approach term
    // that the model dutifully echoed into the letter (per instruction 3
    // above) was guaranteed to read as "ungrounded" — one wasted retry, then
    // a false sourceLockWarning that blocks Download on a correctly
    // supplemented letter. See A3 in AUDIT-FINDINGS.md.
    const mergedExtraction = mergeSupplementsIntoExtraction(extractionJson, supplements);

    const { letter: finalizedLetter, sourceLockWarning } = await finalizeLetter({
      rawLetter: rawLetterText,
      extracted: mergedExtraction,
      requestDetails: effectiveRequestDetails,
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

    // The model is instructed NOT to touch the Re: line's CPT text (revision
    // instruction 1 above) so it can't hallucinate a Re: line rewrite — but by
    // regenerate time, sanitizeLetterPlaceholders' `[CPT Code]` bracket-fill
    // (lib/letter-placeholders.ts) has long since resolved to the literal old
    // code, and instruction 2 ("copy verbatim") preserves it verbatim. So a
    // cpt_code_valid correction needs its own deterministic pass here,
    // otherwise the DOCX cover page (stamped with effectiveCptCode below)
    // diverges from the Re: line still showing the stale code. 5-digit CPT
    // codes at a word boundary are distinctive enough in medical-necessity
    // letter prose that this is safe.
    const processedLetter =
      effectiveCptCode !== requestDetails.cptCode
        ? finalizedLetter.replace(new RegExp(`\\b${requestDetails.cptCode}\\b`, "g"), effectiveCptCode)
        : finalizedLetter;

    // Carry forward the PREVIOUS LLM judgment for the two clinically-scored
    // factors (diagnosis_codes, surgical_approach) instead of omitting the 3rd
    // arg entirely. There is no fresh extraction-scoring LLM call on this
    // path, so omitting it fell through to computeDeterministicPaStrength's
    // presence-check fallbacks ("any non-empty code list" / "any non-null
    // string" ⇒ pass) — a factor the original extraction judged clinically
    // inadequate (score 0) could flip to 1 on any unrelated regenerate, with
    // no new clinical evidence. Carrying the previous score forward is
    // strictly more conservative: it can't silently inflate, though a
    // physician-supplied diagnosis_codes/surgical_approach correction won't
    // be re-judged until the next full extraction. See B6 in
    // AUDIT-FINDINGS.md.
    const normalizedPayer = normalizePayerName(effectiveRequestDetails.payerName);
    const payerRule = normalizedPayer ? getPayerRule(normalizedPayer, effectiveRequestDetails.cptCode) : null;
    const pa_strength = applyValidatedPayerDurationPenalty(
      computeDeterministicPaStrength(mergedExtraction, effectiveRequestDetails.cptCode, extractionJson.pa_strength),
      payerRule,
      mergedExtraction.conservative_treatments_attempted
    );

    // Same advisory payer-checklist flags as generate-pa — recomputed here too,
    // otherwise a regenerate silently drops any hard-requirement flags that
    // were present after the initial generation. `extractionJson` coming in
    // may already carry payer-hardreq-* flags from a prior generate-pa call,
    // so strip and recompute fresh rather than accumulate stale ones (e.g. a
    // requirement the reviewer just supplemented would otherwise keep showing
    // a "not found" flag forever). See lib/payer-rules.ts.
    const rescored: ExtractedChartData = { ...mergedExtraction, pa_strength };
    const nonPayerFlags = rescored.denial_risk_flags.filter((f) => !f.id.startsWith("payer-hardreq-"));
    const rescoredForChecklist: ExtractedChartData = { ...rescored, denial_risk_flags: nonPayerFlags };
    const payerChecklist = payerRule ? getPayerChecklist(payerRule, rescoredForChecklist) : [];
    const updatedExtractionJson: ExtractedChartData = {
      ...rescoredForChecklist,
      denial_risk_flags: [
        ...nonPayerFlags,
        ...deriveHardRequirementRiskFlags(payerRule, rescoredForChecklist, payerChecklist),
      ],
    };

    if (process.env.NODE_ENV === "development") {
      console.log("[regenerate-denial-fix] processed letter start:", processedLetter.slice(0, 200));
      console.log("[regenerate-denial-fix] processed letter end:", processedLetter.slice(-200));
    }

    return NextResponse.json({
      letter: processedLetter,
      extractionJson: updatedExtractionJson,
      cptCode: effectiveRequestDetails.cptCode,
      sourceLockWarning,
    });
  } catch (error) {
    if (error instanceof DeidVerificationError) {
      await captureEvent({
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
    console.error("[regenerate-denial-fix] POST handler error:", error);
    return NextResponse.json(
      { error: "Unable to regenerate the letter. Please try again." },
      { status: 500 }
    );
  }
}
