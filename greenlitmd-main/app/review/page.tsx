"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AnnotatedLetterComponent, { type AnnotationItem } from "@/components/AnnotatedLetter";
import type { DenialRiskFlag, ExtractedChartData, ExtractedChartDataWithValidation, GeneratePaResponse } from "@/lib/types";

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
type SuggestionLoading = Partial<Record<PaStrengthFactorKey, boolean>>;

type IssueKind = 'fix' | 'risk';

interface AttentionItem {
  id: string;
  kind: IssueKind;
  label: string;
  note: string;
  anchor?: string;
  factorKey?: PaStrengthFactorKey;
  addendum?: string;
  placeholder?: string;
  done: boolean;
}

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

const paStrengthFactors: Array<{
  key: PaStrengthFactorKey;
  label: string;
  placeholder: string;
}> = [
  { key: "diagnosis_codes", label: "Diagnosis Codes", placeholder: "e.g. M17.11, M16.12" },
  { key: "conservative_treatments_named", label: "Conservative Treatments Named", placeholder: "e.g. Physical therapy, NSAIDs" },
  { key: "conservative_treatment_duration", label: "Conservative Treatment Duration", placeholder: "e.g. 8 weeks of PT" },
  { key: "imaging_findings", label: "Imaging Findings", placeholder: "e.g. MRI: full thickness tear" },
  { key: "functional_limitations", label: "Functional Limitations", placeholder: "e.g. cannot climb stairs" },
  { key: "surgical_approach", label: "Surgical Approach", placeholder: "e.g. arthroscopic" },
  { key: "cpt_code_valid", label: "CPT Code Valid", placeholder: "e.g. 29827" },
  { key: "symptom_duration", label: "Symptom Duration", placeholder: "e.g. 6 months" },
];

const FACTOR_LABELS: Record<PaStrengthFactorKey, string> = Object.fromEntries(
  paStrengthFactors.map(f => [f.key, f.label])
) as Record<PaStrengthFactorKey, string>;

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Attention stream state
  const [mode, setMode] = useState<'review' | 'edit'>('review');
  const [editedLetter, setEditedLetter] = useState("");
  const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [fixDrafts, setFixDrafts] = useState<Record<string, string>>({});
  const [isSuggesting, setIsSuggesting] = useState<SuggestionLoading>({});
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);

  const letterRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<number>(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("pa-review-data");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as ReviewData;
      setData(parsed);
      setEditedLetter(parsed.letter);
    } catch {
      sessionStorage.removeItem("pa-review-data");
    }
  }, []);

  useEffect(() => {
    document.title = "Review PA Packet — Orthren";
    return () => { document.title = "Orthren"; };
  }, []);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const paStrength = data?.extracted.pa_strength;

  const scoreFactors = useMemo(() =>
    paStrengthFactors.map(f => ({
      key: f.key,
      label: f.label,
      placeholder: f.placeholder,
      score: paStrength?.[f.key]?.score ?? 0,
      maxScore: 1 as const,
      weight: paStrengthWeights[f.key],
      note: paStrength?.[f.key]?.note ?? '',
      anchorText: paStrength?.[f.key]?.anchorText,
    })),
    [paStrength]
  );

  const denialFlags: DenialRiskFlag[] = data?.extracted.denial_risk_flags ?? [];

  const attentionItems: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    for (const f of scoreFactors) {
      if (f.score < f.maxScore) {
        items.push({
          id: f.key,
          kind: 'fix',
          label: f.label,
          note: f.note,
          anchor: f.anchorText,
          factorKey: f.key,
          placeholder: f.placeholder,
          done: resolved.includes(f.key),
        });
      }
    }
    for (const r of denialFlags) {
      items.push({
        id: r.id,
        kind: 'risk',
        label: r.label,
        note: r.explanation,
        anchor: r.anchorText || undefined,
        addendum: r.recommendation,
        done: acknowledged.includes(r.id),
      });
    }
    return items;
  }, [scoreFactors, denialFlags, resolved, acknowledged]);

  const openCount = attentionItems.filter(i => !i.done).length;

  const earnedScore = useMemo(() => {
    let e = 0;
    for (const f of scoreFactors) {
      if (f.score >= f.maxScore || resolved.includes(f.key)) e += f.weight;
    }
    return e; // out of 100
  }, [scoreFactors, resolved]);

  const displayScore = (earnedScore / 10).toFixed(1);

  const scoreMeta = useMemo(() => {
    const v = earnedScore / 10;
    if (v >= 8) return { color: '#16a34a', label: openCount > 0 ? 'Strong — clear the open items' : 'Ready to submit' };
    if (v >= 5) return { color: '#d97706', label: 'Moderate — address gaps before submitting' };
    return { color: '#dc2626', label: 'High denial risk — major gaps' };
  }, [earnedScore, openCount]);

  const handleModeToggle = (newMode: 'review' | 'edit') => {
    if (letterRef.current) {
      savedScrollRef.current = letterRef.current.scrollTop;
    }
    setMode(newMode);
  };

  useLayoutEffect(() => {
    if (letterRef.current) {
      letterRef.current.scrollTop = savedScrollRef.current;
    }
  }, [mode]);

  // Animate score bar on load
  useEffect(() => {
    if (!data || hasAnimated.current) return;
    const t = setTimeout(() => {
      setAnimatedScore(earnedScore);
      hasAnimated.current = true;
    }, 80);
    return () => clearTimeout(t);
  }, [data, earnedScore]);

  useEffect(() => {
    if (hasAnimated.current) setAnimatedScore(earnedScore);
  }, [earnedScore]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  function slug(s: string) {
    return s.replace(/[^a-z0-9]/gi, '').slice(0, 24);
  }

  function scrollToAnchor(id: string) {
    const anchor = attentionItems.find(i => i.id === id)?.anchor;
    if (!anchor) return;
    setTimeout(() => {
      const container = letterRef.current;
      const el = document.getElementById('anno-' + slug(anchor));
      if (container && el) {
        container.scrollTo({ top: Math.max(0, el.offsetTop - container.clientHeight / 2 + 30), behavior: 'smooth' });
      }
    }, 30);
  }

  function openIssue(id: string) {
    setActiveIssue(id);
    scrollToAnchor(id);
    setTimeout(() => {
      document.getElementById('rail-card-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }

  function applyFix(factorKey: string) {
    const draft = (fixDrafts[factorKey] || '').trim();
    if (!draft) { showToast('Add a fix note or use Suggest first'); return; }
    setResolved(prev => prev.includes(factorKey) ? prev : [...prev, factorKey]);
    showToast('Gap resolved — regenerate to fold it into the letter');
  }

  function acknowledge(id: string) {
    setAcknowledged(prev => prev.includes(id) ? prev : [...prev, id]);
    showToast('Marked as reviewed');
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleSuggestFix(factorKey: PaStrengthFactorKey, label: string) {
    if (!data || isSuggesting[factorKey]) return;
    setIsSuggesting(cur => ({ ...cur, [factorKey]: true }));
    try {
      const res = await fetch('/api/suggest-fix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ extracted: data.extracted, factor: label }),
      });
      const payload = await res.json() as { suggestion?: string; error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Unable to generate a suggestion.');
      if (payload.suggestion) {
        setFixDrafts(cur => ({ ...cur, [factorKey]: payload.suggestion! }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to generate a suggestion.');
    } finally {
      setIsSuggesting(cur => ({ ...cur, [factorKey]: false }));
    }
  }

  async function handleRegenerate() {
    if (!data || resolved.length === 0 || isRegenerating) return;
    const mfMap: ManualFixes = {};
    for (const key of resolved) {
      mfMap[key as PaStrengthFactorKey] = {
        value: fixDrafts[key] ?? '',
        resolved: true,
        source: 'manual',
      };
    }
    const resolutionContext = resolved
      .map(k => `${FACTOR_LABELS[k as PaStrengthFactorKey]}: ${fixDrafts[k] ?? ''}`)
      .join('\n');
    const { updatedExtracted, updatedRequestDetails } = buildUpdatedPayload(data, mfMap);
    setIsRegenerating(true);
    try {
      const res = await fetch('/api/regenerate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted: updatedExtracted, requestDetails: updatedRequestDetails, resolutionContext }),
      });
      const json = await res.json() as { letter?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Unable to regenerate the letter.');
      if (json.letter) {
        setEditedLetter(json.letter);
        setResolved([]);
        setActiveIssue(null);
        showToast('Letter regenerated with your updates');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Regeneration failed — please try again');
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleDownload() {
    if (!data) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          extracted: data.extracted,
          letter: editedLetter,
          cptCode: data.cptCode,
          payerName: data.payerName,
          providerName: data.providerName,
          practiceName: data.practiceName,
        }),
      });
      if (!res.ok) {
        const payload = await res.json() as { error?: string };
        throw new Error(payload.error ?? 'Unable to export the PA packet.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildDownloadName(data.extracted.patient_name, data.cptCode);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Unable to export the PA packet.');
    } finally {
      setIsDownloading(false);
    }
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (!data) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#F8F9FB] px-6">
        <div className="max-w-md rounded-lg border border-[#e2e8f0] p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-[#1E3A5F]">No packet ready for review</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Generate a packet from a chart PDF first. Patient data is not stored after this browser session.
          </p>
          <Link href="/" className="mt-5 inline-flex rounded-md bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4f7a]">
            Back to upload
          </Link>
        </div>
      </main>
    );
  }

  // ─── Attention items as AnnotationItems for the letter component ──────────
  const annotationItems: AnnotationItem[] = attentionItems
    .filter(i => i.anchor)
    .map(i => ({ id: i.id, kind: i.kind, anchor: i.anchor, done: i.done }));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        height: 'calc(100vh - 3.5rem)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: '#172033',
        background: '#eef1f5',
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header
        style={{
          height: 60,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 24px',
          zIndex: 30,
        }}
      >
        {/* Left: label + divider + title */}
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#1d4f7a' }}>
          Review packet
        </span>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        <h1 style={{ fontSize: 16, fontWeight: 600, color: '#1E3A5F', margin: 0 }}>
          Letter of Medical Necessity
        </h1>

        {/* Patient pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          {data.extracted.patient_name && (
            <span style={{ background: '#f1f5f9', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, color: '#475569' }}>
              {data.extracted.patient_name}
            </span>
          )}
          <span style={{ background: '#f1f5f9', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, color: '#475569' }}>
            CPT {data.cptCode}
          </span>
          {data.isDemo && (
            <span style={{ background: '#fef3c7', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, color: '#92400e' }}>
              Demo
            </span>
          )}
        </div>

        {/* Right: controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Review / Edit toggle */}
          <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 3, display: 'flex', gap: 2 }}>
            {(['review', 'edit'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeToggle(m)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? '#1E3A5F' : '#94a3b8',
                  boxShadow: mode === m ? '0 1px 2px rgba(15,31,51,0.1)' : 'none',
                  fontFamily: 'inherit',
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Regenerate */}
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={resolved.length === 0 || isRegenerating}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '9px 15px',
              fontSize: 13,
              fontWeight: 600,
              color: resolved.length > 0 && !isRegenerating ? '#1d4f7a' : '#cbd5e1',
              cursor: resolved.length > 0 && !isRegenerating ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {isRegenerating ? 'Regenerating…' : `Regenerate${resolved.length > 0 ? ` (${resolved.length})` : ''}`}
          </button>

          {/* Download */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || Boolean(data.isDemo)}
            title={data.isDemo ? 'Download available with a real chart' : undefined}
            style={{
              background: '#1E3A5F',
              color: '#fff',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: isDownloading || data.isDemo ? 'not-allowed' : 'pointer',
              opacity: isDownloading || data.isDemo ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            {isDownloading ? 'Preparing…' : 'Download PA Packet'}
          </button>
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 384px' }}>

        {/* LEFT — Letter hero */}
        <div
          id="stream-doc"
          ref={letterRef}
          style={{ overflowY: 'auto', background: '#eef1f5', padding: '40px 32px 80px' }}
        >
          <div style={{ maxWidth: 768, margin: '0 auto' }}>
            {downloadError && (
              <div style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                {downloadError}
              </div>
            )}

            {mode === 'review' ? (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 6,
                  boxShadow: '0 1px 3px rgba(15,31,51,0.08), 0 12px 36px rgba(15,31,51,0.10)',
                  padding: '60px 64px',
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 15,
                  lineHeight: 1.85,
                  color: '#1f2733',
                }}
              >
                <AnnotatedLetterComponent
                  letter={editedLetter}
                  items={annotationItems}
                  activeIssue={activeIssue}
                  hoverAnchor={hoverAnchor}
                  onIssueClick={openIssue}
                  onHover={setHoverAnchor}
                />
              </div>
            ) : (
              <textarea
                value={editedLetter}
                onChange={e => setEditedLetter(e.target.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #d7dee8',
                  borderRadius: 6,
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 15,
                  lineHeight: 1.85,
                  color: '#1f2733',
                  boxShadow: '0 12px 36px rgba(15,31,51,0.1)',
                  minHeight: '70vh',
                  resize: 'vertical',
                  padding: '60px 64px',
                  outline: 'none',
                  background: '#fff',
                }}
              />
            )}
          </div>
        </div>

        {/* RIGHT — Attention Rail */}
        <div
          style={{
            overflowY: 'auto',
            background: '#fff',
            borderLeft: '1px solid #e2e8f0',
            padding: '22px 20px 60px',
          }}
        >
          {/* Score Card */}
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              padding: 18,
              background: 'linear-gradient(180deg, #fbfdff, #f7fafc)',
            }}
          >
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#94a3b8', margin: 0 }}>
              Packet Strength
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
              <span style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, color: scoreMeta.color }}>
                {displayScore}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}> / 10</span>
            </div>
            <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  background: scoreMeta.color,
                  width: `${animatedScore}%`,
                  transition: 'width 0.8s cubic-bezier(0.2,0.7,0.2,1)',
                }}
              />
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: scoreMeta.color, marginTop: 11, marginBottom: 0 }}>
              {scoreMeta.label}
            </p>
          </div>

          {/* Needs Attention Header */}
          <div style={{ margin: '26px 2px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F', margin: 0 }}>Needs attention</h2>
            {openCount > 0 ? (
              <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                {openCount} open
              </span>
            ) : (
              <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                All clear
              </span>
            )}
          </div>

          {/* Stream Cards */}
          {attentionItems.map(item => (
            <StreamCard
              key={item.id}
              item={item}
              activeIssue={activeIssue}
              fixDraft={fixDrafts[item.id] ?? ''}
              isSuggesting={Boolean(isSuggesting[item.factorKey as PaStrengthFactorKey])}
              onToggle={() => activeIssue === item.id ? setActiveIssue(null) : openIssue(item.id)}
              onHoverEnter={() => setHoverAnchor(item.anchor ?? null)}
              onHoverLeave={() => setHoverAnchor(null)}
              onFixChange={v => setFixDrafts(cur => ({ ...cur, [item.id]: v }))}
              onSuggestFix={() => item.factorKey && handleSuggestFix(item.factorKey, item.label)}
              onApplyFix={() => applyFix(item.id)}
              onAcknowledge={() => acknowledge(item.id)}
            />
          ))}

          {attentionItems.length === 0 && (
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>
              No issues found
            </p>
          )}

          {/* Strength Factors Accordion */}
          <button
            type="button"
            onClick={() => setStrengthOpen(p => !p)}
            style={{
              marginTop: 22,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              background: 'none',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: '#475569',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span>All {scoreFactors.length} strength factors</span>
            <span style={{ fontSize: 11 }}>{strengthOpen ? '▲' : '▼'}</span>
          </button>

          {strengthOpen && (
            <div style={{ marginTop: 6, animation: 'fadeSlideIn 0.15s ease' }}>
              {scoreFactors.map(f => {
                const isFixed = resolved.includes(f.key);
                const isOk = f.score >= f.maxScore;
                const isGap = !isOk && !isFixed;
                const iconBg = isFixed
                  ? { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4f7a' }
                  : isOk
                  ? { bg: '#ecfdf3', border: '#bbf7d0', color: '#16a34a' }
                  : { bg: '#fffbeb', border: '#fde68a', color: '#d97706' };
                const statusText = isFixed ? 'Fixed' : isOk ? 'OK' : 'Gap';
                const statusColor = isFixed ? '#1d4f7a' : isOk ? '#16a34a' : '#d97706';
                return (
                  <div
                    key={f.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, cursor: isGap ? 'pointer' : 'default' }}
                    onClick={() => isGap && openIssue(f.key)}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: `1px solid ${iconBg.border}`,
                        background: iconBg.bg,
                        color: iconBg.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {isFixed ? '✓' : isOk ? '✓' : '!'}
                    </span>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#334155' }}>{f.label}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: statusColor }}>{statusText}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Feedback widget */}
          <div style={{ marginTop: 28 }}>
            <FeedbackWidget
              cptCode={data.cptCode}
              payerName={data.payerName}
              paScore={earnedScore / 10}
              setToast={showToast}
            />
          </div>
        </div>
      </div>

      {/* ── TOAST ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 68,
            right: 20,
            zIndex: 400,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '11px 15px',
            boxShadow: '0 12px 32px rgba(15,31,51,0.16)',
            fontSize: 13,
            fontWeight: 600,
            color: '#334155',
            animation: 'fadeSlideIn 0.18s ease',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#ecfdf3',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            ✓
          </span>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── StreamCard ───────────────────────────────────────────────────────────────

function StreamCard({
  item,
  activeIssue,
  fixDraft,
  isSuggesting,
  onToggle,
  onHoverEnter,
  onHoverLeave,
  onFixChange,
  onSuggestFix,
  onApplyFix,
  onAcknowledge,
}: {
  item: AttentionItem;
  activeIssue: string | null;
  fixDraft: string;
  isSuggesting: boolean;
  onToggle: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onFixChange: (v: string) => void;
  onSuggestFix: () => void;
  onApplyFix: () => void;
  onAcknowledge: () => void;
}) {
  const isOpen = activeIssue === item.id;
  const itemColor = item.done ? '#16a34a' : item.kind === 'fix' ? '#d97706' : '#dc2626';

  const iconContent = item.done ? '✓' : item.kind === 'fix' ? '▲' : '!';
  const iconStyle: React.CSSProperties = item.done
    ? { background: '#ecfdf3', color: '#16a34a' }
    : item.kind === 'fix'
    ? { background: '#fffbeb', color: '#d97706' }
    : { background: '#fef2f2', color: '#dc2626' };

  const kindLabel = item.done ? 'Done' : item.kind === 'fix' ? 'Fixable' : 'Risk';

  return (
    <div
      id={'rail-card-' + item.id}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        border: `1px solid ${isOpen ? itemColor : item.done ? '#bbf7d0' : '#e2e8f0'}`,
        borderRadius: 12,
        marginBottom: 9,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        background: '#fff',
      }}
    >
      {/* Card header button */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 11,
          padding: '13px 14px',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            ...iconStyle,
            width: 22,
            height: 22,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {iconContent}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1E3A5F' }}>{item.label}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: itemColor }}>
              {kindLabel}
            </span>
          </span>
          <span style={{ fontSize: 12, color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.note}
          </span>
        </span>
        <span
          style={{
            color: '#cbd5e1',
            fontSize: 14,
            marginTop: 3,
            flexShrink: 0,
            transform: isOpen ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          ›
        </span>
      </button>

      {/* Expanded detail */}
      {isOpen && (
        <div
          style={{
            borderTop: '1px solid #eef2f7',
            padding: 14,
            background: '#fbfdff',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {item.kind === 'fix' ? (
            <FixDetail
              item={item}
              fixDraft={fixDraft}
              isSuggesting={isSuggesting}
              isResolved={item.done}
              onFixChange={onFixChange}
              onSuggestFix={onSuggestFix}
              onApplyFix={onApplyFix}
            />
          ) : (
            <RiskDetail
              item={item}
              isAcknowledged={item.done}
              onAcknowledge={onAcknowledge}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── FixDetail ────────────────────────────────────────────────────────────────

function FixDetail({
  item,
  fixDraft,
  isSuggesting,
  isResolved,
  onFixChange,
  onSuggestFix,
  onApplyFix,
}: {
  item: AttentionItem;
  fixDraft: string;
  isSuggesting: boolean;
  isResolved: boolean;
  onFixChange: (v: string) => void;
  onSuggestFix: () => void;
  onApplyFix: () => void;
}) {
  return (
    <>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b45309', margin: '0 0 4px' }}>
          Why payers flag this
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569', margin: 0 }}>{item.note}</p>
      </div>

      {isResolved ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '9px 12px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✓</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Fix applied — regenerate the letter to fold it in</span>
        </div>
      ) : (
        <>
          <textarea
            value={fixDraft}
            onChange={e => onFixChange(e.target.value)}
            placeholder={item.placeholder ?? 'Add the missing documentation, or paste from the chart…'}
            style={{
              minHeight: 84,
              resize: 'vertical',
              border: '1px solid #e2e8f0',
              borderRadius: 9,
              padding: 10,
              fontSize: 12.5,
              fontFamily: 'inherit',
              width: '100%',
              boxSizing: 'border-box',
              outline: 'none',
              color: '#334155',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onSuggestFix}
              disabled={isSuggesting}
              style={{
                border: '1px solid #e2e8f0',
                background: '#fff',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: '#1d4f7a',
                cursor: isSuggesting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {isSuggesting ? 'Suggesting…' : '✦ Suggest fix'}
            </button>
            <button
              type="button"
              onClick={onApplyFix}
              disabled={!fixDraft.trim()}
              style={{
                flex: 1,
                background: fixDraft.trim() ? '#1E3A5F' : '#e2e8f0',
                color: fixDraft.trim() ? '#fff' : '#94a3b8',
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: fixDraft.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              Apply fix
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ─── RiskDetail ───────────────────────────────────────────────────────────────

function RiskDetail({
  item,
  isAcknowledged,
  onAcknowledge,
}: {
  item: AttentionItem;
  isAcknowledged: boolean;
  onAcknowledge: () => void;
}) {
  return (
    <>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b91c1c', margin: '0 0 4px' }}>
          Payer risk
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569', margin: 0 }}>{item.note}</p>
      </div>

      {item.addendum && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '10px 12px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', margin: '0 0 4px' }}>
            Suggested chart addendum
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.55, color: '#475569', fontStyle: 'italic', margin: 0 }}>
            {item.addendum}
          </p>
        </div>
      )}

      {isAcknowledged ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '9px 12px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✓</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Reviewed</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAcknowledge}
          style={{
            alignSelf: 'flex-start',
            border: '1px solid #e2e8f0',
            background: '#fff',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: '#475569',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Mark as reviewed
        </button>
      )}
    </>
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
  setToast: (msg: string) => void;
}) {
  const [outcome, setOutcome] = useState<'approved' | 'denied' | 'pending' | null>(null);
  const [denialReason, setDenialReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(selectedOutcome: 'approved' | 'denied' | 'pending', reason?: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cptCode, payerName, outcome: selectedOutcome, denialReason: reason || null, paScore }),
      });
      if (!res.ok) {
        const e = await res.json() as { error?: string };
        throw new Error(e.error ?? 'Failed to submit feedback.');
      }
      setSubmitted(true);
      setToast('Thanks — your feedback helps improve Orthren.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const btnBase: React.CSSProperties = {
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  if (submitted) {
    return (
      <p style={{ fontSize: 13, fontWeight: 600, color: '#475569', margin: 0 }}>
        Thanks — your feedback helps improve Orthren.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F', marginBottom: 10 }}>Did this PA get approved?</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['approved', 'denied', 'pending'] as const).map(o => (
          <button
            key={o}
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setOutcome(o);
              if (o !== 'denied') handleSubmit(o);
            }}
            style={{
              ...btnBase,
              background: outcome === o ? '#1E3A5F' : '#fff',
              color: outcome === o ? '#fff' : '#334155',
            }}
          >
            {o === 'approved' ? '✓ Approved' : o === 'denied' ? '✗ Denied' : '⏳ Pending'}
          </button>
        ))}
      </div>
      {outcome === 'denied' && !submitted && (
        <form
          onSubmit={e => { e.preventDefault(); handleSubmit('denied', denialReason); }}
          style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <input
            type="text"
            placeholder="Denial reason (optional)"
            value={denialReason}
            onChange={e => setDenialReason(e.target.value)}
            disabled={isSubmitting}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" disabled={isSubmitting} style={{ ...btnBase, background: '#1E3A5F', color: '#fff', border: 'none' }}>
              {isSubmitting ? 'Submitting…' : 'Submit'}
            </button>
            <button type="button" onClick={() => { setOutcome(null); setError(null); }} style={btnBase}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function buildDownloadName(patientName: string | null, cptCode: string) {
  const safePatient = (patientName ?? 'patient')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${safePatient}-pa-packet-cpt-${cptCode}.docx`;
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
      practiceName: data.practiceName ?? '',
    },
  };
}

function applyManualFixes(extracted: ExtractedChartDataWithValidation, manualFixes: ManualFixes) {
  const updated: ExtractedChartDataWithValidation = {
    ...extracted,
    diagnosis_codes: [...extracted.diagnosis_codes],
    functional_limitations: [...extracted.functional_limitations],
    conservative_treatments_attempted: extracted.conservative_treatments_attempted.map(t => ({ ...t })),
    imaging_findings: extracted.imaging_findings ? { ...extracted.imaging_findings } : null,
  };

  const diagnosisFix = manualFixes.diagnosis_codes?.resolved ? manualFixes.diagnosis_codes.value : '';
  if (diagnosisFix) updated.diagnosis_codes = splitListValues(diagnosisFix);

  const treatmentsNamed = manualFixes.conservative_treatments_named?.resolved ? manualFixes.conservative_treatments_named.value : '';
  if (treatmentsNamed) {
    updated.conservative_treatments_attempted = splitListValues(treatmentsNamed).map(name => ({
      treatment: name, duration: null, outcome: null, dates: null,
    }));
  }

  const treatmentDuration = manualFixes.conservative_treatment_duration?.resolved ? manualFixes.conservative_treatment_duration.value.trim() : '';
  if (treatmentDuration) {
    if (updated.conservative_treatments_attempted.length === 0) {
      updated.conservative_treatments_attempted = [{ treatment: 'Conservative treatment', duration: treatmentDuration, outcome: null, dates: null }];
    } else {
      updated.conservative_treatments_attempted = updated.conservative_treatments_attempted.map(t => ({ ...t, duration: t.duration ?? treatmentDuration }));
    }
  }

  const imagingFix = manualFixes.imaging_findings?.resolved ? manualFixes.imaging_findings.value : '';
  if (imagingFix) updated.imaging_findings = parseImagingInput(imagingFix);

  const limitationsFix = manualFixes.functional_limitations?.resolved ? manualFixes.functional_limitations.value : '';
  if (limitationsFix) updated.functional_limitations = splitListValues(limitationsFix);

  const surgicalFix = manualFixes.surgical_approach?.resolved ? manualFixes.surgical_approach.value.trim() : '';
  if (surgicalFix) updated.surgical_approach_if_mentioned = surgicalFix;

  const symptomFix = manualFixes.symptom_duration?.resolved ? manualFixes.symptom_duration.value.trim() : '';
  if (symptomFix) updated.symptom_duration = symptomFix;

  return updated;
}

function splitListValues(value: string) {
  return value.split(/[,;\n]/g).map(s => s.trim()).filter(Boolean);
}

function parseImagingInput(value: string) {
  const [modality, ...rest] = value.split(':');
  const findings = rest.join(':').trim();
  if (findings) return { modality: modality.trim() || null, key_findings: findings };
  return { modality: null, key_findings: value.trim() || null };
}
