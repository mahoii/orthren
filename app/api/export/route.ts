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
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportRequest;

    if (!body.extracted || !body.letter || !body.cptCode) {
      return NextResponse.json({ error: "Letter, extracted chart data, and CPT code are required." }, { status: 400 });
    }

    const patientName = body.extracted.patient_name ?? "[REQUIRES PHYSICIAN REVIEW]";
    const practiceName = body.practiceName?.trim() || "Orthopedic Practice";
    const generatedDate = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(new Date());

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
              providerName: body.providerName ?? "[REQUIRES PHYSICIAN REVIEW]",
              payerName: body.payerName ?? "[REQUIRES PHYSICIAN REVIEW]"
            }),
            new Paragraph({ children: [new PageBreak()] }),
            ...letterParagraphs(body.letter),
            new Paragraph({ children: [new PageBreak()] }),
            ...checklistPage()
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
  } catch {
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
    ...paragraphs.map(
      (paragraph) =>
        new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: paragraph, size: 24 })]
        })
    )
  ];
}

function checklistPage() {
  const items = [
    "Authorization form attached",
    "Imaging reports attached",
    "PT/conservative care notes attached",
    "Operative report attached (if applicable)"
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
          children: [new TextRun({ text: `[ ] ${item}`, size: 24 })]
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
        children: [new TextRun({ text: disclaimer, size: 18, italics: true })]
      })
    ]
  });
}

function buildFilename(patientName: string, cptCode: string) {
  const safePatient = patientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "patient";
  return `${safePatient}-pa-packet-cpt-${cptCode}.docx`;
}
