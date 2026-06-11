"use client";

import { useState } from "react";

interface EHRAddendumGeneratorProps {
  hardBlocks: { field: string; label: string; message: string }[];
  softWarnings: { field: string; label: string; message: string }[];
  denialRiskFlags: string[];
  providerName: string;
}

export default function EHRAddendumGenerator({
  hardBlocks,
  softWarnings,
  denialRiskFlags,
  providerName
}: EHRAddendumGeneratorProps) {
  const [criticalCopied, setCriticalCopied] = useState<"idle" | "copied">("idle");
  const [advisoryCopied, setAdvisoryCopied] = useState<"idle" | "copied">("idle");

  if (hardBlocks.length === 0 && softWarnings.length === 0 && denialRiskFlags.length === 0) {
    return null;
  }

  const hasCritical = hardBlocks.length > 0;
  const hasAdvisory = softWarnings.length > 0 || denialRiskFlags.length > 0;

  const criticalMessage = hasCritical
    ? `Dr. ${providerName}, the prior auth packet for this patient cannot be submitted without the following documentation: ${hardBlocks.map((b) => b.label).join(", ")}. Could you please addend the clinical note with these specifics so we can submit without delay?`
    : "";

  const advisoryItems = [
    ...softWarnings.map((w) => w.label),
    ...denialRiskFlags
  ];
  const advisoryMessage = hasAdvisory
    ? `Dr. ${providerName}, to maximize approval probability for this prior auth, the following documentation gaps were flagged: ${advisoryItems.join(", ")}. Addending the note with these details before submission is strongly recommended.`
    : "";

  function handleCriticalCopy() {
    navigator.clipboard.writeText(criticalMessage);
    setCriticalCopied("copied");
    setTimeout(() => setCriticalCopied("idle"), 2000);
  }

  function handleAdvisoryCopy() {
    navigator.clipboard.writeText(advisoryMessage);
    setAdvisoryCopied("copied");
    setTimeout(() => setAdvisoryCopied("idle"), 2000);
  }

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        EHR Addendum Generator
      </p>
      <p className="mt-0.5 text-xs text-slate-400">
        Copy-ready messages for your EHR messaging system
      </p>

      {hasCritical && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">
              ⚠ Critical — Required Before Submission
            </span>
            <button
              onClick={handleCriticalCopy}
              className="text-xs font-medium text-clinical-blue hover:underline"
            >
              {criticalCopied === "copied" ? "Copied!" : "Copy to EHR"}
            </button>
          </div>
          <p className="text-sm leading-relaxed text-amber-900 whitespace-pre-wrap">
            {criticalMessage}
          </p>
        </div>
      )}

      {hasAdvisory && (
        <div className="mt-3 rounded-md border border-clinical-line bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Advisory — Recommended Additions
            </span>
            <button
              onClick={handleAdvisoryCopy}
              className="text-xs font-medium text-clinical-blue hover:underline"
            >
              {advisoryCopied === "copied" ? "Copied!" : "Copy to EHR"}
            </button>
          </div>
          <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
            {advisoryMessage}
          </p>
        </div>
      )}
    </div>
  );
}
