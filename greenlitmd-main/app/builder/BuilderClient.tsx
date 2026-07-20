"use client";

import { ChangeEvent, DragEvent, FormEvent, ReactNode, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import Link from "next/link";
import type { GeneratePaResponse } from "@/lib/types";
import { CLEAN_TKA, MESSY_ROTATOR_CUFF, INCOMPLETE_LUMBAR_FUSION } from "@/lib/demo-data";
import { DemoModeBar } from "./DemoModeBar";
import PayerCombobox from "@/components/PayerCombobox";

type ProfileKey = "CLEAN_TKA" | "MESSY_ROTATOR_CUFF" | "INCOMPLETE_LUMBAR_FUSION";

type ProfileMeta = {
  label: string;
  sublabel: string;
  data: typeof CLEAN_TKA;
  cpt: string;
  payer: string;
  provider: string;
  practice: string;
  fileName: string;
  scoreLabel: string;
  scoreColor: "green" | "amber" | "red";
};

const PROFILES: Record<ProfileKey, ProfileMeta> = {
  CLEAN_TKA: {
    label: "Clean TKA Chart",
    sublabel: "High score — ready to submit",
    data: CLEAN_TKA,
    cpt: "27447",
    payer: "BlueCross BlueShield",
    provider: "Dr. R. Chambers, MD",
    practice: "Westbrook Orthopedic Surgery Center",
    fileName: "Maria_Delgado_Chart.pdf",
    scoreLabel: "≈8.0/10",
    scoreColor: "green",
  },
  MESSY_ROTATOR_CUFF: {
    label: "Messy Rotator Cuff",
    sublabel: "Intermediate — minor gaps",
    data: MESSY_ROTATOR_CUFF,
    cpt: "29827",
    payer: "UnitedHealthcare",
    provider: "Dr. Alex Mercer, MD",
    practice: "Brooklyn Sports Medicine",
    fileName: "robert_chen_dictation.docx",
    scoreLabel: "≈7.0/10",
    scoreColor: "amber",
  },
  INCOMPLETE_LUMBAR_FUSION: {
    label: "Incomplete Lumbar Fusion",
    sublabel: "High denial risk — major gaps",
    data: INCOMPLETE_LUMBAR_FUSION,
    cpt: "22630",
    payer: "Cigna",
    provider: "Dr. Sarah Jenkins, MD",
    practice: "Spine & Joint Institute",
    fileName: "eleanor_vance_chart.txt",
    scoreLabel: "≈4.5/10",
    scoreColor: "red",
  },
};

const PROFILE_KEYS: ProfileKey[] = ["CLEAN_TKA", "MESSY_ROTATOR_CUFF", "INCOMPLETE_LUMBAR_FUSION"];

const scorePillBg: Record<ProfileMeta["scoreColor"], string> = {
  green: "bg-green-50 text-green-700 border-green-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

const progressSteps = [
  "Extracting chart data...",
  "Analyzing medical necessity...",
  "Building narrative...",
  "Generating document..."
];

const maxUploadSizeBytes = 4.5 * 1024 * 1024; // Vercel serverless request-body limit

const commonOrthopedicCptCodes = [
  { code: "27447", description: "Total knee arthroplasty" },
  { code: "27130", description: "Total hip arthroplasty" },
  { code: "27236", description: "ORIF femoral neck fracture" },
  { code: "27244", description: "ORIF intertrochanteric fracture" },
  { code: "29827", description: "Rotator cuff repair arthroscopic" },
  { code: "29826", description: "Shoulder arthroscopy decompression" },
  { code: "29881", description: "Knee arthroscopy meniscectomy" },
  { code: "29880", description: "Knee arthroscopy meniscectomy both" },
  { code: "27187", description: "Prophylactic femur nailing" },
  { code: "22612", description: "Lumbar spinal fusion" },
  { code: "22630", description: "Lumbar interbody fusion" },
  { code: "63047", description: "Lumbar laminectomy" },
  { code: "27370", description: "Knee arthroplasty revision" },
  { code: "27134", description: "Hip arthroplasty revision" },
  { code: "29823", description: "Shoulder arthroscopy debridement" },
  { code: "29824", description: "Distal clavicle excision" },
  { code: "27759", description: "Tibia ORIF" },
  { code: "25600", description: "Closed radius fracture treatment" },
  { code: "23472", description: "Total shoulder arthroplasty" },
  { code: "27695", description: "Ankle ligament repair" }
];

// Demo fixture for ?demo=true — CLEAN_TKA data (CPT 27447) with public-facing metadata
const PUBLIC_DEMO_PROFILE_KEY: ProfileKey = "CLEAN_TKA";
const PUBLIC_DEMO_META = {
  cpt: "27447",
  payer: "United Healthcare",
  provider: "Dr. Elena Marchetti",
  practice: "Atlantic Orthopedics",
} as const;

export interface BuilderSurgeon {
  id: string;
  full_name: string;
}

function UploadPage({ surgeons }: { surgeons: BuilderSurgeon[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPublicDemo = searchParams.get("demo") === "true";
  const posthog = usePostHog();
  const [file, setFile] = useState<File | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(isPublicDemo);
  const [activeTestCase, setActiveTestCase] = useState<ProfileKey | null>(
    isPublicDemo ? PUBLIC_DEMO_PROFILE_KEY : null
  );
  const [cptCode, setCptCode] = useState(isPublicDemo ? PUBLIC_DEMO_META.cpt : "");
  const [payerName, setPayerName] = useState(isPublicDemo ? PUBLIC_DEMO_META.payer : "");
  const [providerName, setProviderName] = useState(isPublicDemo ? PUBLIC_DEMO_META.provider : "");
  const [practiceName, setPracticeName] = useState(isPublicDemo ? PUBLIC_DEMO_META.practice : "");
  const [surgeonId, setSurgeonId] = useState(surgeons.length === 1 ? surgeons[0].id : "");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Surgeon selection is only required for real (non-demo, non-sandbox) submissions
  // by a Team-tier org — solo users and demo/sandbox flows have no surgeon list.
  const requiresSurgeon = surgeons.length > 0 && !isDemoMode;

  const hasRequiredFields = useMemo(
    () =>
      Boolean(
        (file || isDemoMode || activeTestCase) &&
          cptCode.trim() &&
          payerName.trim() &&
          providerName.trim() &&
          (!requiresSurgeon || surgeonId)
      ),
    [cptCode, file, isDemoMode, activeTestCase, payerName, providerName, requiresSurgeon, surgeonId]
  );

  const cptWarning = useMemo(() => getCptWarning(cptCode), [cptCode]);

  const progressPercent = ((activeStep + 1) / progressSteps.length) * 100;

  function selectChartFile(selectedFile: File | undefined) {
    setError(null);

    if (!selectedFile) {
      return;
    }

    const lowerName = selectedFile.name.toLowerCase();
    const isPdf = selectedFile.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isDocx =
      selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx");
    const isTxt = selectedFile.type === "text/plain" || lowerName.endsWith(".txt");

    if (!isPdf && !isDocx && !isTxt) {
      setError("Only PDF, DOCX, and TXT files are supported");
      return;
    }

    if (selectedFile.size > maxUploadSizeBytes) {
      setError("File too large. Please upload a file under 4.5MB.");
      return;
    }

    // A real file upload cancels demo mode and clears any active test case
    setIsDemoMode(false);
    setActiveTestCase(null);
    setFile(selectedFile);
  }

  async function triggerTestCase(key: ProfileKey) {
    if (isLoading) return;

    setError(null);
    setIsLoading(true);
    setActiveStep(0);
    setActiveTestCase(key);
    setIsDemoMode(true);
    setFile(null);

    const profile = PROFILES[key];

    // Auto-fill form fields from the profile metadata
    setCptCode(profile.cpt);
    setPayerName(profile.payer);
    setProviderName(profile.provider);
    setPracticeName(profile.practice);

    // Simulate 1.5-second loading state — step through progress indicators
    const stepInterval = Math.floor(1500 / progressSteps.length);
    const progressTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, stepInterval);

    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1500));

      sessionStorage.setItem(
        "pa-review-data",
        JSON.stringify({
          ...profile.data,
          cptCode: profile.cpt,
          payerName: profile.payer,
          providerName: profile.provider,
          practiceName: profile.practice,
          isDemo: true
        })
      );
      router.push("/review");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to run simulation.");
    } finally {
      window.clearInterval(progressTimer);
      setIsLoading(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectChartFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectChartFile(event.dataTransfer.files?.[0]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoading) {
      return;
    }

    if (!isDemoMode && !file) {
      setError("Upload a patient chart file before generating the packet.");
      return;
    }

    if (!cptCode.trim() || !payerName.trim() || !providerName.trim()) {
      setError("Complete all request details before generating the packet.");
      return;
    }

    if (requiresSurgeon && !surgeonId) {
      setError("Select the surgeon this PA is for.");
      return;
    }

    if (file && file.size > maxUploadSizeBytes) {
      setError("File too large. Please upload a file under 4.5MB.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setActiveStep(0);

    // If a Test Case is active, simulate 1.5s and save its specific JSON profile
    if (activeTestCase) {
      const profile = PROFILES[activeTestCase];
      const stepInterval = Math.floor(1500 / progressSteps.length);
      const progressTimer = window.setInterval(() => {
        setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
      }, stepInterval);

      try {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1500));

        sessionStorage.setItem(
          "pa-review-data",
          JSON.stringify({
            ...profile.data,
            cptCode: cptCode.trim(),
            payerName: payerName.trim(),
            providerName: providerName.trim(),
            practiceName: practiceName.trim(),
            isDemo: true
          })
        );
        router.push(isPublicDemo ? "/review?demo=true" : "/review");
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to run simulation.");
      } finally {
        window.clearInterval(progressTimer);
        setIsLoading(false);
      }
      return;
    }

    posthog?.capture("pa_generation_started", {
      cpt_code: cptCode.trim(),
      payer: payerName.trim(),
      file_type: file!.type,
    });

    const intervalTime = 7000;
    const progressTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, intervalTime);

    try {

      const formData = new FormData();
      formData.append("chart", file!);
      formData.append("cptCode", cptCode.trim());
      formData.append("payerName", payerName.trim());
      formData.append("providerName", providerName.trim());
      formData.append("practiceName", practiceName.trim());
      if (surgeonId) formData.append("surgeonId", surgeonId);

      const response = await fetch("/api/generate-pa", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as GeneratePaResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to generate PA packet.");
      }

      // pa_generation_succeeded is captured server-side (app/api/generate-pa/route.ts),
      // which already has duration_ms and a stable distinctId — capturing it again here
      // would double-count the event.
      const reviewPayload = payload as GeneratePaResponse;
      sessionStorage.setItem(
        "pa-review-data",
        JSON.stringify({
          ...reviewPayload,
          cptCode: cptCode.trim(),
          payerName: payerName.trim(),
          providerName: providerName.trim(),
          practiceName: practiceName.trim()
        })
      );
      router.push("/review");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to generate PA packet.");
    } finally {
      window.clearInterval(progressTimer);
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB]">
      {isPublicDemo && <DemoModeBar />}
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col justify-center px-6 py-10">

        {/* ── Header — conditional on sandbox mode ───────────────────────── */}
        <div className="mb-8">
          {activeTestCase !== null ? (
            <>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 text-xs font-semibold tracking-wide text-amber-700 shadow-sm mb-4">
                <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Interactive Sandbox — No real data processed
              </div>
              <p className="text-sm font-semibold uppercase tracking-wide text-clinical-blue">SANDBOX DEMO</p>
              <h1 className="mt-3 text-3xl font-semibold text-clinical-navy md:text-4xl">
                See a payer-ready PA packet built in real time.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Choose a synthetic patient profile below and click &ldquo;Generate PA Packet&rdquo; to watch
                the full pipeline run — zero real data, zero API calls.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-wide text-clinical-blue">Orthopedic PA Builder</p>
              <h1 className="mt-3 text-3xl font-semibold text-clinical-navy md:text-4xl">
                Orthopedic PA denials cost your practice $15K–$50K. Generate payer-ready packets in 60 seconds with Orthren.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                Upload the chart, enter the request details, and review the AI-assisted draft before exporting the final packet.
              </p>
            </>
          )}
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-[#CBD5E1] bg-white px-5 py-2.5 text-sm font-semibold text-clinical-navy shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinical-blue focus:ring-offset-2"
            >
              &larr; Back to homepage
            </Link>
          </div>
        </div>

        {/* ── Profile selector — always visible ──────────────────────────── */}
        <div className="mb-7 rounded-lg border border-clinical-line bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-clinical-navy">
            SELECT A PATIENT PROFILE TO TEST:
          </p>
          <div className="flex flex-wrap gap-3" role="group" aria-label="Patient profile selector">
            {PROFILE_KEYS.map((key) => {
              const p = PROFILES[key];
              const isActive = activeTestCase === key;
              return (
                <button
                  key={key}
                  type="button"
                  id={`test-case-${key.toLowerCase().replace(/_/g, "-")}`}
                  disabled={isLoading}
                  onClick={() => triggerTestCase(key)}
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

          {/* ── Left panel — conditional on sandbox mode ────────────────── */}
          <div className="flex flex-col gap-3">
            {activeTestCase !== null ? (
              <>
                {/* Static chart card */}
                <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-8 text-center transition-all">
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
                  <span className="text-xl font-semibold text-clinical-navy">
                    {PROFILES[activeTestCase].fileName}
                  </span>
                  <span className="mt-2 text-sm text-slate-500">Sample Chart Loaded Automatically</span>
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
                    Ready to generate
                  </span>
                </div>

                {/* Sandbox mode banner */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
                    SANDBOX MODE
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    All fields are pre-configured with synthetic patient data matching the selected
                    profile. No real charts, patient records, or API calls are used.
                  </p>
                </div>
              </>
            ) : isPublicDemo ? (
              /* Public demo — upload disabled */
              <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-200 mb-4" aria-hidden="true">
                  <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-slate-500">Demo mode — file upload disabled</p>
                <p className="mt-2 text-xs text-slate-400 max-w-xs">
                  A sample chart is pre-loaded below.{" "}
                  <Link href="/login?redirect=/builder" className="text-clinical-blue underline underline-offset-2 hover:text-clinical-navy">
                    Sign in
                  </Link>{" "}
                  to upload real patient charts.
                </p>
              </div>
            ) : (
              /* Drag-and-drop file upload zone */
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex min-h-80 cursor-pointer flex-col items-center justify-center rounded-lg border px-8 text-center transition duration-200 hover:shadow-[0_16px_40px_rgba(30,58,95,0.10)] ${
                  isDragging ? "border-clinical-navy bg-blue-50 shadow-[0_16px_40px_rgba(30,58,95,0.10)]" : "border-[#CBD5E1] bg-white"
                }`}
              >
                <input
                  className="sr-only"
                  type="file"
                  accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,text/plain"
                  onChange={handleFileChange}
                />
                <span className="rounded-full bg-clinical-navy px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  Chart upload
                </span>
                <span className="mt-5 text-xl font-semibold text-clinical-navy">
                  {file ? file.name : "Drag and drop the patient chart here"}
                </span>
                <span className="mt-3 text-sm text-slate-500">
                  {file ? "Chart loaded — ready to generate" : "or click to browse - PDF, DOCX, or TXT supported"}
                </span>
                {file ? <span className="mt-4 text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span> : null}
              </label>
            )}
          </div>

          {/* ── Right panel — conditional on sandbox mode ───────────────── */}
          <div className="rounded-lg border border-clinical-line bg-white p-6 shadow-sm">
            <div className="space-y-5">
              {activeTestCase !== null ? (
                <>
                  <ReadOnlyField label="Procedure CPT code" value={cptCode} />
                  <ReadOnlyField label="Insurance payer name" value={payerName} />
                  <ReadOnlyField label="Requesting provider name" value={providerName} />
                  <ReadOnlyField label="Practice name" value={practiceName} optional />
                </>
              ) : (
                <>
                  <Field
                    label="Procedure CPT code"
                    value={cptCode}
                    onChange={setCptCode}
                    placeholder="e.g. 29827"
                    disabled={isLoading}
                  >
                    {cptWarning ? (
                      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                        <p>
                          CPT code {cptWarning.enteredCode} was not recognized as a common orthopedic surgical code. Please
                          verify before continuing.
                        </p>
                        {cptWarning.closestMatch ? (
                          <p className="mt-1 flex items-center gap-3 font-medium">
                            <span>
                              Closest match: CPT {cptWarning.closestMatch.code} - {cptWarning.closestMatch.description}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCptCode(cptWarning.closestMatch!.code)}
                              className="ml-auto inline-flex items-center rounded-md bg-clinical-navy px-2 py-1 text-xs font-semibold text-white hover:bg-clinical-blue"
                            >
                              Use
                            </button>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </Field>
                  <PayerCombobox
                    value={payerName}
                    onChange={setPayerName}
                    cptCode={cptCode}
                    disabled={isLoading}
                  />
                  <Field
                    label="Requesting provider name"
                    value={providerName}
                    onChange={setProviderName}
                    placeholder="e.g. Jane Smith, MD"
                    disabled={isLoading}
                  />
                  <Field
                    label="Practice name"
                    value={practiceName}
                    onChange={setPracticeName}
                    placeholder="e.g. NYU Langone Orthopedics"
                    disabled={isLoading}
                    optional
                  />
                  {surgeons.length > 0 ? (
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">Surgeon</span>
                      <select
                        value={surgeonId}
                        onChange={(event) => setSurgeonId(event.target.value)}
                        disabled={isLoading}
                        className="mt-2 w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                      >
                        <option value="">Select a surgeon…</option>
                        {surgeons.map((surgeon) => (
                          <option key={surgeon.id} value={surgeon.id}>
                            {surgeon.full_name}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1.5 block text-xs text-slate-500">
                        Used for per-surgeon usage tracking on your Team plan.
                      </span>
                    </label>
                  ) : null}
                </>
              )}
            </div>

            {error ? (
              <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

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
                  {activeTestCase !== null
                    ? "Simulated analysis running. Your packet will be ready shortly."
                    : "AI analysis takes 20–40 seconds. Your packet is being built."}
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
                      <span className={`${
                        index < activeStep
                          ? "text-slate-400 line-through"
                          : index === activeStep
                          ? "text-slate-800 font-medium"
                          : "text-slate-400"
                      }`}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!hasRequiredFields}
              className="mt-6 w-full rounded-md bg-clinical-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-clinical-blue disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              {isLoading ? "Generating..." : "Generate PA Packet"}
            </button>
            {isLoading ? (
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
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

export default function BuilderClient({ surgeons = [] }: { surgeons?: BuilderSurgeon[] }) {
  return (
    <Suspense>
      <UploadPage surgeons={surgeons} />
    </Suspense>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  children?: ReactNode;
  optional?: boolean;
};

function Field({ label, value, onChange, placeholder, disabled, children, optional }: FieldProps) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {label}
        {optional ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            Optional
          </span>
        ) : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-2 w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
      />
      {children}
    </label>
  );
}

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

function getCptWarning(code: string) {
  const enteredCode = code.trim();
  const normalizedCode = normalizeCptCode(enteredCode);

  if (!enteredCode || commonOrthopedicCptCodes.some((commonCode) => commonCode.code === normalizedCode)) {
    return null;
  }

  return {
    enteredCode,
    closestMatch: normalizedCode ? findClosestCptCode(normalizedCode) : null
  };
}

function normalizeCptCode(code: string) {
  return code.replace(/\D/g, "");
}

function findClosestCptCode(code: string) {
  return commonOrthopedicCptCodes.reduce((closest, candidate) => {
    const candidateDistance = getLevenshteinDistance(code, candidate.code);
    const closestDistance = getLevenshteinDistance(code, closest.code);

    return candidateDistance < closestDistance ? candidate : closest;
  }, commonOrthopedicCptCodes[0]);
}

function getLevenshteinDistance(firstValue: string, secondValue: string) {
  const rows = Array.from({ length: firstValue.length + 1 }, (_, firstIndex) =>
    Array.from({ length: secondValue.length + 1 }, (_, secondIndex) =>
      firstIndex === 0 ? secondIndex : secondIndex === 0 ? firstIndex : 0
    )
  );

  for (let firstIndex = 1; firstIndex <= firstValue.length; firstIndex += 1) {
    for (let secondIndex = 1; secondIndex <= secondValue.length; secondIndex += 1) {
      const substitutionCost = firstValue[firstIndex - 1] === secondValue[secondIndex - 1] ? 0 : 1;

      rows[firstIndex][secondIndex] = Math.min(
        rows[firstIndex - 1][secondIndex] + 1,
        rows[firstIndex][secondIndex - 1] + 1,
        rows[firstIndex - 1][secondIndex - 1] + substitutionCost
      );
    }
  }

  return rows[firstValue.length][secondValue.length];
}
