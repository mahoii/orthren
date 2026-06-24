import Link from "next/link";
import Logo from "@/components/Logo";
import WaitlistForm from "@/components/WaitlistForm";
import ScrollButton from "@/components/ScrollButton";

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-clinical-navy selection:text-white">

      {/* ── 1. NAV ─────────────────────────────────────────────────────────── */}
      {/* Note: The global sticky nav in layout.tsx is still rendered above this page.
          This section intentionally overrides the home link CTA on the right only. */}

      {/* ── 2. HERO ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white px-6 pt-20 pb-24 lg:pt-32 lg:pb-36">
        {/* Decorative background blob */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl"
        >
          <div
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-blue-100 to-cyan-50 opacity-40 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          />
        </div>

        <div className="mx-auto max-w-4xl text-center">
          {/* Pill badge */}
          <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-clinical-navy shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
            Orthopedic Prior Auth, Reimagined
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-clinical-navy sm:text-5xl lg:text-6xl lg:leading-[1.1]">
            Generate payer-ready orthopedic prior auth packets in{" "}
            <span className="text-clinical-blue">60 seconds.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            Built for independent orthopedic practices.{" "}
            <strong className="font-semibold text-slate-800">Fewer denials.</strong>{" "}
            <strong className="font-semibold text-slate-800">Less staff time.</strong>
          </p>

          {/* CTA Form */}
          <div id="waitlist-form" className="mx-auto mt-10 max-w-md">
            <WaitlistForm variant="hero" />
          </div>

          {/* Sandbox CTA */}
          <div className="mt-4 flex justify-center">
            <Link
              href="/login?redirect=/builder"
              id="hero-sandbox-cta"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-clinical-blue hover:border-clinical-blue focus:outline-none focus:ring-2 focus:ring-clinical-blue focus:ring-offset-2"
            >
              Try Interactive Sandbox Demo →
            </Link>
          </div>
        </div>
      </section>

      {/* ── 3. PA STRENGTH SCORE MOCKUP ────────────────────────────────────── */}
      <section className="bg-slate-50 border-y border-slate-200 px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-clinical-navy sm:text-3xl">
              Know your authorization odds before you submit
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-slate-600 text-sm sm:text-base">
              Our clinical AI scores every request against payer-specific rules — and flags exactly what&apos;s missing before denials happen.
            </p>
          </div>

          {/* Browser window mockup */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Chrome bar */}
            <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-100 px-4 py-3">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <div className="mx-auto max-w-sm w-full rounded-md border border-slate-200 bg-white py-1 px-3 text-center text-xs text-slate-400 font-mono select-none">
                orthren.com/review/doe-john-27447
              </div>
            </div>

            {/* App chrome interior */}
            <div className="grid lg:grid-cols-[300px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

              {/* Left: Score sidebar */}
              <div className="bg-white p-5 lg:p-6 flex flex-col gap-5">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">PA Strength Score</p>
                  <p className="mt-2 text-4xl font-extrabold text-green-600">
                    9.2
                    <span className="ml-1 text-lg font-semibold text-slate-400">/ 10</span>
                  </p>
                  <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full w-[92%] rounded-full bg-green-500 transition-all" />
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-500">High probability of immediate approval</p>
                </div>

                <ul className="space-y-2.5">
                  {[
                    { label: "Diagnosis Codes (M17.11)", ok: true },
                    { label: "Conservative Treatment — 8 wks PT", ok: true },
                    { label: "Imaging Findings — K-L Grade III", ok: true },
                    { label: "Symptom Duration (incomplete note)", ok: false },
                  ].map(({ label, ok }) => (
                    <li key={label} className="flex items-center gap-2.5 text-xs">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold ${
                          ok
                            ? "bg-green-100 text-green-600"
                            : "bg-red-50 text-red-500"
                        }`}
                        aria-hidden="true"
                      >
                        {ok ? "✓" : "!"}
                      </span>
                      <span className={ok ? "text-slate-700 font-medium" : "text-slate-400"}>{label}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className="mt-auto w-full rounded-md bg-clinical-navy py-2 text-xs font-semibold text-white hover:bg-clinical-blue transition"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  Fix Issues →
                </button>
              </div>

              {/* Right: Letter preview */}
              <div className="bg-slate-50 p-5 lg:p-6 flex flex-col justify-between gap-4">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-inner text-[11px] font-mono leading-relaxed text-slate-700 max-h-[280px] overflow-y-auto space-y-3">
                  <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                    <div>
                      <p className="font-bold text-slate-900 not-italic">Dr. Jane Smith, MD</p>
                      <p className="text-slate-400 text-[10px]">NYU Langone Orthopedics</p>
                    </div>
                    <p className="text-slate-400 text-[10px]">Date: 05/10/2026</p>
                  </div>
                  <p className="font-bold text-slate-900">RE: Letter of Medical Necessity — Right TKA (CPT 27447)</p>
                  <p>Patient: John Doe &nbsp;|&nbsp; DOB: 01/15/1960 &nbsp;|&nbsp; Payer: Aetna</p>
                  <p className="text-slate-500">
                    Dear Medical Director,<br /><br />
                    I am writing to request prior authorization for a right Total Knee Arthroplasty (CPT 27447) for Mr. John Doe. The patient presents with Kellgren-Lawrence Grade III osteoarthritis with severe joint space narrowing confirmed on weight-bearing radiographs dated 04/15/2026.
                  </p>
                  <div className="rounded-md border border-green-100 bg-green-50 p-3 text-green-800">
                    <strong>Conservative Course Completed:</strong> The patient has failed a full 8-week course of physical therapy (Jan–Mar 2026), oral NSAIDs (Ibuprofen 400 mg daily × 3 months), and a corticosteroid injection on 04/15/2026 with only 2-week partial relief.
                  </div>
                </div>
                <div className="flex justify-end gap-2 shrink-0">
                  <span className="cursor-default rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 font-sans shadow-sm" aria-hidden="true">Edit Text</span>
                  <span className="cursor-default rounded-md bg-clinical-navy px-4 py-1.5 text-xs font-semibold text-white shadow-sm font-sans" aria-hidden="true">Download PA Packet</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. THE PAIN ────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-clinical-navy sm:text-4xl">
              Prior auth is quietly draining your practice
            </h2>
            <p className="mt-4 max-w-xl mx-auto text-slate-600">
              Every manual submission is lost time and money. Every denial is a case that may never be rescheduled.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: "$",
                color: "red",
                title: "Lost Surgeon Revenue",
                body: (
                  <>
                    Each denied orthopedic surgery costs your practice{" "}
                    <strong className="text-red-700 font-bold">$15,000 to $50,000</strong>{" "}
                    in completely unrecoverable lost revenue.
                  </>
                ),
                stat: "• $15k–$50k lost per denial",
              },
              {
                icon: "⏱",
                color: "orange",
                title: "Staff Efficiency Drain",
                body: (
                  <>
                    Manual PA submissions burn{" "}
                    <strong className="text-orange-700 font-bold">$13–$18</strong>{" "}
                    in direct staff time costs — every single time, regardless of outcome.
                  </>
                ),
                stat: "• $13–$18 per submission",
              },
              {
                icon: "!",
                color: "red",
                title: "Compounding Denial Rate",
                body: (
                  <>
                    The baseline orthopedic PA denial rate is{" "}
                    <strong className="text-red-700 font-bold">8–10%</strong>.
                    Orthren targets{" "}
                    <strong className="text-green-700 font-bold">under 1%</strong>.
                  </>
                ),
                stat: "• 8–10% industry baseline",
              },
            ].map(({ icon, title, body, stat }) => (
              <div
                key={title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 text-xl font-extrabold mb-4">
                    {icon}
                  </span>
                  <h3 className="text-base font-bold text-clinical-navy">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
                <p className="mt-5 text-[11px] font-bold uppercase tracking-widest text-red-400">{stat}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-clinical-navy px-6 py-20 lg:py-28 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Zero training. Zero friction.
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-blue-200 text-sm sm:text-base">
              A three-step pipeline that slots directly into your current billing workflow — no IT setup, no EMR integration required.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                num: "01",
                title: "Upload Chart",
                desc: "Drag and drop your orthopedic clinical notes or chart PDF directly into the secure builder interface.",
              },
              {
                num: "02",
                title: "AI Extracts & Scores",
                desc: "The clinical agent extracts objective metrics and scores authorization strength against payer-specific rules.",
              },
              {
                num: "03",
                title: "Download Packet",
                desc: "Retrieve a polished, payer-ready medical necessity narrative package formatted exactly for submission.",
              },
            ].map(({ num, title, desc }) => (
              <div
                key={num}
                className="relative rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-4 right-4 text-5xl font-extrabold text-white/5 select-none font-sans"
                >
                  {num}
                </span>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-sm font-bold text-blue-300">
                  {num.replace("0", "")}
                </div>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm text-blue-100 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <ScrollButton className="rounded-lg border border-white/30 bg-white/10 px-8 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 hover:border-white/50" />
          </div>
        </div>
      </section>

      {/* ── 6. PRICING ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 lg:py-32 bg-slate-50">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-clinical-navy sm:text-4xl">
              Transparent, flat-rate pricing
            </h2>
            <p className="mt-4 max-w-md mx-auto text-slate-600">
              Predictable costs that scale with your practice — no per-submission fees or surprise charges.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Solo Practice */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col justify-between transition-all hover:shadow-md hover:-translate-y-0.5">
              <div>
                <h3 className="text-xl font-bold text-clinical-navy">Solo Practice</h3>
                <p className="mt-1 text-sm text-slate-500">For single surgeons and solo practitioners</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight text-slate-900">$299</span>
                  <span className="text-sm font-semibold text-slate-500">/month</span>
                </div>
                <ul className="mt-8 space-y-3 text-sm text-slate-600">
                  {[
                    "1 active surgeon",
                    "Unlimited prior authorization packets",
                    "Core orthopedic templates (TKA, THA, Spine, Shoulder)",
                    "Live PA Strength Score dashboard",
                    "DOCX export",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span className="mt-0.5 font-bold text-green-500 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="https://calendly.com/kamarishabazz/30min"
                target="_blank"
                rel="noopener noreferrer"
                id="pricing-solo-cta"
                className="mt-8 block w-full rounded-lg border-2 border-clinical-navy px-4 py-2.5 text-center text-sm font-semibold text-clinical-navy transition hover:bg-slate-50"
              >
                Book a Free Demo
              </a>
            </div>

            {/* Small Practice */}
            <div className="relative rounded-2xl border-2 border-clinical-navy bg-white p-8 shadow-lg flex flex-col justify-between transition-all hover:shadow-xl hover:-translate-y-0.5">
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-clinical-navy px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow">
                Most Popular
              </span>
              <div>
                <h3 className="text-xl font-bold text-clinical-navy">Small Practice</h3>
                <p className="mt-1 text-sm text-slate-500">For growing multi-surgeon clinics</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight text-slate-900">$599</span>
                  <span className="text-sm font-semibold text-slate-500">/month</span>
                </div>
                <ul className="mt-8 space-y-3 text-sm text-slate-600">
                  {[
                    "2–5 active surgeons",
                    "Unlimited prior authorization packets",
                    "Priority clinical agent throughput",
                    "Shared clinician login portal",
                    "Dedicated onboarding support",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span className="mt-0.5 font-bold text-green-500 shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="https://calendly.com/kamarishabazz/30min"
                target="_blank"
                rel="noopener noreferrer"
                id="pricing-practice-cta"
                className="mt-8 block w-full rounded-lg bg-clinical-navy px-4 py-2.5 text-center text-sm font-semibold text-white shadow transition hover:bg-clinical-blue"
              >
                Book a Free Demo
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white px-6 py-10 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="text-slate-400">&copy; {new Date().getFullYear()}</span>
          </div>

          <nav className="flex flex-wrap justify-center gap-5 font-semibold" aria-label="Footer navigation">
            <Link href="/privacy" className="hover:text-slate-800 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-800 transition-colors">
              Terms of Service
            </Link>
            <a href="mailto:kamari@orthren.com" className="hover:text-slate-800 transition-colors">
              Email Us
            </a>
            <a
              href="https://linkedin.com/company/orthren/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors"
            >
              LinkedIn
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.8v8.37h2.8v-4.87c0-.26.05-.52.13-.7a1.11 1.11 0 0 1 .97-.73c.6 0 .86.53.86 1.3v5h2.8M6.5 8.37a1.37 1.37 0 1 0 0-2.75 1.37 1.37 0 0 0 0 2.75M8 18.5V10.13H5v8.37h3z" />
              </svg>
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
