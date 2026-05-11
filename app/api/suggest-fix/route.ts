import { NextResponse } from "next/server";
import type { ExtractedChartDataWithValidation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured. Add it before generating a packet." },
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

    const content = await callGroq({
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

async function callGroq({
  system,
  prompt
}: {
  system: string;
  prompt: string;
}) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API request failed. ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("Groq did not return a usable response.");
  }

  return text;
}
