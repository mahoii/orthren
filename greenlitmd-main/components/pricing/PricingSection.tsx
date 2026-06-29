"use client";

import { useState } from "react";

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ??
  // TODO: replace with real Calendly URL
  "https://calendly.com/kamarishabazz/30min";

const SOLO_FEATURES = [
  "AI-assisted Letter of Medical Necessity",
  "PA Strength Score with inline fix suggestions",
  "Denial risk flagging before submission",
  "20+ orthopedic CPT codes (TKA, THA, rotator cuff, spine, shoulder)",
  "All major payers supported",
  "Sub-60-second turnaround",
  "Submission-ready DOCX download",
  "1 user account · Email support",
];

const SMALL_PLUS_FEATURES = [
  "Up to 5 surgeon seats",
  "Multiple staff logins (PA coordinators + front desk)",
  "Dedicated onboarding call + setup support",
  "Priority email support",
];

const FAQS = [
  {
    q: "Is this HIPAA compliant?",
    a: "Yes. Orthren uses a de-identification layer that strips all 18 HIPAA identifiers before any AI processing occurs. Infrastructure-level compliance is enforced through our hosting and data handling architecture.",
  },
  {
    q: "Does my surgeon need to review everything?",
    a: "Yes, and that's by design. Every PA packet is AI-assisted and requires physician review and approval before submission. Nothing is auto-submitted. The AI handles the drafting; the physician confirms accuracy.",
  },
  {
    q: "How long does it take to get started?",
    a: "Most practices are generating their first PA packet within 10 minutes of signing up. Upload a chart, fill in 4 fields, and your packet is ready. No lengthy onboarding required.",
  },
  {
    q: "What if a PA gets denied?",
    a: "The PA Strength Score and denial risk flagging are designed to catch documentation gaps before submission — reducing denials at the source. Automated denial appeal support is on the roadmap.",
  },
  {
    q: "Is there a long-term contract?",
    a: "No. Month-to-month on all plans. Annual billing is available at a discount. Cancel anytime.",
  },
  {
    q: "Does it work with my payer?",
    a: "Orthren works with all major commercial payers including Aetna, BCBS, United Healthcare, Cigna, and Medicare Advantage plans. If you have a specific payer question, reach out before booking a demo.",
  },
];

const PAYERS = [
  "Aetna",
  "BCBS",
  "United Healthcare",
  "Cigna",
  "Medicare Advantage",
  "+ more",
];

function IconShieldCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconUserCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75l1.5 1.5 3-3" />
    </svg>
  );
}

function IconCalculator() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.498-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.504-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm2.498-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25z" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-clinical-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

export default function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);
  const [paPerWeek, setPaPerWeek] = useState(20);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const soloPrice = isAnnual ? 249 : 299;
  const smallPrice = isAnnual ? 499 : 599;
  const roiResult = `$${Math.round(paPerWeek * 4.33 * 16).toLocaleString()}/mo`;

  function handleFaqClick(index: number) {
    setOpenFaq(openFaq === index ? null : index);
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">

      {/* 1. Eyebrow + headline + subhead */}
      <section className="px-6 pt-20 pb-10 text-center">
        <p className="text-xs font-medium tracking-widest uppercase text-clinical-blue mb-4">
          Pricing
        </p>
        <h1 className="mx-auto max-w-[520px] text-3xl font-bold tracking-tight text-clinical-navy sm:text-4xl leading-snug">
          Prior auth denials cost your practice $15K–$50K each. We help prevent them.
        </h1>
        <p className="mt-4 text-slate-500 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          Predictable costs that scale with your practice — no per-submission fees or surprise charges.
        </p>
      </section>

      {/* 2. Billing toggle */}
      <div className="flex items-center justify-center gap-3 pb-10">
        <span className={`text-sm ${!isAnnual ? "text-slate-900 font-medium" : "text-slate-400"}`}>
          Monthly
        </span>
        <button
          onClick={() => setIsAnnual(!isAnnual)}
          role="switch"
          aria-checked={isAnnual}
          aria-label="Toggle annual billing"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-clinical-blue focus:ring-offset-2 ${
            isAnnual ? "bg-clinical-navy" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isAnnual ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className={`text-sm ${isAnnual ? "text-slate-900 font-medium" : "text-slate-400"}`}>
          Annual
        </span>
        <span className={`rounded-full border border-green-100 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 transition-opacity ${isAnnual ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          2 months free
        </span>
      </div>

      {/* 3. Pricing cards */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-4xl grid gap-8 md:grid-cols-2">

          {/* Solo Practice */}
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:-translate-y-0.5">
            <div>
              <h2 className="text-xl font-bold text-clinical-navy">Solo practice</h2>
              <p className="mt-1 text-sm text-slate-500">For single surgeons and solo practitioners</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-slate-900">
                  ${soloPrice}
                </span>
                <span className="text-sm font-semibold text-slate-500">/mo</span>
                {isAnnual && (
                  <span className="ml-1 text-sm text-slate-400 line-through">$299</span>
                )}
              </div>
              {isAnnual ? (
                <p className="mt-1 text-xs text-slate-400">Billed $2,988/year</p>
              ) : (
                <p className="mt-1 text-xs text-transparent select-none">–</p>
              )}
              <ul className="mt-8 space-y-3">
                {SOLO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="mt-0.5"><IconCheck /></span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              id="pricing-solo-cta"
              className="mt-8 block w-full rounded-lg border-2 border-clinical-navy px-4 py-2.5 text-center text-sm font-semibold text-clinical-navy transition hover:bg-slate-50"
            >
              Book a free demo
            </a>
          </div>

          {/* Small Practice */}
          <div className="relative rounded-2xl border-2 border-clinical-navy bg-white p-8 shadow-lg flex flex-col justify-between transition-all hover:shadow-xl hover:-translate-y-0.5">
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-clinical-navy px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow">
              Most Popular
            </span>
            <div>
              <h2 className="text-xl font-bold text-clinical-navy">Small practice</h2>
              <p className="mt-1 text-sm text-slate-500">For growing multi-surgeon clinics</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-slate-900">
                  ${smallPrice}
                </span>
                <span className="text-sm font-semibold text-slate-500">/mo</span>
                {isAnnual && (
                  <span className="ml-1 text-sm text-slate-400 line-through">$599</span>
                )}
              </div>
              {isAnnual ? (
                <p className="mt-1 text-xs text-slate-400">Billed $5,988/year</p>
              ) : (
                <p className="mt-1 text-xs text-transparent select-none">–</p>
              )}
              <ul className="mt-8 space-y-3">
                {SOLO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="mt-0.5"><IconCheck /></span>
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs italic text-slate-400">Everything in solo, plus:</p>
              <ul className="mt-3 space-y-3">
                {SMALL_PLUS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="mt-0.5"><IconPlus /></span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              id="pricing-practice-cta"
              className="mt-8 block w-full rounded-lg bg-clinical-navy px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:bg-clinical-blue"
            >
              Book a free demo
            </a>
          </div>
        </div>
      </section>

      {/* 4. ROI Calculator */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-slate-50 p-8">
          <div className="flex items-center gap-2 mb-6 text-clinical-navy">
            <IconCalculator />
            <h2 className="text-sm font-medium">
              See what you&apos;re currently spending on PA submissions
            </h2>
          </div>

          <div className="flex items-center justify-between mb-2">
            <label htmlFor="pa-slider" className="text-sm text-slate-600">
              PAs submitted per week:
            </label>
            <span className="text-sm font-medium text-slate-900">{paPerWeek}</span>
          </div>
          <input
            id="pa-slider"
            type="range"
            min={1}
            max={100}
            step={1}
            value={paPerWeek}
            onChange={(e) => setPaPerWeek(Number(e.target.value))}
            className="w-full accent-clinical-navy"
          />

          <div className="mt-6 grid sm:grid-cols-2 gap-4 items-center">
            <div>
              <p className="text-sm font-medium text-slate-700">
                Estimated monthly staff time cost
              </p>
              <p className="mt-1 text-xs text-slate-400">
                At $16/submission industry average · vs. $299/month for Orthren
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-2xl font-medium text-green-600">{roiResult}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Trust signals */}
      <section className="px-6 pb-14">
        <div className="mx-auto max-w-2xl flex flex-wrap items-center justify-center gap-6">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="text-clinical-blue"><IconShieldCheck /></span>
            HIPAA-compliant infrastructure
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="text-clinical-blue"><IconClock /></span>
            Sub-60-second turnaround
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="text-clinical-blue"><IconUserCheck /></span>
            Physician-reviewed workflow
          </div>
        </div>
      </section>

      {/* 6. Payer compatibility */}
      <section className="px-6 pb-16 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-4">
          Works with:
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PAYERS.map((p) => (
            <span
              key={p}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
            >
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* 7. FAQ */}
      <section className="px-6 pb-16 bg-slate-50 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-xl font-medium text-clinical-navy mb-8">
            Common questions
          </h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i}>
                  <button
                    onClick={() => handleFaqClick(i)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <IconChevron open={isOpen} />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-sm text-slate-500 leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. Footer CTA strip */}
      <section className="px-6 py-16 text-center border-t border-slate-200">
        <p className="text-sm text-slate-600">
          Practice with 6–10 surgeons?{" "}
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-clinical-blue hover:underline"
          >
            Contact us for enterprise pricing.
          </a>
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Still deciding? Book a 15-minute demo — no commitment required.
        </p>
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-lg border-2 border-clinical-navy px-6 py-2.5 text-sm font-medium text-clinical-navy transition hover:bg-slate-50"
        >
          Book a free demo
        </a>
      </section>

    </div>
  );
}
