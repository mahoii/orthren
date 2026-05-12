import { NextResponse } from "next/server";
import type { ExtractedChartDataWithValidation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const anthropicModel = "claude-sonnet-4-6";

export async function POST(request: Request) {
  try {
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

    const content = await callAnthropic({
      system: "You are a clinical documentation assistant.",
      prompt: `Based on this patient chart context: ${JSON.stringify(
        body.extracted
      )}, suggest a clinically appropriate value for the missing field: ${body.factor}. Return only the suggested value as a short plain text string, no explanation.`
    });

    return NextResponse.json({ suggestion: content.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate a suggestion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callAnthropic({
  system,
  prompt
}: {
  system: string;
  prompt: string;
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API request failed. ${text}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Anthropic did not return a usable response.");
  }

  return text;
}
