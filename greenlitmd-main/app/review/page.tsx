"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-js/react";
import Link from "next/link";
import AnnotatedLetterComponent, { type AnnotationItem } from "@/components/AnnotatedLetter";
import type { DenialRiskFlag, ExtractedChartData, GeneratePaResponse } from "@/lib/types";
import { getSuggestFixGuidance } from "@/lib/suggest-fix-templates";
import { getPayerChecklist, type PayerRule } from "@/lib/payer-rules";
import { PA_STRENGTH_WEIGHTS } from "@/lib/pa-strength-weights";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewData = GeneratePaResponse & {
  cptCode: string;
  payerName: string;
  providerName: string;
  practiceName?: string;
  isDemo?: boolean;
};

type PaStrengthFactorKey = keyof ExtractedChartData["pa_strength"];

type IssueKind = 'fix' | 'risk';

type FixGuidance = {
  guidance: string;
  inputLabel: string;
  inputPlaceholder: string;
};

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
  guidance?: FixGuidance | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewPage() {
  const posthog = usePostHog();
  const [data, setData] = useState<ReviewData | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [sourceLockWarning, setSourceLockWarning] = useState<string[] | null>(null);

  const [mode, setMode] = useState<'review' | 'edit'>('review');
  const [editedLetter, setEditedLetter] = useState("");
  const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [supplements, setSupplements] = useState<Record<string, string>>({});
  const [expandedFactors, setExpandedFactors] = useState<Set<string>>(new Set());
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [hasRegeneratedAfterMax, setHasRegeneratedAfterMax] = useState(false);
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());

  const [changedParaIds, setChangedParaIds] = useState<Set<number>>(new Set());

  const letterRef = useRef<HTMLDivElement>(null);
  const editDivRef = useRef<HTMLDivElement>(null);
  const annotationSourceRef = useRef<HTMLDivElement>(null);
  const inputDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedScrollRef = useRef<number>(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnimated = useRef(false);
  const prevLetterRef = useRef<string>("");

  useEffect(() => {
    const stored = sessionStorage.getItem("pa-review-data");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as ReviewData;
      setData(parsed);
      setEditedLetter(parsed.letter);
      setSourceLockWarning(parsed.sourceLockWarning ?? null);
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
      weight: PA_STRENGTH_WEIGHTS[f.key],
      note: paStrength?.[f.key]?.note ?? '',
      anchorText: paStrength?.[f.key]?.anchorText,
    })),
    [paStrength]
  );

  const denialFlags: DenialRiskFlag[] = useMemo(
    () => data?.extracted.denial_risk_flags ?? [],
    [data?.extracted.denial_risk_flags]
  );

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
          done: false,
          guidance: getSuggestFixGuidance(f.key, f.score, f.note),
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
  }, [scoreFactors, denialFlags, acknowledged]);

  const openCount = attentionItems.filter(i => !i.done).length;

  const earnedScore = useMemo(() => {
    let e = 0;
    for (const f of scoreFactors) {
      if (f.score >= f.maxScore) e += f.weight;
    }
    return e;
  }, [scoreFactors]);

  const displayScore = (earnedScore / 10).toFixed(1);

  const scoreMeta = useMemo(() => {
    const v = earnedScore / 10;
    if (v >= 8) return { color: '#16a34a', label: openCount > 0 ? 'Strong — clear the open items' : 'Ready to submit' };
    if (v >= 5) return { color: '#d97706', label: 'Moderate — address gaps before submitting' };
    return { color: '#dc2626', label: 'High denial risk — major gaps' };
  }, [earnedScore, openCount]);

  const activeSupplements = useMemo(
    () => Object.fromEntries(Object.entries(supplements).filter(([, v]) => v.trim())),
    [supplements]
  );
  const hasSupplements = Object.keys(activeSupplements).length > 0;

  const handleModeToggle = (newMode: 'review' | 'edit') => {
    if (letterRef.current) {
      savedScrollRef.current = letterRef.current.scrollTop;
    }
    if (newMode === 'edit') {
      // Flush any pending debounce before entering edit so state is current
      if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
      setMode(newMode);
      // After render, seed contenteditable with the annotated HTML
      requestAnimationFrame(() => {
        if (editDivRef.current && annotationSourceRef.current) {
          editDivRef.current.innerHTML = annotationSourceRef.current.innerHTML;
        }
      });
    } else {
      // Leaving edit: flush innerText to state synchronously before re-render
      if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
      if (editDivRef.current) {
        setEditedLetter(editDivRef.current.innerText);
      }
      setMode(newMode);
    }
  };

  function handleContentEditableInput() {
    if (inputDebounceRef.current) clearTimeout(inputDebounceRef.current);
    inputDebounceRef.current = setTimeout(() => {
      if (editDivRef.current) {
        setEditedLetter(editDivRef.current.innerText);
      }
    }, 300);
  }

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

  useEffect(() => {
    if (earnedScore < 100) setHasRegeneratedAfterMax(false);
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

  function toggleCard(id: string) {
    const item = attentionItems.find(i => i.id === id);
    const isExpanding = !expandedFactors.has(id);

    setExpandedFactors(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    if (isExpanding) {
      setActiveIssue(id);
      const anchor = item?.anchor;
      if (anchor) {
        setTimeout(() => {
          const container = letterRef.current;
          const el = document.getElementById('anno-' + slug(anchor));
          if (container && el) {
            container.scrollTo({ top: Math.max(0, el.offsetTop - container.clientHeight / 2 + 30), behavior: 'smooth' });
          }
        }, 30);
      }
      setTimeout(() => {
        document.getElementById('rail-card-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    } else {
      setActiveIssue(null);
    }
  }

  function handleSupplementChange(factorKey: string, value: string) {
    setSupplements(prev => {
      if (!value) {
        const next = { ...prev };
        delete next[factorKey];
        return next;
      }
      return { ...prev, [factorKey]: value };
    });
  }

  function acknowledge(id: string) {
    setAcknowledged(prev => prev.includes(id) ? prev : [...prev, id]);
    showToast('Marked as reviewed');
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleRegenerate() {
    if (!data || !hasSupplements || isRegenerating || data.isDemo) return;

    // Flush any pending contenteditable debounce so a regenerate fired within
    // 300ms of the last keystroke sends the just-typed letter, not the
    // pre-edit version.
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
      inputDebounceRef.current = null;
    }
    const letterToSend = mode === 'edit' && editDivRef.current ? editDivRef.current.innerText : editedLetter;

    prevLetterRef.current = letterToSend;
    setIsRegenerating(true);
    try {
      const res = await fetch('/api/regenerate-denial-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractionJson: data.extracted,
          currentLetter: letterToSend,
          supplements: activeSupplements,
          requestDetails: {
            cptCode: data.cptCode,
            payerName: data.payerName,
            providerName: data.providerName,
            practiceName: data.practiceName ?? "",
          },
        }),
      });
      const json = await res.json() as {
        letter?: string;
        extractionJson?: Partial<ExtractedChartData>;
        cptCode?: string;
        sourceLockWarning?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Unable to regenerate the letter.');
      if (json.letter) {
        // Detect changed paragraphs for amber flash
        const prevParas = prevLetterRef.current.split(/\n\n+/);
        const nextParas = json.letter.split(/\n\n+/);
        const changed = new Set<number>();
        nextParas.forEach((p, i) => { if (p !== prevParas[i]) changed.add(i); });
        setChangedParaIds(changed);
        setTimeout(() => setChangedParaIds(new Set()), 1500);

        setEditedLetter(json.letter);
        setSourceLockWarning(json.sourceLockWarning ?? null);

        // Merge the server-returned extractionJson — it already includes pa_strength
        // freshly recomputed server-side from the merged/supplemented fields (see
        // app/api/regenerate-denial-fix/route.ts), so review-page state / export stop
        // diverging from what the regenerated letter actually says. cptCode is
        // merged too — a cpt_code_valid supplement is routed server-side into an
        // effective CPT (see B1 in AUDIT-FINDINGS.md), and the header pill / export
        // payload / next regenerate request must all move to that corrected value,
        // not silently keep sending the stale one.
        const supplementedKeys = Object.keys(activeSupplements);
        if (json.extractionJson) {
          setData(prev => prev ? {
            ...prev,
            extracted: { ...prev.extracted, ...json.extractionJson },
            cptCode: json.cptCode ?? prev.cptCode,
          } : prev);
        }

        posthog?.capture("letter_regenerated_denial_fix", {
          supplement_count: supplementedKeys.length,
          supplemented_factors: supplementedKeys,
        });

        if (earnedScore === 100) setHasRegeneratedAfterMax(true);

        setSupplements({});
        setAppliedFixes(new Set());
        setExpandedFactors(new Set());
        setActiveIssue(null);
        showToast('Letter revised with your clinical additions');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isOverloaded = msg.toLowerCase().includes('overloaded');
      showToast(isOverloaded
        ? 'AI service is busy — please wait a moment and try again'
        : (msg || 'Regeneration failed — please try again'));
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleDownload() {
    if (!data) return;
    // Flush any pending contenteditable debounce so a download fired within
    // 300ms of the last keystroke exports the just-typed letter.
    if (inputDebounceRef.current) {
      clearTimeout(inputDebounceRef.current);
      inputDebounceRef.current = null;
    }
    const letterToExport = mode === 'edit' && editDivRef.current ? editDivRef.current.innerText : editedLetter;
    posthog?.capture("pa_packet_exported", { cpt_code: data.cptCode, payer: data.payerName });
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          extracted: data.extracted,
          letter: letterToExport,
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

  const supplementBadgeKeys = Object.keys(activeSupplements);

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
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={!hasSupplements || isRegenerating || Boolean(data.isDemo)}
              title={data.isDemo ? 'Regeneration is disabled for demo charts' : undefined}
              style={{
                background: '#fff',
                border: earnedScore === 100 && !hasRegeneratedAfterMax && hasSupplements ? '1.5px solid #22C55E' : '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '9px 15px',
                fontSize: 13,
                fontWeight: 600,
                color: hasSupplements && !isRegenerating && !data.isDemo ? '#1d4f7a' : '#cbd5e1',
                cursor: hasSupplements && !isRegenerating && !data.isDemo ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                animation: earnedScore === 100 && !hasRegeneratedAfterMax && hasSupplements && !data.isDemo
                  ? 'glow-pulse 1.6s ease-out infinite, breath-scale 1.6s ease-in-out infinite'
                  : 'none',
              }}
            >
              {isRegenerating && (
                <svg width="13" height="13" viewBox="0 0 13 13" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                  <circle cx="6.5" cy="6.5" r="5" fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="20 10" />
                </svg>
              )}
              {isRegenerating ? 'Regenerating…' : `Regenerate${hasSupplements ? ` (${supplementBadgeKeys.length})` : ''}`}
            </button>
          </div>

          {/* Download */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || Boolean(data.isDemo) || Boolean(sourceLockWarning?.length)}
            title={
              sourceLockWarning?.length
                ? 'Export is blocked until this letter is regenerated or corrected — see warning below.'
                : data.isDemo
                ? 'Download available with a real chart'
                : undefined
            }
            style={{
              background: '#1E3A5F',
              color: '#fff',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: isDownloading || data.isDemo || sourceLockWarning?.length ? 'not-allowed' : 'pointer',
              opacity: isDownloading || data.isDemo || sourceLockWarning?.length ? 0.5 : 1,
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
            {sourceLockWarning && sourceLockWarning.length > 0 && (
              <div style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', padding: '12px 14px', fontSize: 13, color: '#dc2626' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  This letter contains unverified content and cannot be exported until it&apos;s regenerated or corrected.
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {sourceLockWarning.map((violation, i) => (
                    <li key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>{violation}</li>
                  ))}
                </ul>
              </div>
            )}

            {downloadError && (
              <div style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                {downloadError}
              </div>
            )}

            {/* Hidden annotation source — always rendered so we can read its innerHTML when entering edit mode */}
            <div ref={annotationSourceRef} style={{ display: 'none' }} aria-hidden="true">
              <AnnotatedLetterComponent
                letter={editedLetter}
                items={annotationItems}
                activeIssue={activeIssue}
                hoverAnchor={hoverAnchor}
                onIssueClick={toggleCard}
                onHover={setHoverAnchor}
              />
            </div>

            {mode === 'review' ? (
              <div style={{ position: 'relative' }}>
                {/* Regenerating pill badge */}
                {isRegenerating && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#eef2ff',
                      border: '1px solid #c7d2fe',
                      borderRadius: 999,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#4338ca',
                      animation: 'badge-fade-in 0.2s ease',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#6366f1',
                        animation: 'regenDotPulse 1s ease-in-out infinite',
                        flexShrink: 0,
                      }}
                    />
                    Regenerating…
                  </div>
                )}

                {/* Scanning beam overlay */}
                {isRegenerating && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 6,
                      overflow: 'hidden',
                      pointerEvents: 'none',
                      zIndex: 5,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        height: 120,
                        background: 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.15), transparent)',
                        animation: 'scanBeam 1.8s ease-in-out infinite',
                      }}
                    />
                  </div>
                )}

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
                    opacity: isRegenerating ? 0.4 : 1,
                    pointerEvents: isRegenerating ? 'none' : 'auto',
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  <LetterWithAmberFlash
                    letter={editedLetter}
                    changedParaIds={changedParaIds}
                    annotationItems={annotationItems}
                    activeIssue={activeIssue}
                    hoverAnchor={hoverAnchor}
                    onIssueClick={toggleCard}
                    onHover={setHoverAnchor}
                  />
                </div>
              </div>
            ) : (
              <div
                ref={editDivRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleContentEditableInput}
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1.5px solid #a5b4fc',
                  borderRadius: 6,
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 15,
                  lineHeight: 1.85,
                  color: '#1f2733',
                  boxShadow: '0 12px 36px rgba(15,31,51,0.1)',
                  minHeight: '70vh',
                  padding: '60px 64px',
                  outline: 'none',
                  background: '#fff',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
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

          {/* Payer Criteria Panel */}
          <PayerCriteriaPanel payerRule={data?.payerRule ?? null} extracted={data?.extracted ?? null} />

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
              isExpanded={expandedFactors.has(item.id)}
              activeIssue={activeIssue}
              supplement={supplements[item.id] ?? ''}
              isApplied={appliedFixes.has(item.id)}
              onToggle={() => toggleCard(item.id)}
              onHoverEnter={() => setHoverAnchor(item.anchor ?? null)}
              onHoverLeave={() => setHoverAnchor(null)}
              onSupplementChange={v => handleSupplementChange(item.id, v)}
              onApplyFix={() => setAppliedFixes(prev => { const n = new Set(prev); n.add(item.id); return n; })}
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
                const isOk = f.score >= f.maxScore;
                const isGap = !isOk;
                const iconBg = isOk
                  ? { bg: '#ecfdf3', border: '#bbf7d0', color: '#16a34a' }
                  : { bg: '#fffbeb', border: '#fde68a', color: '#d97706' };
                const statusText = isOk ? 'OK' : 'Gap';
                const statusColor = isOk ? '#16a34a' : '#d97706';
                // Gap rows delegate to the matching StreamCard (same id) via
                // toggleCard, which also scrolls to its letter anchor. Pass
                // rows have no StreamCard/anchor to open — they show their
                // evidence note inline instead, using the same expandedFactors
                // set (a factor is never both a pass and a gap, so the shared
                // set never collides). Previously a passing row rendered only
                // a checkmark with no way to see why it passed. See B2 in
                // AUDIT-FINDINGS.md.
                const isRowExpanded = expandedFactors.has(f.key);
                return (
                  <div key={f.key}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                      onClick={() => {
                        if (isGap) {
                          toggleCard(f.key);
                        } else {
                          setExpandedFactors(prev => {
                            const next = new Set(prev);
                            if (next.has(f.key)) next.delete(f.key); else next.add(f.key);
                            return next;
                          });
                        }
                      }}
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
                        {isOk ? '✓' : '!'}
                      </span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#334155' }}>{f.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: statusColor }}>{statusText}</span>
                      {isOk && (
                        <span style={{ color: '#cbd5e1', fontSize: 11, transform: isRowExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                          ›
                        </span>
                      )}
                    </div>
                    {isOk && isRowExpanded && (
                      <p style={{ margin: '0 10px 8px 37px', fontSize: 12, lineHeight: 1.5, color: '#64748b' }}>
                        {f.note}
                      </p>
                    )}
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
        @keyframes glow-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6); }
          100% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
        }
        @keyframes breath-scale {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.025); }
          100% { transform: scale(1); }
        }
        @keyframes badge-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes amberFlash {
          0%   { background-color: #fef3c7; }
          100% { background-color: transparent; }
        }
        .para-changed {
          animation: amberFlash 1.2s ease-out forwards;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}

// ─── PayerCriteriaPanel ───────────────────────────────────────────────────────

function PayerCriteriaPanel({
  payerRule,
  extracted,
}: {
  payerRule: PayerRule | null;
  extracted: ExtractedChartData | null;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const items = payerRule ? getPayerChecklist(payerRule, extracted) : [];

  function toggle(i: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <div style={{ marginTop: 18, border: '1px solid #e2e8f0', borderRadius: 14, background: 'linear-gradient(180deg, #fbfdff, #f7fafc)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#94a3b8', whiteSpace: 'nowrap' }}>Payer Criteria</span>
          {payerRule ? (
            <span style={{ background: '#eef2ff', color: '#4338ca', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {payerRule.payer_name}
            </span>
          ) : null}
          {payerRule && payerRule.validation_status === "unvalidated" ? (
            <span
              title="This payer's criteria are research-sourced and have not been confirmed against the payer's own portal or clinical policy document. Treat durations and thresholds below as unconfirmed."
              style={{ background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              Research-sourced — not yet verified
            </span>
          ) : null}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 11, flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>▶</span>
      </button>

      {open ? (
        <div style={{ padding: '0 16px 16px' }}>
          {!payerRule ? (
            <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              No specific payer criteria loaded — using general guidelines.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {items.map((item, i) => {
                const isAuto = item.verification !== "unverifiable";
                const isMet = item.verification === "met";
                return (
                  <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={isAuto ? isMet : checked.has(i)}
                      disabled={isAuto}
                      onChange={isAuto ? undefined : () => toggle(i)}
                      style={{
                        marginTop: 3,
                        flexShrink: 0,
                        cursor: isAuto ? 'default' : 'pointer',
                        accentColor: isMet ? '#16a34a' : item.isHardRequirement ? '#dc2626' : '#d97706',
                      }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: item.isHardRequirement ? '#dc2626' : '#b45309' }}>
                        {item.label}
                        {item.isHardRequirement ? null : (
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>optional</span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{item.requirement}</span>
                      {isMet ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>✓ Confirmed in chart</span>
                      ) : item.verification === "not_met" ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#b91c1c' }}>
                          Not found in extracted chart — verify manually
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── LetterWithAmberFlash ─────────────────────────────────────────────────────

function LetterWithAmberFlash({
  letter,
  changedParaIds,
  annotationItems,
  activeIssue,
  hoverAnchor,
  onIssueClick,
  onHover,
}: {
  letter: string;
  changedParaIds: Set<number>;
  annotationItems: AnnotationItem[];
  activeIssue: string | null;
  hoverAnchor: string | null;
  onIssueClick: (id: string) => void;
  onHover: (anchor: string | null) => void;
}) {
  if (changedParaIds.size === 0) {
    return (
      <AnnotatedLetterComponent
        letter={letter}
        items={annotationItems}
        activeIssue={activeIssue}
        hoverAnchor={hoverAnchor}
        onIssueClick={onIssueClick}
        onHover={onHover}
      />
    );
  }

  const paragraphs = letter.split(/\n\n+/);
  return (
    <>
      {paragraphs.map((para, i) => (
        <div key={i} className={changedParaIds.has(i) ? 'para-changed' : undefined} style={{ marginBottom: '1.85em' }}>
          <AnnotatedLetterComponent
            letter={para}
            items={annotationItems}
            activeIssue={activeIssue}
            hoverAnchor={hoverAnchor}
            onIssueClick={onIssueClick}
            onHover={onHover}
          />
        </div>
      ))}
    </>
  );
}

// ─── StreamCard ───────────────────────────────────────────────────────────────

function StreamCard({
  item,
  isExpanded,
  activeIssue,
  supplement,
  isApplied,
  onToggle,
  onHoverEnter,
  onHoverLeave,
  onSupplementChange,
  onApplyFix,
  onAcknowledge,
}: {
  item: AttentionItem;
  isExpanded: boolean;
  activeIssue: string | null;
  supplement: string;
  isApplied: boolean;
  onToggle: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onSupplementChange: (v: string) => void;
  onApplyFix: () => void;
  onAcknowledge: () => void;
}) {
  const effectiveDone = item.done || isApplied;
  const isOpen = isExpanded || (item.kind === 'risk' && activeIssue === item.id);
  const itemColor = effectiveDone ? '#16a34a' : item.kind === 'fix' ? '#d97706' : '#dc2626';

  const iconContent = effectiveDone ? '✓' : item.kind === 'fix' ? '▲' : '!';
  const iconStyle: React.CSSProperties = effectiveDone
    ? { background: '#ecfdf3', color: '#16a34a' }
    : item.kind === 'fix'
    ? { background: '#fffbeb', color: '#d97706' }
    : { background: '#fef2f2', color: '#dc2626' };

  const kindLabel = effectiveDone ? 'Done' : item.kind === 'fix' ? 'Fixable' : 'Risk';

  return (
    <div
      id={'rail-card-' + item.id}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        border: `1px solid ${isOpen ? itemColor : effectiveDone ? '#bbf7d0' : '#e2e8f0'}`,
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
            isApplied ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '9px 12px' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✓</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Reviewed — press Regenerate to update the letter</span>
              </div>
            ) : (
              <FixDetail
                item={item}
                supplement={supplement}
                onSupplementChange={onSupplementChange}
                onApplyFix={onApplyFix}
              />
            )
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
  supplement,
  onSupplementChange,
  onApplyFix,
}: {
  item: AttentionItem;
  supplement: string;
  onSupplementChange: (v: string) => void;
  onApplyFix: () => void;
}) {
  const g = item.guidance;

  return (
    <>
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b45309', margin: '0 0 4px' }}>
          What to add
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569', margin: 0 }}>
          {g?.guidance ?? item.note}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {g?.inputLabel && (
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>
            {g.inputLabel}
          </label>
        )}
        <textarea
          value={supplement}
          onChange={e => onSupplementChange(e.target.value)}
          placeholder={g?.inputPlaceholder ?? (item.placeholder ?? 'Paste the missing data from the chart…')}
          rows={4}
          style={{
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            {supplement.length} chars
          </span>
          <button
            type="button"
            onClick={onApplyFix}
            disabled={!supplement.trim()}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: '#d97706',
              border: 'none',
              borderRadius: 7,
              padding: '4px 12px',
              cursor: supplement.trim() ? 'pointer' : 'default',
              opacity: supplement.trim() ? 1 : 0.25,
              transition: 'opacity 0.15s',
            }}
          >
            Apply fix
          </button>
        </div>
      </div>
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
