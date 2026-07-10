"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function UnsubscribeInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!token) return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to process unsubscribe request.");
      }
      router.push("/unsubscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process unsubscribe request.");
      setStatus("error");
    }
  }

  if (!token) {
    return (
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8 text-center">
        <h1 className="text-2xl font-bold text-clinical-navy mb-3">Invalid link</h1>
        <p className="text-slate-600 leading-relaxed">This unsubscribe link is missing or malformed.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8 text-center">
      <h1 className="text-2xl font-bold text-clinical-navy mb-3">Unsubscribe from Orthren</h1>
      <p className="text-slate-600 leading-relaxed mb-6">
        Confirm below to stop receiving emails from the Orthren waitlist.
      </p>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center rounded-md bg-[#1E3A5F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4f7a] disabled:opacity-60"
      >
        {status === "submitting" ? "Unsubscribing…" : "Confirm unsubscribe"}
      </button>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB] flex items-center justify-center p-6">
      <Suspense fallback={null}>
        <UnsubscribeInner />
      </Suspense>
    </main>
  );
}
