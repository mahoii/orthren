"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CLEAN_TKA, MESSY_ROTATOR_CUFF, INCOMPLETE_LUMBAR_FUSION } from "@/lib/demo-data";
import type { GeneratePaResponse } from "@/lib/types";

// ─── Profile registry ──────────────────────────────────────────────────────────
type ProfileKey = "CLEAN_TKA" | "MESSY_ROTATOR_CUFF" | "INCOMPLETE_LUMBAR_FUSION";

type ProfileMeta = {
  label: string;
  sublabel: string;
  cpt: string;
  payer: string;
  provider: string;
  practice: string;
  fileName: string;
  data: GeneratePaResponse;
  scoreLabel: string;
  scoreColor: "green" | "amber" | "red";
};

const PROFILES: Record<ProfileKey, ProfileMeta> = {
  CLEAN_TKA: {
    label: "Clean TKA Chart",
    sublabel: "High score — ready to submit",
    cpt: "27447",
    payer: "BlueCross BlueShield",
    provider: "Dr. R. Chambers, MD",
    practice: "Westbrook Orthopedic Surgery Center",
    fileName: "Maria_Delgado_Chart.pdf",
    data: CLEAN_TKA,
    scoreLabel: "≈ 8.0 / 10",
    scoreColor: "green",
  },
  MESSY_ROTATOR_CUFF: {
    label: "Messy Rotator Cuff",
    sublabel: "Intermediate — minor gaps",
    cpt: "29827",
    payer: "UnitedHealthcare",
    provider: "Dr. Alex Mercer, MD",
    practice: "Brooklyn Sports Medicine",
    fileName: "robert_chen_dictation.docx",
    data: MESSY_ROTATOR_CUFF,
    scoreLabel: "≈ 7.0 / 10",
    scoreColor: "amber",
  },
  INCOMPLETE_LUMBAR_FUSION: {
    label: "Incomplete Lumbar Fusion",
    sublabel: "High denial risk — major gaps",
    cpt: "22630",
    payer: "Cigna",
    provider: "Dr. Sarah Jenkins, MD",
    practice: "Spine & Joint Institute",
    fileName: "eleanor_vance_chart.txt",
    data: INCOMPLETE_LUMBAR_FUSION,
    scoreLabel: "≈ 4.5 / 10",
    scoreColor: "red",
  },
};

const PROFILE_KEYS: ProfileKey[] = [
  "CLEAN_TKA",
  "MESSY_ROTATOR_CUFF",
  "INCOMPLETE_LUMBAR_FUSION",
];

const progressSteps = [
  "Extracting chart data...",
  "Analyzing medical necessity...",
  "Building narrative...",
  "Generating document...",
];

const STEP_INTERVAL_MS = 800;

// ─── Score pill color maps ─────────────────────────────────────────────────────
const scorePillBg: Record<ProfileMeta["scoreColor"], string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

export default function SandboxPage() {
  const router = useRouter();
  const [activeProfile, setActiveProfile] = useState<ProfileKey>("CLEAN_TKA");
  const [isLoading, setIsLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const profile = PROFILES[activeProfile];
  const progressPercent = ((activeStep + 1) / progressSteps.length) * 100;

  function handleSelectProfile(key: ProfileKey) {
    if (isLoading) return;
    setActiveProfile(key);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setActiveStep(0);

    // Step through progress indicators at 800 ms intervals
    for (let step = 1; step < progressSteps.length; step++) {
      await new Promise<void>((resolve) =>
        window.setTimeout(() => {
          setActiveStep(step);
          resolve();
        }, STEP_INTERVAL_MS * step)
      );
    }

    // Hold on last step briefly so the user sees it complete
    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, STEP_INTERVAL_MS)
    );

    // Deep-copy the active profile payload, overwrite top-level request metadata
    sessionStorage.setItem(
      "pa-review-data",
      JSON.stringify({
        ...profile.data,
        cptCode: profile.cpt,
        payerName: profile.payer,
        providerName: profile.provider,
        practiceName: profile.practice,
        isDemo: true,
      })
    );

    router.push("/review");
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB]">
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col justify-center px-6 py-10">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-xs font-semibold tracking-wide text-amber-700 shadow-sm mb-4">
            <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            Interactive Sandbox — No real data processed
          </div>
          <p className="text-sm font-semibold uppercase tracking-wide text-clinical-blue">
            Sandbox Demo
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-clinical-navy md:text-4xl">
            See a payer-ready PA packet built in real time.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Choose a synthetic patient profile below and click &ldquo;Generate PA Packet&rdquo; to watch
            the full pipeline run — zero real data, zero API calls.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-[#CBD5E1] bg-white px-5 py-2.5 text-sm font-semibold text-clinical-navy shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinical-blue focus:ring-offset-2"
            >
              ← Back to homepage
            </Link>
          </div>
        </div>

        {/* ── Profile selector ────────────────────────────────────────────── */}
        <div className="mb-7 rounded-lg border border-clinical-line bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-clinical-navy">
            Select a patient profile to test:
          </p>
          <div className="flex flex-wrap gap-3" role="group" aria-label="Patient profile selector">
            {PROFILE_KEYS.map((key) => {
              const p = PROFILES[key];
              const isActive = activeProfile === key;
              return (
                <button
                  key={key}
                  type="button"
                  id={`sandbox-profile-${key.toLowerCase().replace(/_/g, "-")}`}
                  disabled={isLoading}
                  onClick={() => handleSelectProfile(key)}
                  aria-pressed={isActive}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                    isActive
                      ? "border-clinical-navy bg-clinical-navy text-white shadow-md"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className={`text-xs ${isActive ? "text-blue-200" : "text-slate-500"}`}>
                    {p.sublabel}
                  </span>
                  <span
                    className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      isActive
                        ? "border-white/30 bg-white/10 text-white"
                        : `border ${scorePillBg[p.scoreColor]}`
                    }`}
                  >
                    {p.scoreLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">

          {/* ── Left: static chart card ─────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            {/* Static chart upload zone */}
            <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-8 text-center transition-all">
              {/* File icon */}
              <span
                className="flex h-14 w-14 items-center justify-center rounded-xl bg-clinical-navy/5 mb-4"
                aria-hidden="true"
              >
                <svg
                  className="h-7 w-7 text-clinical-navy"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </span>

              <span className="rounded-full bg-clinical-navy px-4 py-2 text-sm font-semibold text-white shadow-sm mb-4">
                Sample chart loaded
              </span>

              {/* Dynamic filename tied to active profile */}
              <span className="text-xl font-semibold text-clinical-navy">
                {profile.fileName}
              </span>
              <span className="mt-2 text-sm text-slate-500">
                Sample Chart Loaded Automatically
              </span>

              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
                Ready to generate
              </span>
            </div>

            {/* Sandbox notice */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
                Sandbox Mode
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                All fields are pre-configured with synthetic patient data matching the selected
                profile. No real charts, patient records, or API calls are used.
              </p>
            </div>
          </div>

          {/* ── Right: read-only metadata + submit ─────────────────────── */}
          <div className="rounded-lg border border-clinical-line bg-white p-6 shadow-sm">
            <div className="space-y-5">
              <ReadOnlyField label="Procedure CPT code" value={profile.cpt} />
              <ReadOnlyField label="Insurance payer name" value={profile.payer} />
              <ReadOnlyField label="Requesting provider name" value={profile.provider} />
              <ReadOnlyField label="Practice name" value={profile.practice} optional />
            </div>

            {/* Progress loader */}
            {isLoading ? (
              <div className="mt-6 rounded-md border border-clinical-line bg-slate-50 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-clinical-navy animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-clinical-navy animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-clinical-navy animate-bounce [animation-delay:300ms]" />
                  </div>
                  <p className="text-sm font-semibold text-clinical-navy">Generating packet</p>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Simulated analysis running. Your packet will be ready shortly.
                </p>
                <div className="space-y-3">
                  {progressSteps.map((step, index) => (
                    <div key={step} className="flex items-center gap-3 text-sm">
                      <span
                        className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${
                          index < activeStep
                            ? "bg-green-500"
                            : index === activeStep
                            ? "bg-clinical-blue animate-pulse"
                            : "bg-slate-300"
                        }`}
                      />
                      <span
                        className={`${
                          index < activeStep
                            ? "text-slate-400 line-through"
                            : index === activeStep
                            ? "text-slate-800 font-medium"
                            : "text-slate-400"
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              id="sandbox-generate-btn"
              disabled={isLoading}
              className="mt-6 w-full rounded-md bg-clinical-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-clinical-blue disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              {isLoading ? "Generating..." : "Generate PA Packet"}
            </button>

            {isLoading ? (
              <div
                className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-200"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-clinical-navy transition-[width] duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}

// ─── ReadOnlyField ─────────────────────────────────────────────────────────────
type ReadOnlyFieldProps = {
  label: string;
  value: string;
  optional?: boolean;
};

function ReadOnlyField({ label, value, optional }: ReadOnlyFieldProps) {
  return (
    <div>
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {label}
        {optional ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            Optional
          </span>
        ) : null}
        <span className="ml-auto rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clinical-blue">
          Sandbox
        </span>
      </span>
      <input
        readOnly
        value={value}
        tabIndex={-1}
        className="mt-2 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-500 outline-none"
      />
    </div>
  );
}
