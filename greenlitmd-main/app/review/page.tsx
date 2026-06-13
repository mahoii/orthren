"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ExtractedChartData, ExtractedChartDataWithValidation, GeneratePaResponse } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type GapItem = {
  kind: "gap";
  id: string;
  factorKey: PaStrengthFactorKey;
  label: string;
  note: string;
  placeholder: string;
  anchor?: string;
  done: boolean;
};

type RiskItem = {
  kind: "risk";
  id: string;
  riskIndex: number;
  label: string;
  done: boolean;
};

type AttentionItem = GapItem | RiskItem;

// ─── Config ───────────────────────────────────────────────────────────────────

const paStrengthWeights: Record<PaStrengthFactorKey, number> = {
  diagnosis_codes: 10,
  conservative_treatments_named: 20,
  conservative_treatment_duration: 10,
  imaging_findings: 15,
  functional_limitations: 15,
  surgical_approach: 10,
  cpt_code_valid: 10,
  symptom_duration: 10,
};

// anchor: first exact substring (case-insensitive) to underline in the letter for this factor
const paStrengthFactors: Array<{
  key: PaStrengthFactorKey;
  label: string;
  placeholder: string;
  anchor?: string;
}> = [
  { key: "diagnosis_codes", label: "Diagnosis Codes", placeholder: "e.g. M17.11, M16.12", anchor: "Primary diagnoses" },
  { key: "conservative_treatments_named", label: "Conservative Treatments Named", placeholder: "e.g. Physical therapy, NSAIDs", anchor: "CONSERVATIVE TREATMENT" },
  { key: "conservative_treatment_duration", label: "Conservative Treatment Duration", placeholder: "e.g. 8 weeks of PT", anchor: "Physical Therapy (" },
  { key: "imaging_findings", label: "Imaging Findings", placeholder: "e.g. MRI: full thickness tear", anchor: "Radiographic" },
  { key: "functional_limitations", label: "Functional Limitations", placeholder: "e.g. cannot climb stairs", anchor: "FUNCTIONAL LIMITATIONS" },
  { key: "surgical_approach", label: "Surgical Approach", placeholder: "e.g. arthroscopic", anchor: "Surgical Approach:" },
  { key: "cpt_code_valid", label: "CPT Code Valid", placeholder: "e.g. 29827", anchor: "CPT Code:" },
  { key: "symptom_duration", label: "Symptom Duration", placeholder: "e.g. 6 months", anchor: "history of progressive" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [letter, setLetter] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [manualFixes, setManualFixes] = useState<ManualFixes>({});
  const [suggestions, setSuggestions] = useState<Suggestions>({});
  const [isSuggesting, setIsSuggesting] = useState<SuggestionLoading>({});
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [animatedScorePercent, setAnimatedScorePercent] = useState(0);
  const [viewMode, setViewMode] = useState<"review" | "edit">("review");
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [acknowledgedRisks, setAcknowledgedRisks] = useState<number[]>([]);
  const [letterIsStale, setLetterIsStale] = useState(false);

  const railRef = useRef<HTMLElement>(null);
  const hasAnimatedScoreRef = useRef(false);
  const hasMountedScoreRef = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("pa-review-data");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as ReviewData;
      setData(parsed);
      setLetter(parsed.letter);
    } catch {
      sessionStorage.removeItem("pa-review-data");
    }
  }, []);

  useEffect(() => {
    document.title = "Review PA Packet — Greenlit MD";
    return () => { document.title = "Greenlit MD"; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const basePaStrength = data?.extracted.pa_strength;
  const paScore = useMemo(
    () => computePaStrengthScore(basePaStrength, manualFixes),
    [basePaStrength, manualFixes]
  );
  const paScorePercent = Math.min(100, Math.max(0, (paScore / 10) * 100));

  useEffect(() => {
    if (!data) return;
    if (!hasAnimatedScoreRef.current) {
      setAnimatedScorePercent(0);
      const t = window.setTimeout(() => {
        setAnimatedScorePercent(paScorePercent);
        hasAnimatedScoreRef.current = true;
      }, 40);
      return () => window.clearTimeout(t);
    }
    setAnimatedScorePercent(paScorePercent);
  }, [data, paScorePercent]);

  // Mark letter stale when PA score reaches 10 (skip on first mount)
  useEffect(() => {
    if (!hasMountedScoreRef.current) {
      hasMountedScoreRef.current = true;
      return;
    }
    if (paScore === 10) {
      setLetterIsStale(true);
    }
  }, [paScore]);

  // Scroll right rail to newly expanded card
  useEffect(() => {
    if (!expandedCard || !railRef.current) return;
    const t = setTimeout(() => {
      const el = railRef.current?.querySelector(`[data-card-id="${expandedCard}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
    return () => clearTimeout(t);
  }, [expandedCard]);

  const hasAppliedFixes = useMemo(
    () => Object.values(manualFixes).some((fix) => fix?.resolved),
    [manualFixes]
  );

  const missingFields = useMemo(
    () => (data ? findMissingFields(data.extracted) : []),
    [data]
  );

  // Build ordered attention items: undone risks → undone gaps → done risks → done gaps
  const attentionItems = useMemo((): AttentionItem[] => {
    if (!data) return [];
    const gaps: GapItem[] = paStrengthFactors
      .filter((f) => (basePaStrength?.[f.key]?.score ?? 0) === 0)
      .map((f) => ({
        kind: "gap",
        id: f.key,
        factorKey: f.key,
        label: f.label,
        note: basePaStrength?.[f.key]?.note ?? "",
        placeholder: f.placeholder,
        anchor: f.anchor,
        done: Boolean(manualFixes[f.key]?.resolved),
      }));
    const risks: RiskItem[] = (data.extracted.denial_risk_flags ?? []).map((flag, i) => ({
      kind: "risk",
      id: `risk-${i}`,
      riskIndex: i,
      label: flag,
      done: acknowledgedRisks.includes(i),
    }));
    return [
      ...risks.filter((r) => !r.done),
      ...gaps.filter((g) => !g.done),
      ...risks.filter((r) => r.done),
      ...gaps.filter((g) => g.done),
    ];
  }, [data, basePaStrength, manualFixes, acknowledgedRisks]);

  const openCount = attentionItems.filter((item) => !item.done).length;
  const okFactors = paStrengthFactors.filter(
    (f) => (basePaStrength?.[f.key]?.score ?? 0) === 1
  );

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function updateManualFix(key: PaStrengthFactorKey, value: string) {
    setManualFixes((cur) => ({
      ...cur,
      [key]: { value, resolved: cur[key]?.resolved ?? false, source: "manual" },
    }));
  }

  function applyResolvedFix(
    key: PaStrengthFactorKey,
    value: string,
    source: ManualFix["source"] = "manual"
  ) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setManualFixes((cur) => ({ ...cur, [key]: { value, resolved: true, source } }));
  }

  async function handleSuggestFix(key: PaStrengthFactorKey, label: string) {
    if (!data || isSuggesting[key]) return;
    setIsSuggesting((cur) => ({ ...cur, [key]: true }));
    setSuggestions((cur) => ({ ...cur, [key]: "" }));
    try {
      const response = await fetch("/api/suggest-fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extracted: data.extracted, factor: label }),
      });
      const payload = (await response.json()) as { suggestion?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate a suggestion.");
      setSuggestions((cur) => ({ ...cur, [key]: payload.suggestion ?? "" }));
    } catch (error) {
      setSuggestions((cur) => ({ ...cur, [key]: "" }));
      setToast(error instanceof Error ? error.message : "Unable to generate a suggestion.");
    } finally {
      setIsSuggesting((cur) => ({ ...cur, [key]: false }));
    }
  }

  function handleApplySuggestion(key: PaStrengthFactorKey) {
    const suggestion = suggestions[key];
    if (!suggestion) return;
    applyResolvedFix(key, suggestion, "ai");
    setSuggestions((cur) => ({ ...cur, [key]: "" }));
  }

  function handleDismissSuggestion(key: PaStrengthFactorKey) {
    setSuggestions((cur) => ({ ...cur, [key]: "" }));
  }

  async function handleRegenerateLetter() {
    if (!data || isRegenerating) return;
    setIsRegenerating(true);
    try {
      const { updatedExtracted, updatedRequestDetails } = buildUpdatedPayload(data, manualFixes);
      const response = await fetch("/api/regenerate-letter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          extracted: updatedExtracted,
          requestDetails: updatedRequestDetails,
        }),
      });
      const payload = (await response.json()) as { letter?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to regenerate the letter.");
      if (payload.letter) setLetter(payload.letter);
      setData((cur) =>
        cur
          ? { ...cur, extracted: updatedExtracted, cptCode: updatedRequestDetails.cptCode }
          : cur
      );
      setLetterIsStale(false);
      setToast("Letter regenerated with your updates");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to regenerate the letter.");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleDownload() {
    if (!data) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          extracted: data.extracted,
          letter,
          cptCode: data.cptCode,
          payerName: data.payerName,
          providerName: data.providerName,
          practiceName: data.practiceName,
        }),
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
      setDownloadError(
        error instanceof Error ? error.message : "Unable to export the PA packet."
      );
    } finally {
      setIsDownloading(false);
    }
  }

  function handleAcknowledgeRisk(riskIndex: number) {
    setAcknowledgedRisks((cur) => (cur.includes(riskIndex) ? cur : [...cur, riskIndex]));
    setToast("Marked as reviewed");
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (!data) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#F8F9FB] px-6">
        <div className="max-w-md rounded-lg border border-clinical-line p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-clinical-navy">No packet ready for review</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Generate a packet from a chart PDF first. Patient data is not stored after this
            browser session.
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB]">
      {/* Toast */}
      {toast ? (
        <div className="fixed right-5 top-20 z-50 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg">
          <span
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] text-green-700"
            aria-hidden="true"
          >
            ✓
          </span>
          {toast}
        </div>
      ) : null}

      {/* ── Sticky review header ──────────────────────────────────────────────── */}
      <div className="sticky top-14 z-40 border-b border-[#d7dee8] bg-white shadow-[0_1px_0_rgba(15,31,51,.02)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-[18px] gap-y-2 px-6 py-[13px]">
          {/* Title + chips */}
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#1d4f7a]">
              Review packet
            </p>
            <h1 className="text-[21px] font-semibold leading-[1.1] text-clinical-navy">
              Letter of Medical Necessity
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.extracted.patient_name ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {data.extracted.patient_name}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              CPT {data.cptCode}
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {data.payerName}
            </span>
            {data.isDemo ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Demo — sample patient data
              </span>
            ) : null}
          </div>

          {/* Actions */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Review / Edit toggle */}
            <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode("review")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "review"
                    ? "bg-white text-clinical-navy shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Review
              </button>
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === "edit"
                    ? "bg-white text-clinical-navy shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Edit
              </button>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-[#d7dee8] px-[15px] py-[9px] text-sm font-semibold text-[#334155] transition hover:bg-slate-50"
            >
              New upload
            </Link>
            <button
              type="button"
              onClick={() => setChartModalOpen(true)}
              className="rounded-lg border border-[#e2e8f0] bg-white px-[15px] py-[9px] text-sm font-semibold text-[#475569] transition hover:bg-slate-50"
            >
              Chart Data
            </button>
            <button
              type="button"
              onClick={handleRegenerateLetter}
              disabled={!hasAppliedFixes || isRegenerating}
              className={`rounded-lg border border-[#d7dee8] bg-white px-[15px] py-[9px] text-sm font-semibold text-[#334155] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300${
                letterIsStale && hasAppliedFixes && !isRegenerating ? " glow-pulse" : ""
              }`}
            >
              {isRegenerating ? "Regenerating..." : "Regenerate letter"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || Boolean(data.isDemo)}
              title={data.isDemo ? "Download available with a real chart" : undefined}
              className="rounded-lg bg-clinical-navy px-[18px] py-[10px] text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-blue disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isDownloading ? "Preparing..." : "Download PA Packet"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Feedback strip (scrolls away) ──────────────────────────────────────── */}
      <FeedbackWidget
        cptCode={data.cptCode}
        payerName={data.payerName}
        paScore={paScore}
        setToast={setToast}
      />

      {/* ── Two-column body ────────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-6 pb-20 pt-[26px] lg:flex-row lg:gap-[30px]">

        {/* LEFT: Letter */}
        <section className="w-full min-w-0 lg:flex-1">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-clinical-navy">Editable letter draft</h2>
              <p className="mt-[3px] text-[13px] text-[#94a3b8]">
                {viewMode === "review"
                  ? "Underlined text links to open issues in the panel. Switch to Edit to type directly."
                  : "Review and revise before downloading. The export includes the required AI-assisted disclaimer."}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold text-[#94a3b8]">
              CPT {data.cptCode}
            </span>
          </div>
          {downloadError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {downloadError}
            </div>
          ) : null}
          {viewMode === "edit" ? (
            <textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              className="w-full resize-y rounded-lg border border-clinical-line bg-white outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
              style={{
                minHeight: "70vh",
                padding: "48px 56px",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "15px",
                lineHeight: "1.85",
                color: "#1f2733",
                boxShadow: "0 1px 3px rgba(15,31,51,.08), 0 14px 40px rgba(15,31,51,.08)",
              }}
            />
          ) : (
            <AnnotatedLetter
              letter={letter}
              basePaStrength={basePaStrength}
              manualFixes={manualFixes}
              onSpanClick={(key) => setExpandedCard(key)}
            />
          )}
        </section>

        {/* RIGHT: Attention rail */}
        <aside
          ref={railRef}
          className="w-full shrink-0 lg:sticky lg:flex lg:w-[min(384px,30vw)] lg:flex-col lg:gap-4 lg:pb-10 lg:overflow-y-auto"
          style={{
            top: "calc(3.5rem + 62px)",
            maxHeight: "calc(100vh - 3.5rem - 62px)",
            scrollbarWidth: "thin",
            scrollbarColor: "#cbd5e1 transparent",
          }}
        >
          {/* PA Strength Score card */}
          <div className="rounded-[14px] border border-slate-200 bg-gradient-to-b from-[#fbfdff] to-[#f7fafc] p-[18px]">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#94a3b8]">
              PA Strength Score
            </p>
            <div className="mt-2 flex items-baseline gap-[6px]">
              <span className={`text-[38px] font-bold leading-none ${getScoreTextClass(paScore)}`}>
                {paScore.toFixed(1)}
              </span>
              <span className="text-[15px] font-semibold text-[#94a3b8]">/ 10</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-[width] duration-[800ms] cubic-bezier(.2,.7,.2,1) ${getScoreBarClass(paScore)}`}
                style={{ width: `${animatedScorePercent}%` }}
              />
            </div>
            <p className={`mt-[11px] text-[13px] font-semibold ${getScoreTextClass(paScore)}`}>
              {getScoreDescriptor(paScore)}
            </p>
          </div>

          {/* Needs attention section */}
          {attentionItems.length > 0 ? (
            <div className="mt-4 lg:mt-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[14px] font-bold text-clinical-navy">Needs attention</h2>
                {openCount > 0 ? (
                  <span className="rounded-full bg-[#fef2f2] px-[9px] py-[3px] text-[11px] font-bold text-[#dc2626]">
                    {openCount} open
                  </span>
                ) : (
                  <span className="rounded-full bg-[#f0fdf4] px-[9px] py-[3px] text-[11px] font-bold text-[#15803d]">
                    All clear
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-[9px]">
                {attentionItems.map((item) => (
                  <AttentionCard
                    key={item.id}
                    item={item}
                    expanded={expandedCard === item.id}
                    onToggle={() =>
                      setExpandedCard(expandedCard === item.id ? null : item.id)
                    }
                    manualFixes={manualFixes}
                    suggestions={suggestions}
                    isSuggesting={isSuggesting}
                    onFixChange={updateManualFix}
                    onApplyFix={applyResolvedFix}
                    onSuggestFix={handleSuggestFix}
                    onApplySuggestion={handleApplySuggestion}
                    onDismissSuggestion={handleDismissSuggestion}
                    onAcknowledgeRisk={handleAcknowledgeRisk}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* OK factors — single-line, no expand */}
          {okFactors.length > 0 ? (
            <div className="mt-4 lg:mt-0">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-[#94a3b8]">
                Strong factors
              </p>
              <div className="flex flex-col">
                {okFactors.map((f) => {
                  const resolved = Boolean(manualFixes[f.key]?.resolved);
                  return (
                    <div
                      key={f.key}
                      className="flex items-center gap-[9px] rounded-lg px-3 py-[8px]"
                    >
                      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-green-200 bg-green-50 text-green-600">
                        <svg viewBox="0 0 16 16" className="h-[10px] w-[10px]" fill="none">
                          <path
                            d="M3.5 8.5l3 3 6-7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <span className="flex-1 text-[12.5px] font-medium text-[#334155]">
                        {f.label}
                      </span>
                      <span className="text-[10.5px] font-bold text-green-600">
                        {resolved ? "Fixed" : "OK"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {/* ── Chart Data Modal ──────────────────────────────────────────────────── */}
      {chartModalOpen ? (
        <ChartModal
          data={data}
          missingFields={missingFields}
          onClose={() => setChartModalOpen(false)}
        />
      ) : null}
    </main>
  );
}

// ─── AnnotatedLetter ──────────────────────────────────────────────────────────

function AnnotatedLetter({
  letter,
  basePaStrength,
  manualFixes,
  onSpanClick,
}: {
  letter: string;
  basePaStrength: ExtractedChartData["pa_strength"] | undefined;
  manualFixes: ManualFixes;
  onSpanClick: (factorKey: PaStrengthFactorKey) => void;
}) {
  type Annotation = {
    start: number;
    end: number;
    factorKey: PaStrengthFactorKey;
    resolved: boolean;
  };

  const annotations: Annotation[] = [];
  const lowerLetter = letter.toLowerCase();

  for (const factor of paStrengthFactors) {
    const baseScore = basePaStrength?.[factor.key]?.score ?? 0;
    if (baseScore === 1) continue; // OK factor — no annotation
    if (!factor.anchor) continue;

    const resolved = Boolean(manualFixes[factor.key]?.resolved);
    const lowerAnchor = factor.anchor.toLowerCase();
    let pos = 0;
    for (let guard = 0; guard < 30; guard++) {
      const idx = lowerLetter.indexOf(lowerAnchor, pos);
      if (idx === -1) break;
      annotations.push({
        start: idx,
        end: idx + factor.anchor.length,
        factorKey: factor.key,
        resolved,
      });
      pos = idx + factor.anchor.length;
    }
  }

  // Sort by position and remove overlaps
  annotations.sort((a, b) => a.start - b.start);
  const filtered: Annotation[] = [];
  let lastEnd = 0;
  for (const anno of annotations) {
    if (anno.start >= lastEnd) {
      filtered.push(anno);
      lastEnd = anno.end;
    }
  }

  // Build React nodes from runs
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < filtered.length; i++) {
    const anno = filtered[i];
    if (cursor < anno.start) {
      nodes.push(<span key={`t${i}`}>{letter.slice(cursor, anno.start)}</span>);
    }
    const underlineColor = anno.resolved ? "#16A34A" : "#D97706";
    const underlineStyle = anno.resolved ? "solid" : "dashed";
    nodes.push(
      <span
        key={`a${i}`}
        style={{
          borderBottom: `2px ${underlineStyle} ${underlineColor}`,
          cursor: "pointer",
          borderRadius: "2px",
          padding: "0 1px",
          transition: "background .12s",
        }}
        onClick={() => onSpanClick(anno.factorKey)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSpanClick(anno.factorKey);
        }}
      >
        {letter.slice(anno.start, anno.end)}
      </span>
    );
    cursor = anno.end;
  }
  if (cursor < letter.length) {
    nodes.push(<span key="tLast">{letter.slice(cursor)}</span>);
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(15,31,51,.08), 0 14px 40px rgba(15,31,51,.08)",
        padding: "48px 56px",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "15px",
        lineHeight: "1.85",
        color: "#1f2733",
        whiteSpace: "pre-wrap",
        minHeight: "70vh",
      }}
    >
      {nodes}
    </div>
  );
}

// ─── AttentionCard ────────────────────────────────────────────────────────────

function AttentionCard({
  item,
  expanded,
  onToggle,
  manualFixes,
  suggestions,
  isSuggesting,
  onFixChange,
  onApplyFix,
  onSuggestFix,
  onApplySuggestion,
  onDismissSuggestion,
  onAcknowledgeRisk,
}: {
  item: AttentionItem;
  expanded: boolean;
  onToggle: () => void;
  manualFixes: ManualFixes;
  suggestions: Suggestions;
  isSuggesting: SuggestionLoading;
  onFixChange: (key: PaStrengthFactorKey, value: string) => void;
  onApplyFix: (key: PaStrengthFactorKey, value: string, source?: ManualFix["source"]) => void;
  onSuggestFix: (key: PaStrengthFactorKey, label: string) => void;
  onApplySuggestion: (key: PaStrengthFactorKey) => void;
  onDismissSuggestion: (key: PaStrengthFactorKey) => void;
  onAcknowledgeRisk: (riskIndex: number) => void;
}) {
  const isGap = item.kind === "gap";
  const isDone = item.done;

  const statusColor = isDone ? "#16a34a" : isGap ? "#d97706" : "#dc2626";
  const borderColor = expanded ? statusColor : isDone ? "#bbf7d0" : isGap ? "#fde68a" : "#fecaca";
  const iconBg = isDone
    ? "bg-green-50 border-green-200 text-green-600"
    : isGap
    ? "bg-amber-50 border-amber-200 text-amber-600"
    : "bg-red-50 border-red-200 text-red-600";

  const fixValue = isGap ? (manualFixes[item.factorKey]?.value ?? "") : "";
  const resolved = isGap && Boolean(manualFixes[item.factorKey]?.resolved);
  const suggestion = isGap ? (suggestions[item.factorKey] ?? "") : "";
  const suggesting = isGap && Boolean(isSuggesting[item.factorKey]);

  return (
    <div
      data-card-id={item.id}
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: "12px",
        overflow: "hidden",
        background: "#fff",
        transition: "border-color .15s",
        boxShadow: expanded ? "0 6px 18px rgba(15,31,51,.06)" : "none",
      }}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-[10px] text-left"
        style={{
          padding: "12px 13px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span
          className={`mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] border text-[11px] font-bold ${iconBg}`}
          aria-hidden="true"
        >
          {isDone ? "✓" : isGap ? "△" : "!"}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-clinical-navy">
              {isGap ? item.label : "Denial risk"}
            </span>
            <span
              className="shrink-0 text-[9.5px] font-bold uppercase tracking-[.06em]"
              style={{ color: statusColor }}
            >
              {isDone ? "Done" : isGap ? "Gap" : "Risk"}
            </span>
          </span>
          <span className="mt-[3px] line-clamp-2 text-[12px] leading-[1.45] text-[#64748b]">
            {isGap ? item.note : item.label}
          </span>
        </span>
        <span
          className="mt-[3px] shrink-0 text-[14px] text-[#cbd5e1]"
          style={{
            transform: expanded ? "rotate(90deg)" : "none",
            transition: "transform .15s",
          }}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      {/* Expanded body */}
      {expanded ? (
        <div
          style={{
            borderTop: "1px solid #eef2f7",
            padding: "13px",
            background: "#fbfdff",
            display: "flex",
            flexDirection: "column",
            gap: "11px",
          }}
        >
          {isGap ? (
            <>
              {/* Why payers flag this */}
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[.08em] text-amber-600">
                  Why payers flag this
                </p>
                <p className="text-[12.5px] leading-[1.6] text-[#475569]">{item.note}</p>
              </div>

              {resolved ? (
                <div className="flex items-center gap-2 rounded-[9px] border border-green-200 bg-green-50 px-3 py-[9px]">
                  <span className="text-[13px] font-bold text-green-600">✓</span>
                  <span className="text-[12px] font-semibold text-[#15803d]">
                    Fix applied — regenerate the letter to fold it in
                  </span>
                </div>
              ) : (
                <>
                  {/* Fix textarea */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[#94a3b8]">
                      Your fix
                    </label>
                    <textarea
                      value={fixValue}
                      placeholder={item.placeholder}
                      onChange={(e) => onFixChange(item.factorKey, e.target.value)}
                      className="resize-y rounded-[9px] border border-slate-200 px-[10px] py-[10px] text-[12.5px] leading-[1.55] text-[#334155] outline-none focus:border-clinical-blue focus:ring-1 focus:ring-blue-100"
                      style={{ width: "100%", minHeight: "76px", fontFamily: "inherit" }}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onSuggestFix(item.factorKey, item.label)}
                      disabled={suggesting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-[#1d4f7a] transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {suggesting ? "Suggesting..." : "✦ Suggest fix"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyFix(item.factorKey, fixValue)}
                      disabled={!fixValue.trim()}
                      className="flex-1 rounded-lg border-none bg-clinical-navy px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-clinical-blue disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      Apply fix →
                    </button>
                  </div>

                  {/* Suggestion card */}
                  {suggestion ? (
                    <div className="flex flex-col gap-[9px] rounded-[10px] border border-blue-200 bg-[#eff6ff] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[#3b82f6]">
                        Suggestion
                      </p>
                      <p className="text-[12.5px] leading-[1.6] text-[#1e40af]">{suggestion}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onApplySuggestion(item.factorKey)}
                          className="rounded-lg bg-clinical-navy px-[14px] py-[7px] text-[12px] font-semibold text-white transition hover:bg-clinical-blue"
                        >
                          Apply fix
                        </button>
                        <button
                          type="button"
                          onClick={() => onDismissSuggestion(item.factorKey)}
                          className="rounded-lg border border-slate-200 bg-white px-[14px] py-[7px] text-[12px] font-semibold text-[#475569] transition hover:border-slate-300"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <>
              {/* Risk detail */}
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#b91c1c]">
                  Payer risk
                </p>
                <p className="text-[12.5px] leading-[1.6] text-[#475569]">{item.label}</p>
              </div>

              {item.done ? (
                <div className="flex items-center gap-2 rounded-[9px] border border-green-200 bg-green-50 px-3 py-[9px]">
                  <span className="text-[13px] font-bold text-green-600">✓</span>
                  <span className="text-[12px] font-semibold text-[#15803d]">Reviewed</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onAcknowledgeRisk(item.riskIndex)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-[9px] text-[12px] font-semibold text-[#475569] transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Mark as reviewed
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── ChartModal ───────────────────────────────────────────────────────────────

function ChartModal({
  data,
  missingFields,
  onClose,
}: {
  data: ReviewData;
  missingFields: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,.4)] p-10"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_32px_80px_rgba(15,31,51,.35)]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "chartModalPop .2s ease" }}
      >
        {/* Modal header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[#eef2f7] px-[22px] py-4">
          <h2 className="text-base font-semibold text-clinical-navy">Chart Data</h2>
          <span className="text-sm text-[#94a3b8]">Extracted from uploaded chart</span>
          {missingFields.length > 0 ? (
            <WarningBadge>{missingFields.length} missing</WarningBadge>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-xl leading-none text-[#94a3b8] transition hover:text-slate-700"
            aria-label="Close chart data"
          >
            ×
          </button>
        </div>
        {/* Modal body */}
        <div
          className="flex min-h-0 flex-1 flex-col gap-[15px] overflow-y-auto px-[22px] py-5"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}
        >
          <DataRow label="Patient name" value={data.extracted.patient_name} copyable />
          <DataRow label="Date of birth" value={data.extracted.date_of_birth} copyable />
          <DataRow label="Diagnosis codes" value={data.extracted.diagnosis_codes} copyable />
          <DataRow label="Primary complaint" value={data.extracted.primary_complaint} copyable />
          <DataRow label="Symptom duration" value={data.extracted.symptom_duration} copyable />
          <DataRow label="Requested procedure" value={data.extracted.requested_procedure} copyable />
          <DataRow
            label="Surgical approach"
            value={data.extracted.surgical_approach_if_mentioned}
          />
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
            value={
              data.extracted.objective_measurements?.length
                ? data.extracted.objective_measurements
                : null
            }
          />
          <DataRow
            label="Functional limitations"
            value={data.extracted.functional_limitations}
            copyable
          />
          <Treatments treatments={data.extracted.conservative_treatments_attempted} />
        </div>
      </div>
    </div>
  );
}

// ─── FeedbackWidget ───────────────────────────────────────────────────────────

function FeedbackWidget({
  cptCode,
  payerName,
  paScore,
  setToast,
}: {
  cptCode: string;
  payerName: string;
  paScore: number;
  setToast: (message: string | null) => void;
}) {
  const [outcome, setOutcome] = useState<"approved" | "denied" | "pending" | null>(null);
  const [denialReason, setDenialReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(
    selectedOutcome: "approved" | "denied" | "pending",
    reason?: string
  ) {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cptCode,
          payerName,
          outcome: selectedOutcome,
          denialReason: reason || null,
          paScore,
        }),
      });
      if (!response.ok) {
        const errPayload = (await response.json()) as { error?: string };
        throw new Error(errPayload.error ?? "Failed to submit feedback.");
      }
      setSubmitted(true);
      setToast("Thanks — your feedback helps improve Greenlit MD.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="border-b border-[#eef1f5] bg-[#f8fafc] px-6 py-[10px]">
        <div className="mx-auto max-w-7xl text-sm font-semibold text-slate-700">
          Thanks — your feedback helps improve Greenlit MD.
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-[#eef1f5] bg-[#f8fafc] px-6 py-[10px]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-clinical-navy">
            Did this PA get approved?
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSubmitting || (outcome !== null && outcome !== "approved")}
              onClick={() => {
                setOutcome("approved");
                handleSubmit("approved");
              }}
              className={`rounded-md border border-clinical-line px-[11px] py-[5px] text-xs font-semibold transition-colors ${
                outcome === "approved"
                  ? "bg-clinical-navy text-white"
                  : "bg-white text-[#334155] hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              ✓ Approved
            </button>
            <button
              type="button"
              disabled={isSubmitting || (outcome !== null && outcome !== "denied")}
              onClick={() => setOutcome("denied")}
              className={`rounded-md border border-clinical-line px-[11px] py-[5px] text-xs font-semibold transition-colors ${
                outcome === "denied"
                  ? "bg-clinical-navy text-white"
                  : "bg-white text-[#334155] hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              ✗ Denied
            </button>
            <button
              type="button"
              disabled={isSubmitting || (outcome !== null && outcome !== "pending")}
              onClick={() => {
                setOutcome("pending");
                handleSubmit("pending");
              }}
              className={`rounded-md border border-clinical-line px-[11px] py-[5px] text-xs font-semibold transition-colors ${
                outcome === "pending"
                  ? "bg-clinical-navy text-white"
                  : "bg-white text-[#334155] hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              ⏳ Pending
            </button>
          </div>
        </div>

        {outcome === "denied" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit("denied", denialReason);
            }}
            className="mt-2 flex flex-1 items-center gap-2 md:ml-4 md:mt-0"
          >
            <label
              htmlFor="denial-reason-input"
              className="whitespace-nowrap text-xs font-semibold text-clinical-navy"
            >
              Denial reason (optional):
            </label>
            <input
              id="denial-reason-input"
              type="text"
              placeholder="e.g. Missing conservative treatment details"
              value={denialReason}
              disabled={isSubmitting}
              onChange={(e) => setDenialReason(e.target.value)}
              className="max-w-xs flex-1 rounded border border-clinical-line bg-white px-3 py-1 text-xs font-medium text-slate-800 outline-none focus:border-clinical-blue focus:ring-1 focus:ring-blue-100"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-clinical-navy px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-clinical-blue disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setOutcome(null);
                setError(null);
              }}
              className="rounded border border-clinical-line bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </form>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-red-600">
            <span>Error: {error}</span>
            <button
              type="button"
              onClick={() => {
                if (outcome) handleSubmit(outcome, outcome === "denied" ? denialReason : undefined);
              }}
              className="font-semibold text-clinical-blue underline hover:text-clinical-navy"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── DataRow ──────────────────────────────────────────────────────────────────

function DataRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string | string[] | null;
  copyable?: boolean;
}) {
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
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
          {label}
        </dt>
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
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="#16A34A"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                  <path
                    d="M3 5H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1v-1"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          ) : null}
          {isMissing ? <WarningBadge>Missing</WarningBadge> : null}
        </div>
      </div>
      <dd className="mt-1 text-sm leading-6 text-slate-800">
        {Array.isArray(value)
          ? value.length
            ? value.join("; ")
            : "Not found"
          : (value ?? "Not found")}
      </dd>
    </div>
  );
}

// ─── Treatments ───────────────────────────────────────────────────────────────

function Treatments({
  treatments,
}: {
  treatments: ExtractedChartData["conservative_treatments_attempted"];
}) {
  return (
    <div className="border-l-2 border-clinical-navy py-1 pl-3">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#94A3B8]">
          Conservative treatments
        </dt>
        {treatments.length === 0 ? <WarningBadge>Missing</WarningBadge> : null}
      </div>
      {treatments.length ? (
        <div className="mt-2 space-y-2">
          {treatments.map((treatment, index) => (
            <div
              key={`${treatment.treatment}-${index}`}
              className="rounded-[9px] bg-[#f8fafc] border border-[#eef2f7] px-3 py-[10px] text-sm leading-6"
            >
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

// ─── OutcomeBadge / WarningBadge ─────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getOutcomeBadgeClass(outcome)}`}>
      {outcome ?? "Not found"}
    </span>
  );
}

function getOutcomeBadgeClass(outcome: string | null) {
  const n = outcome?.toLowerCase() ?? "";
  if (n.includes("improved")) return "bg-green-100 text-green-700";
  if (n.includes("failed")) return "bg-red-100 text-red-700";
  if (n.includes("partial relief")) return "bg-yellow-100 text-yellow-800";
  return "bg-slate-100 text-slate-600";
}

function WarningBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
      {children}
    </span>
  );
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

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
    ["surgical_approach_if_mentioned", extracted.surgical_approach_if_mentioned],
  ];
  fields.forEach(([field, value]) => {
    if (value === null || (Array.isArray(value) && value.length === 0)) missing.push(field);
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
  const safePatient = (patientName ?? "patient")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${safePatient}-pa-packet-cpt-${cptCode}.docx`;
}

function computePaStrengthScore(
  base: ExtractedChartData["pa_strength"] | undefined,
  manualFixes: ManualFixes
) {
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
  if (!totalWeight) return 0;
  return (weightedScore / totalWeight) * 10;
}

function getScoreColor(score: number) {
  if (score >= 8) return "green";
  if (score >= 5) return "amber";
  return "red";
}

function getScoreTextClass(score: number) {
  const c = getScoreColor(score);
  if (c === "green") return "text-[#16A34A]";
  if (c === "amber") return "text-[#D97706]";
  return "text-[#DC2626]";
}

function getScoreBarClass(score: number) {
  const c = getScoreColor(score);
  if (c === "green") return "bg-[#16A34A]";
  if (c === "amber") return "bg-[#D97706]";
  return "bg-[#DC2626]";
}

function getScoreDescriptor(score: number) {
  if (score >= 9) return "Strong submission — ready to submit";
  if (score >= 7) return "Good — minor improvements recommended";
  if (score >= 5) return "Moderate risk — address warnings before submitting";
  return "High denial risk — significant documentation gaps";
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
      practiceName: data.practiceName ?? "",
    },
  };
}

function applyManualFixes(
  extracted: ExtractedChartDataWithValidation,
  manualFixes: ManualFixes
) {
  const updated: ExtractedChartDataWithValidation = {
    ...extracted,
    diagnosis_codes: [...extracted.diagnosis_codes],
    functional_limitations: [...extracted.functional_limitations],
    conservative_treatments_attempted: extracted.conservative_treatments_attempted.map((t) => ({
      ...t,
    })),
    imaging_findings: extracted.imaging_findings ? { ...extracted.imaging_findings } : null,
  };

  const diagnosisFix = manualFixes.diagnosis_codes?.resolved
    ? manualFixes.diagnosis_codes.value
    : "";
  if (diagnosisFix) updated.diagnosis_codes = splitListValues(diagnosisFix);

  const treatmentsNamed = manualFixes.conservative_treatments_named?.resolved
    ? manualFixes.conservative_treatments_named.value
    : "";
  if (treatmentsNamed) {
    updated.conservative_treatments_attempted = splitListValues(treatmentsNamed).map((name) => ({
      treatment: name,
      duration: null,
      outcome: null,
      dates: null,
    }));
  }

  const treatmentDuration = manualFixes.conservative_treatment_duration?.resolved
    ? manualFixes.conservative_treatment_duration.value.trim()
    : "";
  if (treatmentDuration) {
    if (updated.conservative_treatments_attempted.length === 0) {
      updated.conservative_treatments_attempted = [
        { treatment: "Conservative treatment", duration: treatmentDuration, outcome: null, dates: null },
      ];
    } else {
      updated.conservative_treatments_attempted = updated.conservative_treatments_attempted.map(
        (t) => ({ ...t, duration: t.duration ?? treatmentDuration })
      );
    }
  }

  const imagingFix = manualFixes.imaging_findings?.resolved
    ? manualFixes.imaging_findings.value
    : "";
  if (imagingFix) updated.imaging_findings = parseImagingInput(imagingFix);

  const limitationsFix = manualFixes.functional_limitations?.resolved
    ? manualFixes.functional_limitations.value
    : "";
  if (limitationsFix) updated.functional_limitations = splitListValues(limitationsFix);

  const surgicalFix = manualFixes.surgical_approach?.resolved
    ? manualFixes.surgical_approach.value.trim()
    : "";
  if (surgicalFix) updated.surgical_approach_if_mentioned = surgicalFix;

  const symptomFix = manualFixes.symptom_duration?.resolved
    ? manualFixes.symptom_duration.value.trim()
    : "";
  if (symptomFix) updated.symptom_duration = symptomFix;

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
    return { modality: modality.trim() || null, key_findings: findings };
  }
  return { modality: null, key_findings: value.trim() || null };
}
