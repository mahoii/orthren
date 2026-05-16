"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [honey, setHoney] = useState(""); // Honeypot
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, practice_name: practiceName, _honey: honey }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8 text-center">
          <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-clinical-navy mb-3">You're on the list</h1>
          <p className="text-slate-600 mb-8 leading-relaxed">
            We've sent a quick confirmation to your email. We'll reach out personally when early access opens.
          </p>
          <Link
            href="/"
            className="text-sm font-semibold text-clinical-blue hover:text-clinical-navy transition-colors"
          >
            &larr; Back to Greenlit MD
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#F8F9FB] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-clinical-navy mb-4">Join the Waitlist</h1>
          <p className="text-slate-600 leading-relaxed">
            Get early access to the fastest AI prior authorization builder for orthopedic practices.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8">
          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Honeypot field - visually hidden */}
            <div aria-hidden="true" className="hidden">
              <label htmlFor="honey">Do not fill this out if you are human</label>
              <input
                id="honey"
                name="honey"
                type="text"
                value={honey}
                onChange={(e) => setHoney(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-2">Work Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@practice.com"
                disabled={isLoading}
                className="w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                Practice Name
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  Optional
                </span>
              </span>
              <input
                type="text"
                value={practiceName}
                onChange={(e) => setPracticeName(e.target.value)}
                placeholder="e.g. Langone Orthopedics"
                disabled={isLoading}
                className="w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                Phone Number
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  Optional
                </span>
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                disabled={isLoading}
                className="w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full rounded-md bg-clinical-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-clinical-blue disabled:cursor-not-allowed disabled:bg-slate-300 mt-2"
            >
              {isLoading ? "Joining..." : "Join the waitlist"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
