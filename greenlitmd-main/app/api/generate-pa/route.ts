import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { rateLimiter } from "@/lib/rate-limit";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { validateExtraction } from "@/lib/extractionValidator";
import { serverPosthog } from "@/lib/posthog";
import {
  extractChartDataFromText,
  generateLetterFromExtraction,
  type RequestDetails,
} from "@/lib/pa-pipeline";
import { getPayerRule, normalizePayerName, buildPayerInjectionBlock } from "@/lib/payer-rules";
import type { ConservativeTreatment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxUploadSizeBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const startTime = Date.now();
  let stage: "extraction" | "narrative" = "extraction";
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const { success } = await rateLimiter.limit(ip);
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured. Add it before generating a packet." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const chart = formData.get("chart");
    const cptCode = stringField(formData.get("cptCode"));
    const payerName = stringField(formData.get("payerName"));
    const providerName = stringField(formData.get("providerName"));
    const practiceName = stringField(formData.get("practiceName"));

    if (!(chart instanceof File)) {
      return NextResponse.json({ error: "Upload a chart file before generating the packet." }, { status: 400 });
    }

    if (chart.size > maxUploadSizeBytes) {
      return NextResponse.json({ error: "File too large. Please upload a file under 10MB." }, { status: 400 });
    }

    if (!cptCode || !payerName || !providerName) {
      return NextResponse.json({ error: "CPT code, payer name, and provider name are required." }, { status: 400 });
    }

    let chartText: string;
    try {
      chartText = await extractChartText(chart);
    } catch (error) {
      console.error("[generate-pa] File extraction failed:", error);
      return NextResponse.json(
        { error: "The provided medical chart document could not be accurately parsed. Please verify the file integrity and try again." },
        { status: 400 }
      );
    }

    const requestDetails: RequestDetails = { cptCode, payerName, providerName, practiceName };

    const normalizedPayer = normalizePayerName(payerName);
    const payerRule = normalizedPayer ? getPayerRule(normalizedPayer, cptCode) : null;
    // Unvalidated rules are informational only — the Claude call must never see
    // research-sourced payer criteria that haven't been confirmed against a
    // primary source, and generic (non-payer-specific) letter language is used
    // instead. See lib/payer-rules.ts validation gate.
    const usedUnvalidatedPayerRule = payerRule !== null && payerRule.validation_status !== "validated";
    const payerInjectionBlock =
      payerRule && payerRule.validation_status === "validated" ? buildPayerInjectionBlock(payerRule) : null;

    const { _phiMap, ...extracted } = await extractChartDataFromText(chartText, requestDetails);

    const discrepancies = await validateExtraction(chartText, extracted as Record<string, unknown>);
    const extractedWithWarnings = extracted as typeof extracted & { extraction_warnings?: string[] };
    if (discrepancies.length > 0) {
      extractedWithWarnings.extraction_warnings = discrepancies;
    }

    // Payer-specific PA Strength adjustment: penalize conservative-care duration
    // when documented PT falls short of the payer's minimum weeks threshold.
    // Gated on validation_status — an unvalidated (research-sourced, unconfirmed)
    // rule must not move the score away from what generic criteria would produce.
    if (payerRule && payerRule.validation_status === "validated" && extractedWithWarnings.pa_strength) {
      const ptReq = payerRule.conservative_treatment_requirements.find((r) =>
        r.treatment.toLowerCase().includes("physical therapy")
      );
      if (ptReq) {
        const requiredWeeks = parseMinimumWeeks(ptReq.minimum_duration);
        const actualWeeks = parsePtWeeksFromExtracted(extractedWithWarnings.conservative_treatments_attempted);
        if (requiredWeeks > 0 && actualWeeks > 0 && actualWeeks < requiredWeeks) {
          extractedWithWarnings.pa_strength.conservative_treatment_duration = {
            score: 0,
            note: `${payerRule.payer_name} requires ≥${requiredWeeks} weeks PT. Chart shows ${actualWeeks} week${actualWeeks === 1 ? "" : "s"}.`,
          };
        }
      }
    }

    stage = "narrative";
    const letter = await generateLetterFromExtraction(extractedWithWarnings, requestDetails, _phiMap, payerInjectionBlock);

    const paScore = extractedWithWarnings.pa_strength
      ? Object.values(extractedWithWarnings.pa_strength).reduce((sum, f) => sum + ((f as any)?.score ?? 0), 0)
      : null;
    serverPosthog.capture({
      distinctId: user.id,
      event: "pa_generation_succeeded",
      properties: {
        cpt_code: cptCode,
        payer: payerName,
        duration_ms: Date.now() - startTime,
        hard_block_count: extractedWithWarnings.validation.hard_blocks.length,
        pa_score: paScore,
      },
    });

    return NextResponse.json({ extracted: extractedWithWarnings, letter, payerRule, usedUnvalidatedPayerRule });
  } catch (error) {
    console.error("[generate-pa] POST handler error:", error);
    serverPosthog.capture({
      distinctId: "server",
      event: "pa_generation_failed",
      properties: {
        error: error instanceof Error ? error.message : String(error),
        stage,
      },
    });
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function extractPdfText(chart: File) {
  if (chart.type !== "application/pdf" && !chart.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a valid PDF chart.");
  }

  try {
    const buffer = Buffer.from(await chart.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text = parsed.text.trim();

    if (!text) {
      throw new Error("The PDF did not contain readable chart text. Please upload a text-based PDF.");
    }

    return text;
  } catch (error) {
    console.error("[generate-pa] extractPdfText error:", error);
    if (error instanceof Error && error.message.includes("readable chart text")) {
      throw error;
    }

    throw new Error("We could not read this PDF. Please upload a clear, text-based patient chart PDF.");
  }
}

async function extractDocxText(chart: File) {
  const isDocx =
    chart.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    chart.name.toLowerCase().endsWith(".docx");

  if (!isDocx) {
    throw new Error("Only PDF and DOCX files are supported");
  }

  try {
    const buffer = Buffer.from(await chart.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error("[generate-pa] extractDocxText error:", error);
    throw new Error(
      "Could not read the DOCX file. Please ensure it is not password protected and try again."
    );
  }
}

async function extractChartText(chart: File) {
  const lowerName = chart.name.toLowerCase();
  const isPdf = chart.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isDocx =
    chart.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx");
  const isTxt = chart.type === "text/plain" || lowerName.endsWith(".txt");

  if (!isPdf && !isDocx && !isTxt) {
    throw new Error("Only PDF, DOCX, and TXT files are supported");
  }

  let text: string;

  if (isPdf) {
    text = await extractPdfText(chart);
  } else if (isDocx) {
    text = await extractDocxText(chart);
  } else {
    text = await chart.text();
  }

  if (text.length < 100) {
    throw new Error("The uploaded file appears to be empty or unreadable. Please try a different file.");
  }

  return text;
}

// Parse a payer minimum-duration string ("≥6 weeks", "3 months", "≥12 weeks per InterQual")
// into an integer number of weeks. Returns 0 when no week/month quantity is present
// (e.g. "Documented attempt"), which safely skips the score penalty.
function parseMinimumWeeks(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/(\d+(?:\.\d+)?)\s*(week|month)/i);
  if (!match) return 0;
  const qty = parseFloat(match[1]);
  if (!isFinite(qty)) return 0;
  const weeks = match[2].toLowerCase().startsWith("month") ? qty * 4.33 : qty;
  return Math.round(weeks);
}

// Find documented physical-therapy treatments in the extracted chart data and return
// the largest parsed week count (most favorable to the provider). Returns 0 when no
// PT is documented or its duration cannot be parsed into weeks.
function parsePtWeeksFromExtracted(treatments: ConservativeTreatment[]): number {
  if (!Array.isArray(treatments)) return 0;
  let maxWeeks = 0;
  for (const t of treatments) {
    const name = (t?.treatment ?? "").toLowerCase();
    const isPt = name.includes("physical therapy") || /\bpt\b/.test(name);
    if (!isPt) continue;
    const weeks = parseMinimumWeeks(t?.duration ?? "");
    if (weeks > maxWeeks) maxWeeks = weeks;
  }
  return maxWeeks;
}
