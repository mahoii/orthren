import { NextResponse } from "next/server";
import type { ExtractedChartDataWithValidation } from "@/lib/types";
import { rateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";
import { SAMPLE_PATIENT_NAMES } from "@/lib/sample-charts";
import sampleFixCache from "@/lib/sample-fix-cache.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Type the imported cache so TypeScript is happy with dynamic key access.
type FixCache = Record<string, Record<string, string>>;
const cache = sampleFixCache as FixCache;

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await rateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const body = (await request.json()) as {
      extracted?: ExtractedChartDataWithValidation;
      factor?: string;
    };

    if (!body?.extracted || !body.factor) {
      return NextResponse.json({ error: "Missing chart context or factor name." }, { status: 400 });
    }

    // ── Cache check: return pre-generated suggestion for sample/demo charts ──
    const patientName = body.extracted.patient_name ?? "";
    if (SAMPLE_PATIENT_NAMES.has(patientName)) {
      const cached = cache[patientName]?.[body.factor];
      if (cached) {
        return NextResponse.json({ suggestion: cached });
      }
      // Factor not in cache — fall through to live call (edge case during development).
    }

    // ── Live path: non-sample chart ──────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured. Add it before generating a packet." },
        { status: 500 }
      );
    }

    // Strip patient identity fields — the suggestion only needs clinical evidence, not demographics.
    const { patient_name, date_of_birth, ...clinicalContext } = body.extracted;
    void patient_name; void date_of_birth;

    const content = await callAnthropicWithRetry({
      system: "You are a clinical documentation assistant.",
      prompt: `Based on this patient chart context: ${JSON.stringify(
        clinicalContext
      )}, suggest a clinically appropriate value for the missing field: ${body.factor}. Return only the suggested value as a short plain text string, no explanation.`,
      maxTokens: 200
    });

    return NextResponse.json({ suggestion: content.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate a suggestion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
