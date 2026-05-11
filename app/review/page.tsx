"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ExtractedChartData, GeneratePaResponse } from "@/lib/types";

type ReviewData = GeneratePaResponse & {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName?: string;
};

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [letter, setLetter] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("pa-review-data");

    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as ReviewData;
      setData(parsed);
      setLetter(parsed.letter);
    } catch {
      sessionStorage.removeItem("pa-review-data");
    }
  }, []);

  const missingFields = useMemo(() => (data ? findMissingFields(data.extracted) : []), [data]);

  async function handleDownload() {
    if (!data) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          extracted: data.extracted,
          letter,
          cptCode: data.cptCode,
          payerName: data.payerName,
          providerName: data.providerName,
          practiceName: data.practiceName
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to export the PA packet.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildDownloadName(data.extracted.patient_name, data.cptCode);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to export the PA packet.");
    } finally {
      setIsDownloading(false);
    }
  }

  if (!data) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#F8F9FB] px-6">
        <div className="max-w-md rounded-lg border border-clinical-line p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-clinical-navy">No packet ready for review</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Generate a packet from a chart PDF first. Patient data is not stored after this browser session.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-blue"
          >
            Back to upload
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB]">
      <header className="border-b border-clinical-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-clinical-blue">Review packet</p>
            <h1 className="mt-1 text-2xl font-semibold text-clinical-navy">Letter of Medical Necessity</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="rounded-md border border-clinical-line px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              New upload
            </Link>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="rounded-md bg-clinical-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-blue disabled:bg-slate-300"
            >
              {isDownloading ? "Preparing..." : "Download PA Packet"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6 rounded-lg border border-[#E2E8F0] bg-white p-5">
          <section>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-clinical-navy">Chart data we found</h2>
              {missingFields.length ? <WarningBadge>{missingFields.length} missing</WarningBadge> : null}
            </div>
            <div className="mt-5 space-y-4">
              <DataRow label="Patient name" value={data.extracted.patient_name} />
              <DataRow label="Date of birth" value={data.extracted.date_of_birth} />
              <DataRow label="Diagnosis codes" value={data.extracted.diagnosis_codes} />
              <DataRow label="Primary complaint" value={data.extracted.primary_complaint} />
              <DataRow label="Symptom duration" value={data.extracted.symptom_duration} />
              <DataRow label="Requested procedure" value={data.extracted.requested_procedure} />
              <DataRow label="Surgical approach" value={data.extracted.surgical_approach_if_mentioned} />
              <DataRow
                label="Imaging findings"
                value={
                  data.extracted.imaging_findings
                    ? `${data.extracted.imaging_findings.modality ?? "Unknown modality"}: ${
                        data.extracted.imaging_findings.key_findings ?? "Missing findings"
                      }`
                    : null
                }
              />
              <DataRow label="Functional limitations" value={data.extracted.functional_limitations} />
              <Treatments treatments={data.extracted.conservative_treatments_attempted} />
            </div>
          </section>

          <section className="rounded-lg border border-red-200 border-l-4 border-l-[#EF4444] bg-[#FEF2F2] p-5">
            <h2 className="text-base font-semibold text-red-900">Denial Risk</h2>
            {data.extracted.denial_risk_flags.length ? (
              <ul className="mt-4 space-y-3">
                {data.extracted.denial_risk_flags.map((flag) => (
                  <li
                    key={flag}
                    className="flex gap-3 rounded-md border border-red-100 bg-white px-3 py-3 text-sm leading-5 text-red-800 shadow-sm"
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-[#EF4444]"
                      aria-hidden="true"
                    >
                      !
                    </span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-red-800">No denial risk flags were returned from extraction.</p>
            )}
          </section>
        </aside>

        <section className="rounded-lg border border-clinical-line bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-clinical-line pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-clinical-navy">Editable letter draft</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review and revise before downloading. The exported document includes the required AI-assisted disclaimer.
              </p>
            </div>
            <p className="text-sm font-medium text-slate-500">CPT {data.cptCode}</p>
          </div>
          {downloadError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {downloadError}
            </div>
          ) : null}
          <textarea
            value={letter}
            onChange={(event) => setLetter(event.target.value)}
            className="mt-5 min-h-[680px] w-full resize-y rounded-md border border-clinical-line bg-white p-4 text-base leading-7 text-slate-900 outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
            style={{ fontFamily: "Georgia, serif" }}
          />
        </section>
      </div>
    </main>
  );
}

function DataRow({ label, value }: { label: string; value: string | string[] | null }) {
  const isMissing = value === null || (Array.isArray(value) && value.length === 0);

  return (
    <div className="border-l-2 border-clinical-navy py-1 pl-3">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">{label}</dt>
        {isMissing ? <WarningBadge>Missing</WarningBadge> : null}
      </div>
      <dd className="mt-1 text-sm leading-6 text-slate-800">
        {Array.isArray(value) ? (value.length ? value.join("; ") : "Not found") : value ?? "Not found"}
      </dd>
    </div>
  );
}

function Treatments({ treatments }: { treatments: ExtractedChartData["conservative_treatments_attempted"] }) {
  return (
    <div className="border-l-2 border-clinical-navy py-1 pl-3">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">Conservative treatments</dt>
        {treatments.length === 0 ? <WarningBadge>Missing</WarningBadge> : null}
      </div>
      {treatments.length ? (
        <div className="mt-2 space-y-2">
          {treatments.map((treatment, index) => (
            <div key={`${treatment.treatment}-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm leading-6">
              {treatment.treatment ? (
                <p className="font-bold text-slate-800">{treatment.treatment}</p>
              ) : (
                <p className="font-semibold italic text-slate-400">Unknown Treatment</p>
              )}
              <p className="text-slate-600">Duration: {treatment.duration ?? "Not found"}</p>
              <p className="text-slate-600">Dates: {treatment.dates ?? "Not found"}</p>
              <div className="mt-1 flex items-center gap-2 text-slate-600">
                <span>Outcome:</span>
                <OutcomeBadge outcome={treatment.outcome} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <dd className="mt-1 text-sm text-slate-800">Not found</dd>
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const label = outcome ?? "Not found";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getOutcomeBadgeClass(outcome)}`}>
      {label}
    </span>
  );
}

function getOutcomeBadgeClass(outcome: string | null) {
  const normalizedOutcome = outcome?.toLowerCase() ?? "";

  if (normalizedOutcome.includes("improved")) {
    return "bg-green-100 text-green-700";
  }

  if (normalizedOutcome.includes("failed")) {
    return "bg-red-100 text-red-700";
  }

  if (normalizedOutcome.includes("partial relief")) {
    return "bg-yellow-100 text-yellow-800";
  }

  return "bg-slate-100 text-slate-600";
}

function WarningBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">{children}</span>;
}

function findMissingFields(extracted: ExtractedChartData) {
  const missing: string[] = [];
  const fields: Array<[string, string | string[] | null]> = [
    ["patient_name", extracted.patient_name],
    ["date_of_birth", extracted.date_of_birth],
    ["diagnosis_codes", extracted.diagnosis_codes],
    ["primary_complaint", extracted.primary_complaint],
    ["symptom_duration", extracted.symptom_duration],
    ["functional_limitations", extracted.functional_limitations],
    ["requested_procedure", extracted.requested_procedure],
    ["surgical_approach_if_mentioned", extracted.surgical_approach_if_mentioned]
  ];

  fields.forEach(([field, value]) => {
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      missing.push(field);
    }
  });

  if (!extracted.imaging_findings?.modality || !extracted.imaging_findings.key_findings) {
    missing.push("imaging_findings");
  }

  if (!extracted.conservative_treatments_attempted.length) {
    missing.push("conservative_treatments_attempted");
  }

  return missing;
}

function buildDownloadName(patientName: string | null, cptCode: string) {
  const safePatient = (patientName ?? "patient").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${safePatient}-pa-packet-cpt-${cptCode}.docx`;
}
