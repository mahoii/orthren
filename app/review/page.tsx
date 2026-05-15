"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ExtractedChartData, ExtractedChartDataWithValidation, GeneratePaResponse } from "@/lib/types";

type ReviewData = GeneratePaResponse & {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName?: string;
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

type SidebarTabButtonProps = {
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: string;
  dotColor?: string;
};

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
  const [toast, setToast] = useState<string | null>(null);
  const [animatedScorePercent, setAnimatedScorePercent] = useState(0);
  const [activeTab, setActiveTab] = useState<SidebarTab>("pa-score");
  const [tabScrollPositions, setTabScrollPositions] = useState<Record<SidebarTab, number>>({
    "pa-score": 0,
    "chart-data": 0,
    "denial-risks": 0
  });
  const [tabScrollMetrics, setTabScrollMetrics] = useState<Record<SidebarTab, { scrollTop: number; scrollHeight: number; clientHeight: number }>>({
    "pa-score": { scrollTop: 0, scrollHeight: 0, clientHeight: 0 },
    "chart-data": { scrollTop: 0, scrollHeight: 0, clientHeight: 0 },
    "denial-risks": { scrollTop: 0, scrollHeight: 0, clientHeight: 0 }
  });
  const tabContentRef = useRef<HTMLDivElement | null>(null);
  const [tabContentOpacity, setTabContentOpacity] = useState(1);
  const hasAnimatedScoreRef = useRef(false);

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
  const paScorePercent = Math.min(100, Math.max(0, (paScore / 10) * 100));
  const paScoreColor = getScoreColor(paScore);
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
    const tabContent = tabContentRef.current;
    if (!tabContent) {
      return;
    }

    tabContent.scrollTop = tabScrollPositions[activeTab] ?? 0;
  }, [activeTab, tabScrollPositions]);

  useEffect(() => {
    setTabContentOpacity(0);
    const frame = window.requestAnimationFrame(() => setTabContentOpacity(1));

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  useEffect(() => {
    document.title = "Review PA Packet — Greenlit MD";
    return () => {
      document.title = "Greenlit MD";
    };
  }, []);

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

  function handleTabChange(nextTab: SidebarTab) {
    const tabContent = tabContentRef.current;

    if (tabContent) {
      setTabScrollPositions((current) => ({
        ...current,
        [activeTab]: tabContent.scrollTop
      }));
    }

    setActiveTab(nextTab);
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
        <aside className="order-2 min-w-0 space-y-4 rounded-lg border border-[#E2E8F0] bg-white p-4 lg:order-1 lg:space-y-6 lg:p-5">
          <div className="rounded-2xl bg-[#F1F5F9] p-1 shadow-inner lg:rounded-full">
            <div className="grid gap-1 md:grid-cols-3">
              <SidebarTabButton
                label="PA Score"
                isActive={activeTab === "pa-score"}
                onClick={() => handleTabChange("pa-score")}
                badge={scoreLabel.split("/")[0].trim()}
              />
              <SidebarTabButton
                label="Chart Data"
                isActive={activeTab === "chart-data"}
                onClick={() => handleTabChange("chart-data")}
              />
              <SidebarTabButton
                label="Denial Risks"
                isActive={activeTab === "denial-risks"}
                onClick={() => handleTabChange("denial-risks")}
                dotColor={data.extracted.denial_risk_flags.length ? "#DC2626" : "#16A34A"}
              />
            </div>
          </div>

          <div
            ref={tabContentRef}
            onScroll={(event) => {
              const target = event.currentTarget;
              setTabScrollPositions((current) => ({ ...current, [activeTab]: target.scrollTop }));
                setTabScrollMetrics((current) => ({
                  ...current,
                  [activeTab]: {
                    scrollTop: target.scrollTop,
                    scrollHeight: target.scrollHeight,
                    clientHeight: target.clientHeight
                  }
                }));
            }}
            className="relative min-h-[420px] max-h-[calc(100vh-14rem)] overflow-y-auto pr-1"
          >
            <div
              className={`pointer-events-none sticky top-0 z-10 h-8 bg-gradient-to-b from-white via-white/85 to-transparent transition-opacity duration-150 ${
                tabScrollMetrics[activeTab].scrollTop > 0 ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden="true"
            />
            <div className="transition-opacity duration-150 ease-out" style={{ opacity: tabContentOpacity }}>
              {activeTab === "pa-score" ? (
                <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 pb-6">
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
            <div
              className={`mt-4 overflow-hidden transition-all duration-200 ease-in-out ${
                isScoreExpanded ? "max-h-[1400px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="space-y-3 pt-2">
                {paStrengthFactors.map((factor) => {
                  const baseScore = basePaStrength?.[factor.key]?.score ?? 0;
                  const baseNote = basePaStrength?.[factor.key]?.note ?? "";
                  const manualFix = manualFixes[factor.key];
                  const isManualResolved = Boolean(manualFix?.resolved);
                  const hasSuggestion = Boolean(suggestions[factor.key]);
                  const displayNote = baseNote || "No note provided.";

                  return (
                    <div key={factor.key} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex gap-3">
                        <span
                          className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                            isManualResolved
                              ? "border-blue-200 bg-blue-50 text-blue-600"
                              : baseScore === 1
                                ? "border-green-200 bg-green-50 text-green-600"
                                : "border-red-200 bg-red-50 text-red-600"
                          }`}
                        >
                          {isManualResolved ? (
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          ) : baseScore === 1 ? (
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <span aria-hidden="true">!</span>
                          )}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-800">{factor.label}</p>
                            <span className="text-xs font-semibold text-slate-500">{isManualResolved ? "Resolved" : baseScore === 1 ? "OK" : "Missing"}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{displayNote}</p>
                          {baseScore === 0 ? (
                            <div className="mt-3 space-y-2">
                              <input
                                value={manualFix?.value ?? ""}
                                onChange={(event) => updateManualFix(factor.key, event.target.value)}
                                placeholder={factor.placeholder}
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSuggestFix(factor.key, factor.label)}
                                  disabled={Boolean(isSuggesting[factor.key])}
                                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-400"
                                >
                                  {isSuggesting[factor.key] ? "Suggesting..." : "Suggest fix"}
                                </button>
                                {isManualResolved ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-xs font-semibold text-blue-600">Marked resolved</span>
                                    <span className="text-xs text-slate-500">Hit &quot;Regenerate letter&quot; below to apply this fix.</span>
                                  </div>
                                ) : null}
                              </div>
                              {hasSuggestion ? (
                                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                                  <p className="font-medium">Suggestion</p>
                                  <p className="mt-1">{suggestions[factor.key]}</p>
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleApplySuggestion(factor.key)}
                                      className="rounded-md bg-clinical-navy px-3 py-1 text-xs font-semibold text-white hover:bg-clinical-blue"
                                    >
                                      Apply
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDismissSuggestion(factor.key)}
                                      className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
              ) : null}
              {activeTab === "chart-data" ? (
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
              ) : null}
              {activeTab === "denial-risks" ? (
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
              ) : null}
            </div>
            <div
              className={`pointer-events-none sticky bottom-0 z-10 h-10 bg-gradient-to-t from-white via-white/85 to-transparent transition-opacity duration-150 ${
                tabScrollMetrics[activeTab].scrollHeight > tabScrollMetrics[activeTab].clientHeight + tabScrollMetrics[activeTab].scrollTop
                  ? "opacity-100"
                  : "opacity-0"
              }`}
              aria-hidden="true"
            />
          </div>
          {activeTab === "pa-score" ? (
            <button
              type="button"
              onClick={handleRegenerateLetter}
              disabled={isRegenerating}
              className="mt-4 w-full rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-blue disabled:bg-slate-300"
            >
              {isRegenerating ? "Regenerating..." : "Regenerate letter with fixes"}
            </button>
          ) : null}
        </aside>

        <section className="order-1 rounded-lg border border-clinical-line bg-white p-5 shadow-sm lg:order-2">
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

function SidebarTabButton({ label, isActive, onClick, badge, dotColor }: SidebarTabButtonProps) {
  const badgeText = badge ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition duration-150 ${
        isActive
          ? "border-white bg-white text-[#1E3A5F] shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
          : "border-transparent bg-transparent text-[#94A3B8] hover:bg-white/70 hover:text-slate-600"
      }`}
    >
      <span>{label}</span>
      {badgeText ? (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getScoreBadgeClass(Number(badgeText))}`}>
          {badgeText}
        </span>
      ) : null}
      {dotColor ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" /> : null}
    </button>
  );
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

function getScoreBadgeClass(score: number) {
  const color = getScoreColor(score);
  if (color === "green") {
    return "bg-green-50 text-[#16A34A]";
  }
  if (color === "amber") {
    return "bg-amber-50 text-[#D97706]";
  }
  return "bg-red-50 text-[#DC2626]";
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
