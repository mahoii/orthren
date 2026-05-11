"use client";

import { ChangeEvent, DragEvent, FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeneratePaResponse } from "@/lib/types";

const progressSteps = [
  "Extracting chart data...",
  "Analyzing medical necessity...",
  "Building narrative...",
  "Generating document..."
];

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
  const [cptCode, setCptCode] = useState("");
  const [payerName, setPayerName] = useState("");
  const [providerName, setProviderName] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hasRequiredFields = useMemo(
    () => Boolean(file && cptCode.trim() && payerName.trim() && providerName.trim()),
    [cptCode, file, payerName, providerName]
  );

  const cptWarning = useMemo(() => getCptWarning(cptCode), [cptCode]);

  const progressPercent = ((activeStep + 1) / progressSteps.length) * 100;

  function selectPdf(selectedFile: File | undefined) {
    setError(null);

    if (!selectedFile) {
      return;
    }

    if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF chart.");
      return;
    }

    setFile(selectedFile);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectPdf(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectPdf(event.dataTransfer.files?.[0]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isLoading) {
      return;
    }

    if (!file) {
      setError("Upload a patient chart PDF before generating the packet.");
      return;
    }

    if (!cptCode.trim() || !payerName.trim() || !providerName.trim()) {
      setError("Complete all request details before generating the packet.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setActiveStep(0);

    const progressTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, 1800);

    try {
      const formData = new FormData();
      formData.append("chart", file);
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
            Generate a payer-ready prior authorization packet.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Upload the chart, enter the request details, and review the AI-assisted draft before exporting the final packet.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">
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
            <input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
            <span className="rounded-full bg-clinical-navy px-4 py-2 text-sm font-semibold text-white shadow-sm">
              PDF chart upload
            </span>
            <span className="mt-5 text-xl font-semibold text-clinical-navy">
              {file ? file.name : "Drag and drop the patient chart here"}
            </span>
            <span className="mt-3 text-sm text-slate-500">or click to browse for a PDF file</span>
            {file ? <span className="mt-4 text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span> : null}
          </label>

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
                <p className="text-sm font-semibold text-clinical-navy">Generating packet</p>
                <div className="mt-4 space-y-3">
                  {progressSteps.map((step, index) => (
                    <div key={step} className="flex items-center gap-3 text-sm">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          index <= activeStep ? "bg-clinical-blue" : "bg-slate-300"
                        }`}
                      />
                      <span className={index <= activeStep ? "text-slate-800" : "text-slate-400"}>{step}</span>
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
