import { NextResponse } from "next/server";
import { rateLimiter } from "@/lib/rate-limit";
import { callAnthropicWithRetry } from "@/lib/anthropic";

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
    const { success } = await rateLimiter.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
    }

    const body = (await request.json()) as { letter?: string; flags?: string[] };
    if (!body?.letter || !Array.isArray(body.flags) || body.flags.length === 0) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const { letter, flags } = body;
    const userMessage = `Letter:\n${letter}\n\nFlags:\n${flags.map((f, i) => `${i}: ${f}`).join("\n")}`;

    let anchors: { flagIndex: number; anchorText: string | null }[];
    try {
      const raw = await callAnthropicWithRetry({
        system: SYSTEM_PROMPT,
        prompt: userMessage,
        maxTokens: 1000,
        useStructuredOutput: true,
      });
      const parsed = JSON.parse(raw) as { anchors: { flagIndex: number; anchorText: string | null }[] };
      anchors = parsed.anchors;
    } catch {
      anchors = flags.map((_, i) => ({ flagIndex: i, anchorText: null }));
    }

    return NextResponse.json({ anchors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to anchor flags.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
