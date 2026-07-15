import { NextResponse } from "next/server";
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  TextRun
} from "docx";
import { formatLetterDate } from "@/lib/letter-placeholders";
import { lightRateLimiter } from "@/lib/rate-limit";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { verifySourceLock } from "@/lib/pa-pipeline";
import type { ExtractedChartData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disclaimer =
  "This document was AI-assisted and must be reviewed and approved by a licensed provider before submission.";

type ExportRequest = {
  extracted?: ExtractedChartData;
  letter?: string;
  cptCode?: string;
  payerName?: string;
  providerName?: string;
  practiceName?: string;
  letterDate?: string;
  reviewConfirmed?: boolean;
};

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

    const body = (await request.json()) as ExportRequest;

    if (!body.extracted || !body.letter || !body.cptCode) {
      return NextResponse.json({ error: "Letter, extracted chart data, and CPT code are required." }, { status: 400 });
    }

    // Server-side enforcement of the two gates the review UI otherwise only
    // enforced client-side (disabled Download button) — a direct POST here
    // must not be able to bypass either. Recomputes SOURCE LOCK itself rather
    // than trusting a client-supplied sourceLockWarning, which a scripted
    // caller could just send as `[]`. letterDate is the letter's own dateline
    // (round-tripped from generation/regeneration, see FinalizeLetterResult
    // in lib/pa-pipeline.ts) — required so the letter's dateline itself isn't
    // misflagged as an ungrounded date.
    if (!body.letterDate) {
      return NextResponse.json({ error: "Missing letter date; cannot verify this letter for export." }, { status: 400 });
    }

    const sourceLockWarning = verifySourceLock(body.letter, body.extracted, body.letterDate);
    if (sourceLockWarning.length > 0) {
      return NextResponse.json(
        { error: "This letter has unresolved SOURCE LOCK warnings and cannot be exported until it is regenerated or corrected." },
        { status: 400 }
      );
    }

    if (body.reviewConfirmed !== true) {
      return NextResponse.json(
        { error: "This letter must be confirmed as reviewed against the source chart before it can be exported." },
        { status: 400 }
      );
    }

    const patientName = body.extracted.patient_name ?? "Patient name not documented";
    const practiceName = body.practiceName?.trim() || "";
    const generatedDate = formatLetterDate(new Date());
    const providerName = body.providerName?.trim() || "Requesting provider not documented";
    const payerName = body.payerName?.trim() || "Payer not specified";
    const letterBody = stripLetterHeading(body.letter);

    const document = new Document({
      sections: [
        {
          footers: {
            default: disclaimerFooter()
          },
          children: [
            ...coverPage({
              practiceName,
              patientName,
              generatedDate,
              cptCode: body.cptCode,
              providerName,
              payerName
            }),
            new Paragraph({ children: [new PageBreak()] }),
            ...letterParagraphs(letterBody),
            new Paragraph({ children: [new PageBreak()] }),
            ...checklistPage(body.extracted)
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(document);
    const filename = buildFilename(patientName, body.cptCode);

    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error("Export PA packet failed:", error);
    return NextResponse.json({ error: "Unable to export the PA packet." }, { status: 500 });
  }
}

function coverPage(details: {
  practiceName: string;
  patientName: string;
  generatedDate: string;
  cptCode: string;
  providerName: string;
  payerName: string;
}) {
  return [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({ text: "Prior Authorization Packet", bold: true, size: 40 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [new TextRun({ text: details.practiceName, size: 28 })]
    }),
    labeledLine("Practice Name", details.practiceName),
    labeledLine("Patient Name", details.patientName),
    labeledLine("Date", details.generatedDate),
    labeledLine("Procedure CPT Code", details.cptCode),
    labeledLine("Requesting Provider", details.providerName),
    labeledLine("Insurance Payer", details.payerName)
  ];
}

function stripLetterHeading(letter: string): string {
  // Remove "Letter of Medical Necessity" heading wherever it appears in the text,
  // not just the first line. The docx packer adds its own HEADING_1, so any
  // occurrence in the raw letter text would create a duplicate heading.
  return letter
    .split(/\r?\n/)
    .filter((line) => !/^[#*\s]*letter of medical necessity[#*\s]*$/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function letterParagraphs(letter: string) {
  const paragraphs = letter
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
      children: [new TextRun("Letter of Medical Necessity")]
    }),
    ...paragraphs.map((paragraph) => paragraphToParagraph(paragraph))
  ];
}

function paragraphToParagraph(paragraph: string) {
  const lines = paragraph.split("\n");
  return new Paragraph({
    spacing: { after: 240 },
    children: lines.map(
      (line, index) => new TextRun({ text: line, size: 24, break: index > 0 ? 1 : undefined })
    )
  });
}

function checklistPage(extracted: ExtractedChartData) {
  const items: { label: string; missing: boolean }[] = [
    { label: "Authorization form attached", missing: true },
    {
      label: "Imaging reports attached",
      missing: extracted.imaging_findings === null
    },
    {
      label: "PT/conservative care notes attached",
      missing: (extracted.conservative_treatments_attempted ?? []).length === 0
    },
    { label: "Operative report attached (if applicable)", missing: true }
  ];

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 360 },
      children: [new TextRun("Submission Checklist")]
    }),
    ...items.map(
      (item) =>
        new Paragraph({
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: `${item.missing ? "Pending" : "✓ Included"}: ${item.label}`,
              size: 24,
              bold: item.missing,
              color: item.missing ? "CC0000" : "000000"
            })
          ]
        })
    )
  ];
}

function labeledLine(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: `${label}: `, bold: true, size: 24 }), new TextRun({ text: value, size: 24 })]
  });
}

function disclaimerFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: "Orthren", size: 18, bold: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: disclaimer, size: 18, italics: true })]
      })
    ]
  });
}

function buildFilename(patientName: string, cptCode: string) {
  const safePatient = patientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "patient";
  return `${safePatient}-pa-packet-cpt-${cptCode}.docx`;
}
