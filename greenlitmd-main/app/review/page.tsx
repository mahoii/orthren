"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ExtractedChartData, ExtractedChartDataWithValidation, GeneratePaResponse } from "@/lib/types";



type ReviewData = GeneratePaResponse & {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName?: string;
  isDemo?: boolean;
};

type PaStrengthFactorKey = keyof ExtractedChartData["pa_strength"];

type ManualFix = {
  value: string;
  resolved: boolean;
  source: "manual" | "ai";
};

type ManualFixes = Partial<Record<PaStrengthFactorKey, ManualFix>>;

type Suggestions = Partial<Record<PaStrengthFactorKey, string>>;

type SuggestionLoading = Partial<Record<PaStrengthFactorKey, boolean>>;

type SidebarTab = "pa-score" | "chart-data" | "denial-risks";

const paStrengthWeights: Record<PaStrengthFactorKey, number> = {
  diagnosis_codes: 10,
  conservative_treatments_named: 20,
  conservative_treatment_duration: 10,
  imaging_findings: 15,
  functional_limitations: 15,
  surgical_approach: 10,
  cpt_code_valid: 10,
  symptom_duration: 10
};

const paStrengthFactors: Array<{
  key: PaStrengthFactorKey;
  label: string;
  placeholder: string;
}> = [
    {
      key: "diagnosis_codes",
      label: "Diagnosis Codes",
      placeholder: "e.g. M17.11, M16.12"
    },
    {
      key: "conservative_treatments_named",
      label: "Conservative Treatments Named",
      placeholder: "e.g. Physical therapy, NSAIDs"
    },
    {
      key: "conservative_treatment_duration",
      label: "Conservative Treatment Duration",
      placeholder: "e.g. 8 weeks of PT"
    },
    {
      key: "imaging_findings",
      label: "Imaging Findings",
      placeholder: "e.g. MRI: full thickness tear"
    },
    {
      key: "functional_limitations",
      label: "Functional Limitations",
      placeholder: "e.g. cannot climb stairs"
    },
    {
      key: "surgical_approach",
      label: "Surgical Approach",
      placeholder: "e.g. arthroscopic"
    },
    {
      key: "cpt_code_valid",
      label: "CPT Code Valid",
      placeholder: "e.g. 29827"
    },
    {
      key: "symptom_duration",
      label: "Symptom Duration",
      placeholder: "e.g. 6 months"
    }
  ];

/**
 * Maps each PA strength factor key to a list of keywords that will be
 * highlighted in the letter preview when that factor is being remediated.
 */
const factorKeywordMap: Record<PaStrengthFactorKey, string[]> = {
  diagnosis_codes: ["diagnosis", "ICD", "code", "condition"],
  conservative_treatments_named: ["conservative", "treatment", "therapy", "physical therapy", "NSAIDs", "medication"],
  conservative_treatment_duration: ["weeks", "months", "duration", "period", "course"],
  imaging_findings: ["MRI", "X-ray", "CT", "imaging", "findings", "scan", "radiograph"],
  functional_limitations: ["limitation", "unable", "cannot", "difficulty", "restricted", "impaired", "mobility"],
  surgical_approach: ["surgical", "arthroscopic", "open", "approach", "procedure", "operation"],
  cpt_code_valid: ["CPT", "procedure code"],
  symptom_duration: ["symptom", "pain", "complaint", "duration", "onset", "years", "months", "weeks"]
};

function getHighlightedLetter(letterText: string, factorKey: PaStrengthFactorKey): string {
  const keywords = factorKeywordMap[factorKey];
  if (!keywords.length) return letterText;

  // Build a regex that matches any keyword (case-insensitive, whole-word-ish)
  const pattern = keywords
    .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(`(${pattern})`, "gi");

  return letterText.replace(regex, "%%HIGHLIGHT_START%%$1%%HIGHLIGHT_END%%");
}

function SidebarTabButton({
  isActive,
  onClick,
  children
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${isActive
          ? "bg-clinical-navy text-white shadow-sm"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        }`}
    >
      {children}
    </button>
  );
}

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [letter, setLetter] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isScoreExpanded, setIsScoreExpanded] = useState(false);
  const [manualFixes, setManualFixes] = useState<ManualFixes>({});
  const [suggestions, setSuggestions] = useState<Suggestions>({});
  const [isSuggesting, setIsSuggesting] = useState<SuggestionLoading>({});
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [remediationIndex, setRemediationIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [animatedScorePercent, setAnimatedScorePercent] = useState(0);
  const [activeTab, setActiveTab] = useState<SidebarTab>("pa-score");
  const tabContentRef = useRef<HTMLDivElement>(null);
  const hasAnimatedScoreRef = useRef(false);
  const suggestionCardRef = useRef<HTMLDivElement>(null);

  // Derived: which factor key is active in remediation
  const remediationFactor =
    remediationIndex !== null ? paStrengthFactors[remediationIndex]?.key ?? null : null;

  useEffect(() => {
    if (remediationFactor && suggestions[remediationFactor]) {
      const timer = setTimeout(() => {
        suggestionCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [suggestions, remediationFactor]);

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
  const basePaStrength = data?.extracted.pa_strength;
  const paScore = useMemo(() => computePaStrengthScore(basePaStrength, manualFixes), [basePaStrength, manualFixes]);
  const hasAppliedFixes = useMemo(
    () => Object.values(manualFixes).some((fix) => fix?.resolved),
    [manualFixes]
  );
  const paScorePercent = Math.min(100, Math.max(0, (paScore / 10) * 100));
  const paScoreDescriptor = getScoreDescriptor(paScore);
  const scoreLabel = `${paScore.toFixed(1)} / 10`;

  useEffect(() => {
    if (!data) {
      return;
    }

    if (!hasAnimatedScoreRef.current) {
      setAnimatedScorePercent(0);
      const timeout = window.setTimeout(() => {
        setAnimatedScorePercent(paScorePercent);
        hasAnimatedScoreRef.current = true;
      }, 40);

      return () => window.clearTimeout(timeout);
    }

    setAnimatedScorePercent(paScorePercent);
  }, [data, paScorePercent]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    document.title = "Review PA Packet — Greenlit MD";
    return () => {
      document.title = "Greenlit MD";
    };
  }, []);

  // Scroll tab content area back to top when tab changes
  useEffect(() => {
    if (tabContentRef.current) {
      tabContentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  function updateManualFix(key: PaStrengthFactorKey, value: string, source: ManualFix["source"] = "manual") {
    const trimmed = value.trim();
    setManualFixes((current) => ({
      ...current,
      [key]: {
        value,
        resolved: Boolean(trimmed),
        source
      }
    }));
  }

  async function handleSuggestFix(key: PaStrengthFactorKey, label: string) {
    if (!data || isSuggesting[key]) {
      return;
    }

    setIsSuggesting((current) => ({ ...current, [key]: true }));
    setSuggestions((current) => ({ ...current, [key]: "" }));

    try {
      const response = await fetch("/api/suggest-fix", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          extracted: data.extracted,
          factor: label
        })
      });

      const payload = (await response.json()) as { suggestion?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to generate a suggestion.");
      }

      setSuggestions((current) => ({ ...current, [key]: payload.suggestion ?? "" }));
    } catch (error) {
      setSuggestions((current) => ({ ...current, [key]: "" }));
      setToast(error instanceof Error ? error.message : "Unable to generate a suggestion.");
    } finally {
      setIsSuggesting((current) => ({ ...current, [key]: false }));
    }
  }

  function handleApplySuggestion(key: PaStrengthFactorKey) {
    const suggestion = suggestions[key];
    if (!suggestion) {
      return;
    }

    updateManualFix(key, suggestion, "ai");
    setSuggestions((current) => ({ ...current, [key]: "" }));
  }

  function handleDismissSuggestion(key: PaStrengthFactorKey) {
    setSuggestions((current) => ({ ...current, [key]: "" }));
  }

  async function handleRegenerateLetter() {
    if (!data || isRegenerating) {
      return;
    }

    setIsRegenerating(true);
    try {
      const { updatedExtracted, updatedRequestDetails } = buildUpdatedPayload(data, manualFixes);
      const response = await fetch("/api/regenerate-letter", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          extracted: updatedExtracted,
          requestDetails: updatedRequestDetails
        })
      });

      const payload = (await response.json()) as { letter?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to regenerate the letter.");
      }

      if (payload.letter) {
        setLetter(payload.letter);
      }

      setData((current) =>
        current
          ? {
            ...current,
            extracted: updatedExtracted,
            cptCode: updatedRequestDetails.cptCode
          }
          : current
      );
      setToast("Letter regenerated with your updates");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to regenerate the letter.");
    } finally {
      setIsRegenerating(false);
    }
  }

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

  // ─── Open remediation at a specific factor index ────────────────────────────
  function openRemediation(index: number) {
    setRemediationIndex(index);
  }

  function closeRemediation() {
    setRemediationIndex(null);
  }

  function goRemediationPrev() {
    setRemediationIndex((current) => (current !== null && current > 0 ? current - 1 : current));
  }

  function goRemediationNext() {
    setRemediationIndex((current) =>
      current !== null && current < paStrengthFactors.length - 1 ? current + 1 : current
    );
  }

  // ─── No-data state ───────────────────────────────────────────────────────────
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

  // ─── Highlighted letter segments for remediation preview ────────────────────
  const highlightedParts: Array<{ text: string; highlighted: boolean }> =
    remediationFactor
      ? getHighlightedLetter(letter, remediationFactor)
        .split(/(%%HIGHLIGHT_START%%.*?%%HIGHLIGHT_END%%)/g)
        .map((part) => {
          if (part.startsWith("%%HIGHLIGHT_START%%")) {
            return {
              text: part.replace("%%HIGHLIGHT_START%%", "").replace("%%HIGHLIGHT_END%%", ""),
              highlighted: true
            };
          }
          return { text: part, highlighted: false };
        })
      : [];

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB]">
      {/* Toast */}
      {toast ? (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span>{toast}</span>
        </div>
      ) : null}

      {/* Header */}
      <header className="border-b border-clinical-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-clinical-blue">Review packet</p>
              {data.isDemo ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  Demo &mdash; sample patient data
                </span>
              ) : null}
            </div>
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
              onClick={handleRegenerateLetter}
              disabled={isRegenerating || !hasAppliedFixes}
              className="rounded-md border border-clinical-line px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 transition"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate letter"}
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading || Boolean(data.isDemo)}
              title={data.isDemo ? "Download available with a real chart" : undefined}
              className="rounded-md bg-clinical-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-blue disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isDownloading ? "Preparing..." : "Download PA Packet"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[360px_1fr]">

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <aside className="order-2 lg:order-1 flex flex-col h-[calc(100vh-3.5rem)] sticky top-14 min-w-0 rounded-lg border border-[#E2E8F0] bg-white p-4 lg:p-5">

          {/* Tab pill container — shrink-0 so it never squishes */}
          <div className="shrink-0 flex gap-1 rounded-lg bg-slate-100 p-1 mb-4">
            <SidebarTabButton isActive={activeTab === "pa-score"} onClick={() => setActiveTab("pa-score")}>
              PA Score
            </SidebarTabButton>
            <SidebarTabButton isActive={activeTab === "chart-data"} onClick={() => setActiveTab("chart-data")}>
              Chart Data
            </SidebarTabButton>
            <SidebarTabButton isActive={activeTab === "denial-risks"} onClick={() => setActiveTab("denial-risks")}>
              Denial Risks
            </SidebarTabButton>
          </div>

          {/* Scrollable tab content area */}
          <div ref={tabContentRef} className="flex-1 min-h-0 overflow-y-auto pr-1 pb-8">

            {/* ── PA Score Tab ─────────────────────────────────────────────── */}
            {activeTab === "pa-score" ? (
              <section>
                {/* Score card */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 pb-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">PA Strength Score</p>
                      <p className={`mt-2 text-3xl font-semibold ${getScoreTextClass(paScore)}`}>{scoreLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsScoreExpanded((current) => !current)}
                      className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300"
                      aria-expanded={isScoreExpanded}
                      aria-label="Toggle PA strength breakdown"
                    >
                      <svg
                        className={`h-4 w-4 transition-transform duration-200 ${isScoreExpanded ? "rotate-180" : "rotate-0"}`}
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full transition-[width] duration-[800ms] ${getScoreBarClass(paScore)}`}
                        style={{ width: `${animatedScorePercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-600">{paScoreDescriptor}</p>
                  </div>

                  {/* Expandable per-factor breakdown (inside card) */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${isScoreExpanded ? "max-h-[900px] opacity-100 mt-4" : "max-h-0 opacity-0 mt-0"
                      }`}
                  >
                    <div className="space-y-2 pt-2">
                      {paStrengthFactors.map((factor) => {
                        const baseScore = basePaStrength?.[factor.key]?.score ?? 0;
                        const manualFix = manualFixes[factor.key];
                        const isResolved = Boolean(manualFix?.resolved);
                        const isOk = baseScore === 1;

                        return (
                          <div key={factor.key} className="flex items-center gap-2 text-xs">
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${isResolved
                                  ? "bg-blue-50 text-blue-600 border border-blue-200"
                                  : isOk
                                    ? "bg-green-50 text-green-600 border border-green-200"
                                    : "bg-red-50 text-red-500 border border-red-200"
                                }`}
                              aria-hidden="true"
                            >
                              {isResolved || isOk ? (
                                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none">
                                  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none">
                                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 text-slate-700">{factor.label}</span>
                            <span className={`font-semibold ${isResolved ? "text-blue-500" : isOk ? "text-green-600" : "text-red-500"
                              }`}>
                              {isResolved ? "Fixed" : isOk ? "OK" : "Missing"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Compact 8-factor summary list — clickable to jump to remediation */}
                <ul className="mt-4 space-y-2">
                  {paStrengthFactors.map((factor, index) => {
                    const baseScore = basePaStrength?.[factor.key]?.score ?? 0;
                    const manualFix = manualFixes[factor.key];
                    const isResolved = Boolean(manualFix?.resolved);
                    const isOk = baseScore === 1;

                    return (
                      <li key={factor.key}>
                        <button
                          type="button"
                          onClick={() => openRemediation(index)}
                          className="w-full flex items-center gap-2.5 rounded-md border border-slate-100 bg-white px-3 py-2 text-sm text-left hover:border-slate-300 hover:bg-slate-50 transition"
                        >
                          {/* Status icon */}
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isResolved
                                ? "bg-blue-50 text-blue-600 border border-blue-200"
                                : isOk
                                  ? "bg-green-50 text-green-600 border border-green-200"
                                  : "bg-red-50 text-red-500 border border-red-200"
                              }`}
                            aria-hidden="true"
                          >
                            {isResolved || isOk ? (
                              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
                                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
                                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            )}
                          </span>
                          {/* Label */}
                          <span className={`flex-1 font-medium ${isResolved || isOk ? "text-slate-700" : "text-slate-800"
                            }`}>
                            {factor.label}
                          </span>
                          {/* Status badge */}
                          <span className={`text-[10px] font-semibold ${isResolved ? "text-blue-500" : isOk ? "text-green-600" : "text-red-500"
                            }`}>
                            {isResolved ? "Fixed" : isOk ? "OK" : "Missing"}
                          </span>
                          {/* Chevron */}
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-slate-300" fill="none" aria-hidden="true">
                            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* Unconditional Fix Issues button */}
                <button
                  type="button"
                  onClick={() => openRemediation(0)}
                  className="mt-4 w-full rounded-md bg-clinical-navy py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-blue"
                >
                  Fix Issues →
                </button>
              </section>
            ) : null}

            {/* ── Chart Data Tab ───────────────────────────────────────────── */}
            {activeTab === "chart-data" ? (
              <section>
                <div className="flex items-start justify-between gap-3 mb-5">
                  <h2 className="text-base font-semibold text-clinical-navy">Chart data we found</h2>
                  {missingFields.length ? <WarningBadge>{missingFields.length} missing</WarningBadge> : null}
                </div>
                <div className="space-y-4">
                  <DataRow label="Patient name" value={data.extracted.patient_name} copyable />
                  <DataRow label="Date of birth" value={data.extracted.date_of_birth} copyable />
                  <DataRow label="Diagnosis codes" value={data.extracted.diagnosis_codes} copyable />
                  <DataRow label="Primary complaint" value={data.extracted.primary_complaint} copyable />
                  <DataRow label="Symptom duration" value={data.extracted.symptom_duration} copyable />
                  <DataRow label="Requested procedure" value={data.extracted.requested_procedure} copyable />
                  <DataRow label="Surgical approach" value={data.extracted.surgical_approach_if_mentioned} />
                  <DataRow
                    label="Imaging findings"
                    value={
                      data.extracted.imaging_findings
                        ? `${data.extracted.imaging_findings.modality ?? "Unknown modality"}: ${data.extracted.imaging_findings.key_findings ?? "Missing findings"}`
                        : null
                    }
                  />
                  <DataRow
                    label="Objective measurements"
                    value={data.extracted.objective_measurements?.length ? data.extracted.objective_measurements : null}
                  />
                  <DataRow label="Functional limitations" value={data.extracted.functional_limitations} copyable />
                  <Treatments treatments={data.extracted.conservative_treatments_attempted} />
                </div>
              </section>
            ) : null}

            {/* ── Denial Risks Tab ─────────────────────────────────────────── */}
            {activeTab === "denial-risks" ? (
              <section>
                <div className="rounded-lg border border-red-200 border-l-4 border-l-[#EF4444] bg-[#FEF2F2] p-5">
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
                </div>
              </section>
            ) : null}

          </div>
        </aside>

        {/* ── Right panel: Remediation or Letter ──────────────────────────────── */}
        {remediationIndex !== null && remediationFactor ? (
          /* Remediation panel — mobile: fixed full-screen overlay; desktop: right grid column */
          <section className="order-1 lg:order-2 rounded-lg border border-clinical-line bg-white shadow-sm flex flex-col h-[calc(100vh-3.5rem)] fixed inset-0 z-50 lg:static lg:z-auto lg:sticky lg:top-14">

            {/* Top nav */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-clinical-line shrink-0">
              <button
                onClick={closeRemediation}
                className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Back
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={goRemediationPrev}
                disabled={remediationIndex === 0}
                className="text-xs font-semibold text-slate-400 hover:text-slate-700 disabled:opacity-30 transition"
                aria-label="Previous factor"
              >
                ← Prev
              </button>
              <p className="text-xs text-slate-400 tabular-nums">
                {remediationIndex + 1} / {paStrengthFactors.length}
              </p>
              <button
                onClick={goRemediationNext}
                disabled={remediationIndex === paStrengthFactors.length - 1}
                className="text-xs font-semibold text-slate-400 hover:text-slate-700 disabled:opacity-30 transition"
                aria-label="Next factor"
              >
                Next →
              </button>
              {/* Factor title with status icon */}
              <div className="ml-auto flex items-center gap-2">
                {(() => {
                  const baseScore = basePaStrength?.[remediationFactor]?.score ?? 0;
                  const isResolved = Boolean(manualFixes[remediationFactor]?.resolved);
                  const isOk = baseScore === 1;
                  return (
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isResolved
                          ? "bg-blue-100 text-blue-600 border border-blue-300"
                          : isOk
                            ? "bg-green-100 text-green-600 border border-green-300"
                            : "bg-red-100 text-red-500 border border-red-300"
                        }`}
                      aria-hidden="true"
                    >
                      {isResolved || isOk ? (
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </span>
                  );
                })()}
                <span className="text-sm font-semibold text-clinical-navy">
                  {paStrengthFactors[remediationIndex].label}
                </span>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">

              {/* Highlighted letter preview */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Letter Preview</p>
                <p className="text-sm leading-6 text-slate-700 whitespace-pre-wrap font-[Georgia,serif] max-h-48 overflow-y-auto">
                  {highlightedParts.map((part, i) =>
                    part.highlighted ? (
                      <mark
                        key={i}
                        className="rounded bg-yellow-200 px-0.5 text-yellow-900 not-italic"
                      >
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    )
                  )}
                </p>
              </div>

              {/* Factor status / condition card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Condition:</p>
                  {(() => {
                    const baseScore = basePaStrength?.[remediationFactor]?.score ?? 0;
                    const isResolved = Boolean(manualFixes[remediationFactor]?.resolved);
                    const isOk = isResolved || baseScore === 1;
                    return isOk ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
                        Strong
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                        Weak
                      </span>
                    );
                  })()}
                </div>
                <p className="text-sm text-slate-700 leading-6">
                  {basePaStrength?.[remediationFactor]?.note ?? "No note provided."}
                </p>
              </div>

              {/* Fix textarea */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Your fix</label>
                <textarea
                  value={manualFixes[remediationFactor]?.value ?? ""}
                  onChange={(event) => updateManualFix(remediationFactor, event.target.value)}
                  placeholder={paStrengthFactors[remediationIndex].placeholder}
                  rows={3}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none resize-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Suggest fix button */}
              <button
                type="button"
                onClick={() => handleSuggestFix(remediationFactor, paStrengthFactors[remediationIndex].label)}
                disabled={Boolean(isSuggesting[remediationFactor])}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-400 transition"
              >
                {isSuggesting[remediationFactor] ? "Suggesting..." : "✦ Suggest fix"}
              </button>

              {/* Suggestion card */}
              {suggestions[remediationFactor] ? (
                <div
                  ref={suggestionCardRef}
                  className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 space-y-3"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-400">Suggestion</p>
                  <p className="text-sm text-blue-800 leading-6">{suggestions[remediationFactor]}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplySuggestion(remediationFactor)}
                      className="rounded-md bg-clinical-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-clinical-blue"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissSuggestion(remediationFactor)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Resolved confirmation */}
              {manualFixes[remediationFactor]?.resolved ? (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <span className="h-4 w-4 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs">✓</span>
                  <p className="text-xs font-semibold text-green-700">
                    Fix applied — regenerate the letter to update
                  </p>
                </div>
              ) : null}

            </div>
          </section>
        ) : (
          /* Letter textarea panel */
          <section className="order-1 lg:order-2 rounded-lg border border-clinical-line bg-white shadow-sm">
            <div className="p-5">
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
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function DataRow({ label, value, copyable }: { label: string; value: string | string[] | null; copyable?: boolean }) {
  const isMissing = value === null || (Array.isArray(value) && value.length === 0);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const textToCopy = Array.isArray(value) ? value.join(", ") : (value ?? "");
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="border-l-2 border-clinical-navy py-1 pl-3">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">{label}</dt>
        <div className="flex items-center gap-1.5">
          {!isMissing && copyable ? (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? "Copied" : `Copy ${label}`}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-700 focus:outline-none"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M3 5H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ) : null}
          {isMissing ? <WarningBadge>Missing</WarningBadge> : null}
        </div>
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

// ─── Pure helpers ──────────────────────────────────────────────────────────────

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

function computePaStrengthScore(base: ExtractedChartData["pa_strength"] | undefined, manualFixes: ManualFixes) {
  let totalWeight = 0;
  let weightedScore = 0;

  Object.entries(paStrengthWeights).forEach(([key, weight]) => {
    const factorKey = key as PaStrengthFactorKey;
    const manual = manualFixes[factorKey];
    const baseScore = base?.[factorKey]?.score ?? 0;
    const score = manual?.resolved ? 1 : baseScore;
    weightedScore += score * weight;
    totalWeight += weight;
  });

  if (!totalWeight) {
    return 0;
  }

  return (weightedScore / totalWeight) * 10;
}

function getScoreColor(score: number) {
  if (score >= 8) {
    return "green";
  }

  if (score >= 5) {
    return "amber";
  }

  return "red";
}

function getScoreTextClass(score: number) {
  const color = getScoreColor(score);
  if (color === "green") {
    return "text-[#16A34A]";
  }
  if (color === "amber") {
    return "text-[#D97706]";
  }
  return "text-[#DC2626]";
}

function getScoreBarClass(score: number) {
  const color = getScoreColor(score);
  if (color === "green") {
    return "bg-[#16A34A]";
  }
  if (color === "amber") {
    return "bg-[#D97706]";
  }
  return "bg-[#DC2626]";
}

function getScoreDescriptor(score: number) {
  if (score >= 9) {
    return "Strong submission - ready to submit";
  }
  if (score >= 7) {
    return "Good - minor improvements recommended";
  }
  if (score >= 5) {
    return "Moderate risk - address warnings before submitting";
  }
  return "High denial risk - significant documentation gaps";
}

function buildUpdatedPayload(data: ReviewData, manualFixes: ManualFixes) {
  const updatedExtracted = applyManualFixes(data.extracted, manualFixes);
  const cptOverride = manualFixes.cpt_code_valid?.resolved
    ? manualFixes.cpt_code_valid.value.trim()
    : data.cptCode;

  return {
    updatedExtracted,
    updatedRequestDetails: {
      cptCode: cptOverride || data.cptCode,
      payerName: data.payerName,
      providerName: data.providerName,
      practiceName: data.practiceName ?? "Orthopedic Practice"
    }
  };
}

function applyManualFixes(extracted: ExtractedChartDataWithValidation, manualFixes: ManualFixes) {
  const updated: ExtractedChartDataWithValidation = {
    ...extracted,
    diagnosis_codes: [...extracted.diagnosis_codes],
    functional_limitations: [...extracted.functional_limitations],
    conservative_treatments_attempted: extracted.conservative_treatments_attempted.map((treatment) => ({
      ...treatment
    })),
    imaging_findings: extracted.imaging_findings ? { ...extracted.imaging_findings } : null
  };

  const diagnosisFix = manualFixes.diagnosis_codes?.resolved ? manualFixes.diagnosis_codes.value : "";
  if (diagnosisFix) {
    updated.diagnosis_codes = splitListValues(diagnosisFix);
  }

  const treatmentsNamed = manualFixes.conservative_treatments_named?.resolved
    ? manualFixes.conservative_treatments_named.value
    : "";
  if (treatmentsNamed) {
    updated.conservative_treatments_attempted = splitListValues(treatmentsNamed).map((name) => ({
      treatment: name,
      duration: null,
      outcome: null,
      dates: null
    }));
  }

  const treatmentDuration = manualFixes.conservative_treatment_duration?.resolved
    ? manualFixes.conservative_treatment_duration.value.trim()
    : "";
  if (treatmentDuration) {
    if (updated.conservative_treatments_attempted.length === 0) {
      updated.conservative_treatments_attempted = [
        {
          treatment: "Conservative treatment",
          duration: treatmentDuration,
          outcome: null,
          dates: null
        }
      ];
    } else {
      updated.conservative_treatments_attempted = updated.conservative_treatments_attempted.map((treatment) => ({
        ...treatment,
        duration: treatment.duration ?? treatmentDuration
      }));
    }
  }

  const imagingFix = manualFixes.imaging_findings?.resolved ? manualFixes.imaging_findings.value : "";
  if (imagingFix) {
    updated.imaging_findings = parseImagingInput(imagingFix);
  }

  const limitationsFix = manualFixes.functional_limitations?.resolved
    ? manualFixes.functional_limitations.value
    : "";
  if (limitationsFix) {
    updated.functional_limitations = splitListValues(limitationsFix);
  }

  const surgicalFix = manualFixes.surgical_approach?.resolved ? manualFixes.surgical_approach.value.trim() : "";
  if (surgicalFix) {
    updated.surgical_approach_if_mentioned = surgicalFix;
  }

  const symptomFix = manualFixes.symptom_duration?.resolved ? manualFixes.symptom_duration.value.trim() : "";
  if (symptomFix) {
    updated.symptom_duration = symptomFix;
  }

  return updated;
}

function splitListValues(value: string) {
  return value
    .split(/[,;\n]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseImagingInput(value: string) {
  const [modality, ...rest] = value.split(":");
  const findings = rest.join(":").trim();

  if (findings) {
    return {
      modality: modality.trim() || null,
      key_findings: findings
    };
  }

  return {
    modality: null,
    key_findings: value.trim() || null
  };
}
