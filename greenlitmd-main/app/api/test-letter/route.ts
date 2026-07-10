import { NextResponse } from "next/server";
import { generateLetterFromExtraction, type RequestDetails } from "@/lib/pa-pipeline";
import type { ExtractedChartData } from "@/lib/types";
import { adminRateLimiter } from "@/lib/rate-limit";
import { isValidAdminSecret } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const { success } = await adminRateLimiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  if (!isValidAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    extraction: ExtractedChartData & { validation?: any };
    cptCode?: string;
    payerName?: string;
    providerName?: string;
    practiceName?: string;
  };

  if (!body.extraction) {
    return NextResponse.json({ error: "extraction object is required" }, { status: 400 });
  }

  const requestDetails: RequestDetails = {
    cptCode: body.cptCode ?? "",
    payerName: body.payerName ?? "",
    providerName: body.providerName ?? "",
    practiceName: body.practiceName ?? "",
  };

  // phiMap is empty since this path accepts pre-extracted data with no PHI tokens to swap
  const { letter, sourceLockWarning } = await generateLetterFromExtraction(body.extraction, requestDetails, {});

  return NextResponse.json({ letter, sourceLockWarning });
}

export async function GET(request: Request) {
  if (!isValidAdminSecret(request.headers.get("x-admin-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    usage: "POST with JSON body: { extraction: <ExtractedChartData>, cptCode, payerName, providerName, practiceName }",
    note: "Bypasses file parsing and extraction — runs letter generation only on known-good extraction JSON.",
  });
}
