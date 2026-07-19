import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { lightRateLimiter } from "@/lib/rate-limit";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { deidentify } from "@/lib/deidentify";
import { assertDeidentified, DeidVerificationError } from "@/lib/deid-verify";
import { captureEvent } from "@/lib/posthog";

const MAX_DENIAL_REASON_LENGTH = 5000;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const runtime = "nodejs";

interface FeedbackPayload {
  cptCode: string;
  payerName: string;
  outcome: "approved" | "denied" | "pending";
  denialReason?: string | null;
  paScore: number;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await lightRateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const supabase = createSupabaseAuthServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as FeedbackPayload;
    const { cptCode, payerName, outcome, denialReason, paScore } = body;

    // Validate required fields
    if (!cptCode || typeof cptCode !== "string") {
      return NextResponse.json({ error: "cptCode is required and must be a string" }, { status: 400 });
    }
    if (!payerName || typeof payerName !== "string") {
      return NextResponse.json({ error: "payerName is required and must be a string" }, { status: 400 });
    }
    if (!outcome || !["approved", "denied", "pending"].includes(outcome)) {
      return NextResponse.json({ error: "outcome must be 'approved', 'denied', or 'pending'" }, { status: 400 });
    }
    if (typeof paScore !== "number" || isNaN(paScore)) {
      return NextResponse.json({ error: "paScore is required and must be a number" }, { status: 400 });
    }
    if (denialReason != null && typeof denialReason !== "string") {
      return NextResponse.json({ error: "denialReason must be a string" }, { status: 400 });
    }
    if (denialReason && denialReason.length > MAX_DENIAL_REASON_LENGTH) {
      return NextResponse.json(
        { error: `denialReason must be ${MAX_DENIAL_REASON_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }

    // denialReason is clinician-pasted free text and routinely contains a
    // patient name/DOB/MRN copied straight out of a denial letter — it must
    // be de-identified before it's persisted, not just excluded from the
    // record's other fields. Previously this was stored verbatim under a
    // comment claiming "zero PHI storage." See A5 in AUDIT-FINDINGS.md.
    const trimmedReason = outcome === "denied" ? (denialReason?.trim() || null) : null;
    let redactedDenialReason: string | null = null;
    if (trimmedReason) {
      const { redacted, map } = deidentify(trimmedReason);
      assertDeidentified(redacted, map, "feedback.denialReason");
      redactedDenialReason = redacted;
    }

    // Construct record — No Patient Name, No DOB to ensure zero PHI storage
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      cptCode: cptCode.trim(),
      payerName: payerName.trim(),
      outcome,
      denialReason: redactedDenialReason,
      paScore,
    };

    // Store in Upstash Redis list "pa_outcomes"
    await redis.lpush("pa_outcomes", JSON.stringify(record));
    // lpush prepends, so index 0 is newest -- keep only the most recent
    // 10,000 entries so this list doesn't grow unbounded forever.
    await redis.ltrim("pa_outcomes", 0, 9999);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof DeidVerificationError) {
      await captureEvent({
        distinctId: "server",
        event: "deid_verification_failed",
        properties: { seam: error.seam, route: "feedback", categories: error.categories, leak_count: error.leakCount },
      });
      return NextResponse.json(
        { error: "DEID_VERIFICATION_FAILED", categories: error.categories },
        { status: 422 }
      );
    }
    console.error("[feedback] POST handler error:", error);
    return NextResponse.json({ error: "Unable to submit feedback. Please try again." }, { status: 500 });
  }
}
