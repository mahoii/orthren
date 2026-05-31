import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

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

    // Construct record — No Patient Name, No DOB to ensure zero PHI storage
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      cptCode: cptCode.trim(),
      payerName: payerName.trim(),
      outcome,
      denialReason: outcome === "denied" ? (denialReason?.trim() || null) : null,
      paScore,
    };

    // Store in Upstash Redis list "pa_outcomes"
    await redis.lpush("pa_outcomes", JSON.stringify(record));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
