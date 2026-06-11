import { NextResponse } from "next/server";
import type { ExtractedChartDataWithValidation } from "@/lib/types";
import { rateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await rateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured. Add it before generating a packet." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      extracted?: ExtractedChartDataWithValidation;
      factor?: string;
    };

    if (!body?.extracted || !body.factor) {
      return NextResponse.json({ error: "Missing chart context or factor name." }, { status: 400 });
    }

    const content = await callAnthropicWithRetry({
      system: "You are a clinical documentation assistant.",
      prompt: `Based on this patient chart context: ${JSON.stringify(
        body.extracted
      )}, suggest a clinically appropriate value for the missing field: ${body.factor}. Return only the suggested value as a short plain text string, no explanation.`,
      maxTokens: 200
    });

    return NextResponse.json({ suggestion: content.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate a suggestion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
