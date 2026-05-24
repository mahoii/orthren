"use client";

import { ChangeEvent, DragEvent, FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { GeneratePaResponse } from "@/lib/types";
import { DEMO_PA_DATA } from "@/lib/demo-data";

const progressSteps = [
  "Extracting chart data...",
  "Analyzing medical necessity...",
  "Building narrative...",
  "Generating document..."
];

const maxUploadSizeBytes = 10 * 1024 * 1024;

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

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [cptCode, setCptCode] = useState("");
  const [payerName, setPayerName] = useState("");
  const [providerName, setProviderName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hasRequiredFields = useMemo(
    () => Boolean((file || isDemoMode) && cptCode.trim() && payerName.trim() && providerName.trim()),
    [cptCode, file, isDemoMode, payerName, providerName]
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
      setError("File too large. Please upload a file under 10MB.");
      return;
    }

    // A real file upload cancels demo mode
    setIsDemoMode(false);
    setFile(selectedFile);
  }

  async function handleLoadSample(
    filename: string,
    metadata: { cptCode: string; payerName: string; providerName: string; practiceName: string }
  ) {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`/samples/${filename}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch sample file: ${res.statusText}`);
      }
      const text = await res.text();
      const sampleFile = new File([text], filename, { type: "text/plain" });

      // Update component states precisely
      setFile(sampleFile);
      setCptCode(metadata.cptCode);
      setPayerName(metadata.payerName);
      setProviderName(metadata.providerName);
      setPracticeName(metadata.practiceName);

      // CRITICAL: Bypasses mock storage logic, forcing live API submission
      setIsDemoMode(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load sample chart.");
    } finally {
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

    setIsLoading(true);
    setError(null);
    setActiveStep(0);

    // Demo mode uses a 1000ms interval (4000ms total) for a snappy experience
    const intervalTime = isDemoMode ? 1000 : 7000;
    const progressTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, intervalTime);

    try {
      if (isDemoMode) {
        // Wait for the full animation cycle to complete
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, intervalTime * progressSteps.length)
        );

        sessionStorage.setItem(
          "pa-review-data",
          JSON.stringify({
            ...DEMO_PA_DATA,
            cptCode: cptCode.trim(),
            payerName: payerName.trim(),
            providerName: providerName.trim(),
            practiceName: practiceName.trim(),
            isDemo: true
          })
        );
        router.push("/review");
        return;
      }

      const formData = new FormData();
      formData.append("chart", file!);
      formData.append("cptCode", cptCode.trim());
      formData.append("payerName", payerName.trim());
      formData.append("providerName", providerName.trim());
      formData.append("practiceName", practiceName.trim());

      const response = await fetch("/api/generate-pa", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as GeneratePaResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to generate PA packet.");
      }

      sessionStorage.setItem(
        "pa-review-data",
        JSON.stringify({
          ...(payload as GeneratePaResponse),
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
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col justify-center px-6 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-clinical-blue">Orthopedic PA Builder</p>
          <h1 className="mt-3 text-3xl font-semibold text-clinical-navy md:text-4xl">
            Orthopedic PA denials cost your practice $15K–$50K. Generate payer-ready packets in 60 seconds with Greenlit MD. 
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Upload the chart, enter the request details, and review the AI-assisted draft before exporting the final packet.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-[#CBD5E1] bg-white px-5 py-2.5 text-sm font-semibold text-clinical-navy shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-clinical-blue focus:ring-offset-2"
            >
              &larr; Back to homepage
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-3">
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
              {file
                ? file.name
                : isDemoMode
                ? "Maria_Delgado_Chart.pdf"
                : "Drag and drop the patient chart here"}
            </span>
            <span className="mt-3 text-sm text-slate-500">
              {file && !isDemoMode
                ? "Chart loaded — ready to generate"
                : isDemoMode
                ? "Sample chart loaded — ready to generate"
                : "or click to browse - PDF, DOCX, or TXT supported"}
            </span>
            {file && !isDemoMode ? <span className="mt-4 text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span> : null}
            {isDemoMode && !file ? (
              <span className="mt-4 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Demo — sample patient data
              </span>
            ) : null}
          </label>

          <div className="rounded-lg border border-clinical-line bg-white px-5 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-clinical-navy">
              No chart handy? Load a synthetic sample:
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                {
                  label: "Clean TKA Chart",
                  filename: "clean-tka.txt",
                  metadata: { cptCode: "27447", payerName: "Aetna", providerName: "Jane Smith, MD", practiceName: "NYU Langone Orthopedics" }
                },
                {
                  label: "Messy Rotator Cuff",
                  filename: "messy-rotator-cuff.txt",
                  metadata: { cptCode: "29827", payerName: "UnitedHealthcare", providerName: "Dr. Alex Mercer, MD", practiceName: "Brooklyn Sports Medicine" }
                },
                {
                  label: "Incomplete Lumbar Fusion",
                  filename: "incomplete-lumbar-fusion.txt",
                  metadata: { cptCode: "22630", payerName: "Cigna", providerName: "Dr. Sarah Jenkins, MD", practiceName: "Spine & Joint Institute" }
                }
              ] as const).map(({ label, filename, metadata }) => (
                <button
                  key={filename}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleLoadSample(filename, metadata)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    file?.name === filename
                      ? "border-clinical-navy bg-clinical-navy text-white"
                      : "border-clinical-line bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          </div>

          <div className="rounded-lg border border-clinical-line bg-white p-6 shadow-sm">
            <div className="space-y-5">
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
              <Field
                label="Insurance payer name"
                value={payerName}
                onChange={setPayerName}
                placeholder="e.g. Aetna"
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
                  AI analysis takes 20–40 seconds. Your packet is being built.
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
