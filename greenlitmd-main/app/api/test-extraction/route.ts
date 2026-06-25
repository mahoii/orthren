import { NextResponse } from "next/server";
import { extractChartDataFromText, type RequestDetails } from "@/lib/pa-pipeline";
import { compareExtractionToFixture, summarizeComparison, type FixtureSpec } from "@/lib/fixtures/compare";
import cleanTkaFixture from "@/lib/fixtures/clean-tka.json";
import messyRotatorFixture from "@/lib/fixtures/messy-rotator-cuff.json";
import incompleteLumbarFixture from "@/lib/fixtures/incomplete-lumbar-fusion.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURES: Record<string, FixtureSpec> = {
  "clean-tka": cleanTkaFixture as FixtureSpec,
  "messy-rotator-cuff": messyRotatorFixture as FixtureSpec,
  "incomplete-lumbar-fusion": incompleteLumbarFixture as FixtureSpec,
};

function requireAdmin(request: Request): boolean {
  const secret = request.headers.get("x-admin-secret");
  return !!process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET;
}

export async function POST(request: Request) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let chartText: string;
  let requestDetails: RequestDetails;
  let fixtureId: string | undefined;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const chartField = formData.get("chartText");
    chartText = typeof chartField === "string" ? chartField : await (formData.get("chart") as File)?.text() ?? "";
    requestDetails = {
      cptCode: String(formData.get("cptCode") ?? ""),
      payerName: String(formData.get("payerName") ?? ""),
      providerName: String(formData.get("providerName") ?? ""),
      practiceName: String(formData.get("practiceName") ?? ""),
    };
    fixtureId = formData.get("fixtureId") ? String(formData.get("fixtureId")) : undefined;
  } else {
    const body = await request.json() as {
      chartText: string;
      cptCode?: string;
      payerName?: string;
      providerName?: string;
      practiceName?: string;
      fixtureId?: string;
    };
    chartText = body.chartText ?? "";
    requestDetails = {
      cptCode: body.cptCode ?? "",
      payerName: body.payerName ?? "",
      providerName: body.providerName ?? "",
      practiceName: body.practiceName ?? "",
    };
    fixtureId = body.fixtureId;
  }

  if (!chartText || chartText.trim().length < 50) {
    return NextResponse.json({ error: "chartText is required (min 50 chars)" }, { status: 400 });
  }

  const { _phiMap, ...extraction } = await extractChartDataFromText(chartText, requestDetails);

  const response: Record<string, unknown> = { extraction };

  if (fixtureId) {
    const fixture = FIXTURES[fixtureId];
    if (!fixture) {
      response.fixture_warning = `Unknown fixtureId "${fixtureId}". Valid values: ${Object.keys(FIXTURES).join(", ")}`;
    } else {
      const results = compareExtractionToFixture(extraction as any, fixture);
      response.comparison = {
        fixture: fixtureId,
        ...summarizeComparison(results),
        results,
      };
    }
  }

  return NextResponse.json(response);
}

export async function GET(request: Request) {
  if (!requireAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    usage: "POST with JSON body: { chartText, cptCode, payerName, providerName, practiceName, fixtureId? }",
    fixtures: Object.entries(FIXTURES).map(([id, f]) => ({
      id,
      patient: f._meta.patient,
      scenario: f._meta.scenario,
      chart: f._meta.chart,
    })),
  });
}
