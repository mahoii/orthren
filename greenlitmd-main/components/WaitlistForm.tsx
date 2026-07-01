"use client";

import { useRef, useState, useTransition } from "react";
import { joinWaitlistAction } from "@/app/actions/waitlist";

interface WaitlistFormProps {
  variant: "hero" | "standalone";
  outlineButton?: boolean;
}

export default function WaitlistForm({ variant, outlineButton }: WaitlistFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await joinWaitlistAction(formData);
      if (result.success) {
        setSuccess(true);
        formRef.current?.reset();
      } else {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  // ── SUCCESS STATE ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-left shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-green-800 mb-1">
          <svg
            className="h-5 w-5 text-green-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Spot Reserved
        </div>
        <p className="text-sm text-green-700 leading-relaxed">
          Welcome to early access. We&apos;ve sent a confirmation to your inbox
          and will be in touch with onboarding details soon.
        </p>
      </div>
    );
  }

  // ── HERO VARIANT ───────────────────────────────────────────────────────────
  if (variant === "hero") {
    return (
      <>
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
          aria-label="Early access request form"
        >
          {/* Honeypot */}
          <div aria-hidden="true" className="hidden">
            <input name="honey" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="flex-1">
            <label htmlFor="hero-email" className="sr-only">
              Work email address
            </label>
            <input
              id="hero-email"
              name="email"
              type="email"
              required
              placeholder="Enter your work email..."
              disabled={isPending}
              className="w-full rounded-lg border border-clinical-line bg-white px-4 py-3 text-sm shadow-sm outline-none placeholder-slate-400 transition focus:border-clinical-navy focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={outlineButton
              ? "rounded-lg border border-slate-900 px-6 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:border-slate-300 disabled:text-slate-300 disabled:cursor-not-allowed"
              : "rounded-lg bg-clinical-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-blue hover:shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed"}
          >
            {isPending ? "Requesting..." : "Request Early Access →"}
          </button>
        </form>

        {error && (
          <p
            className="mt-3 px-1 text-sm font-semibold text-red-600 text-left"
            role="alert"
          >
            ⚠ {error}
          </p>
        )}

        <p className="mt-3 text-xs text-slate-400 text-center">
          No credit card required. Limited early-access spots.
        </p>
      </>
    );
  }

  // ── STANDALONE VARIANT ─────────────────────────────────────────────────────
  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-8"
    >
      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Honeypot */}
        <div aria-hidden="true" className="hidden">
          <label htmlFor="honey-standalone">Do not fill this out if you are human</label>
          <input
            id="honey-standalone"
            name="honey"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-2">
            Work Email
          </span>
          <input
            name="email"
            type="email"
            required
            placeholder="you@practice.com"
            disabled={isPending}
            className="w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
          />
        </label>

        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-2">
            Practice Name{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            name="practice_name"
            type="text"
            placeholder="Orthopedic Associates of..."
            disabled={isPending}
            className="w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-clinical-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-clinical-blue disabled:cursor-not-allowed disabled:bg-slate-300 mt-2"
        >
          {isPending ? "Joining..." : "Join the waitlist"}
        </button>
      </div>
    </form>
  );
}
