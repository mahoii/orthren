import { NextResponse } from "next/server";
import { lightRateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";
import { deidentify, reidentifyDeep } from "@/lib/deidentify";
import { assertDeidentified, DeidVerificationError } from "@/lib/deid-verify";
import { captureEvent } from "@/lib/posthog";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT =
  "You are a clinical document analyzer. Given a Letter of Medical Necessity and a list of denial risk flags, " +
  "identify the exact verbatim phrase or sentence in the letter that each flag corresponds to. " +
  "If a flag refers to something MISSING from the letter (i.e., content that should be there but isn't), " +
  "return null for that flag's anchorText. " +
  "Return ONLY valid JSON. No markdown, no backticks. Format: " +
  '{ "anchors": [ { "flagIndex": 0, "anchorText": "exact phrase from letter or null" } ] }';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await lightRateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const supabase = createSupabaseAuthServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
    }

    const body = (await request.json()) as { letter?: string; flags?: string[] };
    if (!body?.letter || !Array.isArray(body.flags) || body.flags.length === 0) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const { letter, flags } = body;
    const { redacted: redactedLetter, map: letterPhiMap } = deidentify(letter);
    assertDeidentified(redactedLetter, letterPhiMap, "anchor-flags");
    const userMessage = `Letter:\n${redactedLetter}\n\nFlags:\n${flags.map((f, i) => `${i}: ${f}`).join("\n")}`;

    let anchors: { flagIndex: number; anchorText: string | null }[];
    try {
      const raw = await callAnthropicWithRetry({
        system: SYSTEM_PROMPT,
        prompt: userMessage,
        maxTokens: 1000,
        useStructuredOutput: true,
      });
      const parsed = JSON.parse(raw) as { anchors?: unknown };
      const rawAnchors = parsed.anchors;
      const isValidAnchors =
        Array.isArray(rawAnchors) &&
        rawAnchors.every(
          (a): a is { flagIndex: number; anchorText: string | null } =>
            typeof a === "object" &&
            a !== null &&
            typeof (a as Record<string, unknown>).flagIndex === "number" &&
            ((a as Record<string, unknown>).anchorText === null ||
              typeof (a as Record<string, unknown>).anchorText === "string")
        );
      if (!isValidAnchors) {
        throw new Error("Model response did not match the expected anchors shape.");
      }
      // The model quotes anchorText verbatim from the REDACTED letter it was
      // given, so a quote overlapping a placeholder token (e.g. containing
      // "[PATIENT_NAME]") must be reidentified before it's returned — otherwise
      // it can never match the un-redacted letter the client displays. See C5
      // in AUDIT-FINDINGS.md.
      anchors = reidentifyDeep(rawAnchors, letterPhiMap);
    } catch (err) {
      console.error("[anchor-flags] Anchor generation failed, falling back to no anchors:", err);
      anchors = flags.map((_, i) => ({ flagIndex: i, anchorText: null }));
    }

    return NextResponse.json({ anchors });
  } catch (error) {
    if (error instanceof DeidVerificationError) {
      await captureEvent({
        distinctId: "server",
        event: "deid_verification_failed",
        properties: { seam: error.seam, route: "anchor-flags", categories: error.categories, leak_count: error.leakCount },
      });
      return NextResponse.json(
        { error: "DEID_VERIFICATION_FAILED", categories: error.categories },
        { status: 422 }
      );
    }
    console.error("[anchor-flags] POST handler error:", error);
    return NextResponse.json({ error: "Unable to anchor flags. Please try again." }, { status: 500 });
  }
}
