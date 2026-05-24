# Implementation Plan - Static Fronting Landing Page & App Migration

This plan replaces the homepage at `app/page.tsx` with a stunning, high-converting premium static landing page for Greenlit MD, while migrating the original Prior Auth Builder app to `/builder` (`app/builder/page.tsx`) to maintain full functional access.

---

## Blueprint & Roadmap

We will divide the execution into three phases:
1. **Migrate existing builder page** to `app/builder/page.tsx` and verify absolute routing integrity.
2. **Build the premium static landing page** in `app/page.tsx` with the exact requested vertical stack using state-of-the-art Tailwind design patterns.
3. **Verify waitlist integration** using the existing `/api/waitlist` endpoint for seamless submissions.

---

## Phase 1: Migrate Current Prior Auth App to `/builder`
- **Action:** Move the current `app/page.tsx` file to a new route: [page.tsx](file:///c:/projects/health2/greenlitmd-main/app/builder/page.tsx).
- **Explanation:** This fronts the app while preserving the fully functional packet generator at `http://localhost:3000/builder`.

### Steps:
- [ ] Create `app/builder` directory.
- [ ] Copy the entire existing content of `app/page.tsx` into [app/builder/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/builder/page.tsx).
- [ ] Verify imports work out of the box (uses `@/...` absolute paths, so they compile automatically).

---

## Phase 2: Implement the Static Marketing Landing Page
- **Action:** Replace [app/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/page.tsx) with the new static landing page.
- **Design Aesthetic:** Deep clinical navies, clean slate grays, bright interactive accents, smooth transition micro-animations, glassmorphic layout elements, and zero generic styling placeholders.

### Vertical Stack Structure for `app/page.tsx`:

1. **Navigation Bar**
   - Brand logo lockup (`/logo.png` + "Greenlit MD") on the left linking to `/`.
   - "Request Early Access" primary button (navy) on the right that scrolls smoothly to the CTA sections.
   - A subtle secondary "Launch Demo" button that links to `/builder` for easy developer testing.

2. **Hero Section**
   - Premium pill badge: `"Prior Auth, Reimagined for Orthopedics"`.
   - H1: `"Generate payer-ready orthopedic prior auth packets in 60 seconds."` (Vibrant text sizing, elegant tracking, semi-bold `clinical-navy`).
   - Subhead: `"Built for independent orthopedic practices. Fewer denials. Less staff time."` (text-slate-600, leading-relaxed).
   - Inline CTA: A clean, sleek single-input email form capturing work emails. Fully integrated with state management (`email` entry, loading state, success message box).

3. **Visual Differentiator: PA Strength Score Mockup**
   - A beautiful, responsive, pure HTML/CSS browser mockup container mimicking the `greenlitmd.app/review` interface.
   - Interactive window styling (rounded borders, close/minimize dots, subtle deep shadows, header path).
   - Left Sidebar mockup detailing the **PA Strength Score** (e.g. `9.2 / 10` with a beautiful circular or horizontal green progress bar) and active checklist status items:
     - *Diagnosis Codes* (OK - Green check)
     - *Conservative Treatments* (OK - Green check)
     - *Imaging Findings* (OK - Green check)
     - *Symptom Duration* (Missing - Red alert warning)
   - Right Preview mockup detailing a mock prior authorization request letter:
     ```text
     RE: Prior Authorization Request for L4-L5 Lumbar Interbody Fusion (CPT 22630)
     Patient: John Doe | DOB: 01/15/1960 | Payer: Aetna
     ...
     ```

4. **The Pain Section (Financial & Operational Reality)**
   - 3-column card grid with soft borders and light slate background (`bg-clinical-mist`).
   - Red visual bullet points or badges detailing:
     - **Card 1: Lost Revenue**
       * • Each denied orthopedic surgery costs **$15,000–$50,000** in lost revenue.
     - **Card 2: Operational Drain**
       * • Manual PA submission takes **$13–$18** in staff time, every single time.
     - **Card 3: Baseline Denials**
       * • Industry prior auth denial rate averages **8–10%** — we target **under 1%**.

5. **How It Works (Three-Step Horizontal Flow)**
   - Header: `"Three steps to automated approval."`
   - Steps:
     - **Step 1: Upload Chart** (Drag and drop notes or documents).
     - **Step 2: Extract & Score** (AI reviews clinical data and scores it against payer rules).
     - **Step 3: Download Packet** (Save the custom formatted letter).
   - Visual connector lines or modern grid boxes showing step count badges.

6. **Pricing Cards Section**
   - Two modern pricing packages styled with hover scale transforms:
     - **Solo Practice:** `$299/month` (1 surgeon, unlimited packs, Resend waitlist CTA).
     - **Small Practice:** `$599/month` (2–5 surgeons, dedicated support, Resend waitlist CTA).
   - Full list of features included in each plan.
   - CTA button: "Request Early Access" linked to a smooth scroll to the form.

7. **Footer**
   - Clean double-column layout or centered stacked lockup.
   - Privacy Policy | Terms of Service links.
   - Contact email: `you@greenlitmd.app` (mailto link).
   - LinkedIn link with clean SVG icon.

---

## Detailed Landing Page Component Code Code

Here is the exact code block to be written to `app/page.tsx` by the executor. It handles input states, API fetches to `/api/waitlist` with full loading indicators and error states cleanly.

```tsx
"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWaitlistSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "An error occurred. Please try again.");
      }

      setSuccess(true);
      setEmail("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  const scrollToWaitlist = () => {
    document.getElementById("waitlist-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-clinical-navy selection:text-white">
      {/* 1. Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-base font-bold text-clinical-navy">
              <Image
                src="/logo.png"
                alt="Greenlit MD Logo"
                width={32}
                height={32}
                priority
                className="h-8 w-8 object-contain"
              />
              <span className="font-bold tracking-tight">Greenlit MD</span>
            </Link>
            <Link
              href="/builder"
              className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors sm:block"
            >
              Try Packet Builder &rarr;
            </Link>
          </div>
          <button
            onClick={scrollToWaitlist}
            className="rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-clinical-blue hover:shadow-md"
          >
            Request Early Access
          </button>
        </div>
      </nav>

      {/* 2. Hero */}
      <section className="relative overflow-hidden px-6 py-20 lg:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/50 px-3.5 py-1 text-xs font-semibold tracking-wide text-clinical-navy">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Orthopedic Prior Auth, Accelerated
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-clinical-navy sm:text-5xl lg:text-6xl lg:leading-[1.15]">
            Generate payer-ready orthopedic prior auth packets in 60 seconds.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            Built for independent orthopedic practices. Fewer denials. Less staff time.
          </p>

          <div id="waitlist-form" className="mx-auto mt-10 max-w-md">
            {success ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-left shadow-sm">
                <div className="flex items-center gap-3 text-green-800 font-semibold mb-1">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Spot Reserved Successfully
                </div>
                <p className="text-sm text-green-700">
                  Welcome to early access. We&apos;ve sent a confirmation to your inbox and will reach out with onboarding details soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="flex-1">
                  <label htmlFor="email" className="sr-only">Work Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your work email..."
                    disabled={isLoading}
                    className="w-full rounded-md border border-clinical-line bg-white px-4 py-3 text-sm placeholder-slate-400 shadow-sm outline-none transition focus:border-clinical-navy focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-md bg-clinical-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-clinical-blue disabled:bg-slate-300"
                >
                  {isLoading ? "Requesting..." : "Request Early Access →"}
                </button>
              </form>
            )}
            {error && (
              <p className="mt-3 text-sm font-semibold text-red-600 text-left px-2">
                ⚠️ {error}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 3. PA Strength Score Mockup */}
      <section className="bg-slate-100/50 border-y border-slate-200 px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-clinical-navy sm:text-3xl">
              Visualizing Authorization Strength Instantly
            </h2>
            <p className="mt-3 text-slate-600 max-w-xl mx-auto">
              Our clinical LLM scores each request against specific payer guidelines before you submit, guaranteeing high approval odds.
            </p>
          </div>

          {/* Browser Window Mockup */}
          <div className="rounded-xl border border-slate-300 bg-white shadow-2xl overflow-hidden">
            {/* Top Chrome Bar */}
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <div className="mx-auto max-w-md w-full rounded-md border border-slate-200 bg-white py-1 px-3 text-center text-xs text-slate-400 font-mono">
                greenlitmd.app/review/doe-john-27447
              </div>
            </div>

            {/* Dashboard Contents */}
            <div className="grid lg:grid-cols-[300px_1fr] bg-slate-50 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              {/* Score Dashboard Card (Left) */}
              <div className="p-6 bg-white flex flex-col justify-start">
                <div className="rounded-xl border border-slate-100 bg-[#F8F9FB] p-5 pb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    PA STRENGTH SCORE
                  </p>
                  <p className="mt-2 text-4xl font-extrabold text-green-600">
                    9.2 <span className="text-lg font-medium text-slate-400">/ 10</span>
                  </p>
                  <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-green-500 w-[92%]" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    High probability of immediate payer approval
                  </p>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">✓</span>
                    Diagnosis Codes (M17.11)
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">✓</span>
                    Conservative Treatment Duration (8 weeks PT)
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">✓</span>
                    Imaging Findings (K-L Grade III radiographs)
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-500 font-mono">!</span>
                    Symptom Duration (Incomplete notation)
                  </div>
                </div>
              </div>

              {/* Letter Preview Mockup (Right) */}
              <div className="p-6 bg-slate-50 font-mono text-[11px] leading-relaxed text-slate-700 flex flex-col justify-between">
                <div className="border border-slate-200 rounded bg-white p-5 shadow-inner space-y-4 max-h-[300px] overflow-y-auto">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-900">Dr. Jane Smith, MD</p>
                      <p className="text-slate-400 text-[10px]">NYU Langone Orthopedics</p>
                    </div>
                    <p className="text-slate-400">Date: 05/10/2026</p>
                  </div>
                  <p className="font-bold text-slate-900">RE: Letter of Medical Necessity for Right TKA (CPT 27447)</p>
                  <p>Patient Name: John Doe | DOB: 01/15/1960 | Payer: Aetna</p>
                  <p className="text-slate-500">
                    Dear Medical Director,<br/><br/>
                    I am writing to request prior authorization for a right Total Knee Arthroplasty (CPT 27447) for Mr. John Doe. The patient presents with Kellgren-Lawrence Grade III osteoarthritis and severe joint space narrowing confirmed via weight-bearing radiographs. 
                  </p>
                  <p className="bg-green-50 border border-green-100 p-2 text-green-800 rounded">
                    <strong>Conservative Course Completed:</strong> The patient has failed conservative treatment including a full 8-week course of physical therapy (Jan-Mar 2026), oral NSAIDs (Ibuprofen 400mg daily for 3 months), and a corticosteroid injection on 04/15/2026.
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-2 shrink-0">
                  <span className="rounded bg-slate-200 text-slate-600 px-3 py-1.5 font-sans font-semibold text-xs">Edit Text</span>
                  <span className="rounded bg-clinical-navy text-white px-4 py-1.5 font-sans font-semibold text-xs shadow-sm">Download PDF Packet</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The Pain */}
      <section className="px-6 py-20 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-clinical-navy sm:text-4xl">
              Orthopedic Prior Auths Are Leaking Margin
            </h2>
            <p className="mt-3 text-slate-600 max-w-xl mx-auto">
              Every day your clinical staff spends battling payers is money lost. We turn administrative leakage into secure practice revenue.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm flex flex-col justify-between">
              <div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 text-lg font-bold">
                  $
                </span>
                <h3 className="mt-4 text-lg font-bold text-clinical-navy">Lost Surgeon Revenue</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Each denied orthopedic surgery results in <strong className="text-red-700">$15,000 to $50,000</strong> in completely lost practice revenue.
                </p>
              </div>
              <div className="mt-4 text-xs font-semibold text-red-500 uppercase tracking-wide">
                • $15k - $50k lost per case
              </div>
            </div>

            <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm flex flex-col justify-between">
              <div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 text-lg font-bold">
                  ⏱
                </span>
                <h3 className="mt-4 text-lg font-bold text-clinical-navy">Staff Efficiency Drain</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Manual prior authorization submissions burn <strong className="text-red-700">$13 to $18</strong> in direct staff hourly time, every single time.
                </p>
              </div>
              <div className="mt-4 text-xs font-semibold text-red-500 uppercase tracking-wide">
                • $13 - $18 lost staff cost
              </div>
            </div>

            <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm flex flex-col justify-between">
              <div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600 text-lg font-bold">
                  !
                </span>
                <h3 className="mt-4 text-lg font-bold text-clinical-navy">Compounding Denials</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  The standard baseline orthopedic prior authorization denial rate is <strong className="text-red-700">8% to 10%</strong>. We target <strong className="text-green-600">under 1%</strong>.
                </p>
              </div>
              <div className="mt-4 text-xs font-semibold text-red-500 uppercase tracking-wide">
                • 8% - 10% baseline denial rate
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. How It Works */}
      <section className="bg-clinical-navy text-white px-6 py-20 lg:py-28 relative overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

        <div className="mx-auto max-w-5xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Zero Training. Zero Friction.
            </h2>
            <p className="mt-3 text-blue-200 max-w-xl mx-auto text-sm sm:text-base">
              A simple clinical pipeline designed to slot seamlessly into your current billing workflows.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 relative">
            {/* Step 1 */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm relative">
              <span className="absolute top-4 right-4 text-5xl font-extrabold text-white/5 font-sans">01</span>
              <div className="h-10 w-10 rounded-full bg-blue-500/20 text-blue-300 font-semibold flex items-center justify-center mb-4">1</div>
              <h3 className="text-lg font-bold">Upload Patient Chart</h3>
              <p className="mt-2 text-sm text-blue-100 leading-relaxed">
                Drag and drop your orthopedic clinical notes or chart PDF/TXT directly into our secure secure builder interface.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm relative">
              <span className="absolute top-4 right-4 text-5xl font-extrabold text-white/5 font-sans">02</span>
              <div className="h-10 w-10 rounded-full bg-blue-500/20 text-blue-300 font-semibold flex items-center justify-center mb-4">2</div>
              <h3 className="text-lg font-bold">AI Extracts & Scores</h3>
              <p className="mt-2 text-sm text-blue-100 leading-relaxed">
                The clinical agent instantly extracts objective metrics, treatments, and scores authorization odds against payer rules.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm relative">
              <span className="absolute top-4 right-4 text-5xl font-extrabold text-white/5 font-sans">03</span>
              <div className="h-10 w-10 rounded-full bg-blue-500/20 text-blue-300 font-semibold flex items-center justify-center mb-4">3</div>
              <h3 className="text-lg font-bold">Download Packet</h3>
              <p className="mt-2 text-sm text-blue-100 leading-relaxed">
                Retrieve a polished, medical-necessity narrative package formatted exactly as required by medical reviewers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Pricing */}
      <section className="px-6 py-20 lg:py-32">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-clinical-navy sm:text-4xl">
              Transparent, Predictable Flat Pricing
            </h2>
            <p className="mt-3 text-slate-600 max-w-md mx-auto">
              Pricing that scales with the size of your orthopedic practice, with zero hidden transactional licensing costs.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Solo Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-all">
              <div>
                <h3 className="text-xl font-bold text-clinical-navy">Solo Practice</h3>
                <p className="mt-2 text-sm text-slate-500">Perfect for single surgeons and practitioners</p>
                <div className="mt-6 flex items-baseline">
                  <span className="text-4xl font-extrabold tracking-tight text-slate-900">$299</span>
                  <span className="ml-1 text-sm font-semibold text-slate-500">/month</span>
                </div>
                <ul className="mt-8 space-y-3.5 text-sm text-slate-600">
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> 1 Active Surgeon
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> Unlimited prior authorization packets
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> Core orthopedic templates (TKA, THA, Spine)
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> Live dashboard & PDF export
                  </li>
                </ul>
              </div>
              <button
                onClick={scrollToWaitlist}
                className="mt-8 w-full rounded-md border border-clinical-navy px-4 py-2.5 text-sm font-semibold text-clinical-navy hover:bg-slate-50 transition"
              >
                Request Early Access
              </button>
            </div>

            {/* Small Practice Card */}
            <div className="rounded-2xl border-2 border-clinical-navy bg-white p-8 shadow-md flex flex-col justify-between hover:shadow-lg transition-all relative">
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-clinical-navy px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
                POPULAR
              </span>
              <div>
                <h3 className="text-xl font-bold text-clinical-navy">Small Practice</h3>
                <p className="mt-2 text-sm text-slate-500">Optimized for growing multi-surgeon clinics</p>
                <div className="mt-6 flex items-baseline">
                  <span className="text-4xl font-extrabold tracking-tight text-slate-900">$599</span>
                  <span className="ml-1 text-sm font-semibold text-slate-500">/month</span>
                </div>
                <ul className="mt-8 space-y-3.5 text-sm text-slate-600">
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> 2 to 5 Active Surgeons
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> Unlimited prior authorization packets
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> Priority Clinical Agent throughput
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="text-green-500 font-bold">✓</span> Shared clinician log-in portal
                  </li>
                </ul>
              </div>
              <button
                onClick={scrollToWaitlist}
                className="mt-8 w-full rounded-md bg-clinical-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinical-blue transition"
              >
                Request Early Access
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white text-xs text-slate-500 px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-bold text-clinical-navy">Greenlit MD</span>
            <span>&copy; {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 font-semibold">
            <Link href="/privacy" className="hover:text-slate-800 transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-800 transition">Terms of Service</Link>
            <a href="mailto:you@greenlitmd.app" className="hover:text-slate-800 transition">you@greenlitmd.app</a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-800 transition inline-flex items-center gap-1">
              LinkedIn
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.8v8.37h2.8v-4.87c0-.26.05-.52.13-.7a1.11 1.11 0 0 1 .97-.73c.6 0 .86.53.86 1.3v5h2.8M6.5 8.37a1.37 1.37 0 1 0 0-2.75 1.37 1.37 0 0 0 0 2.75M8 18.5V10.13H5v8.37h3z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

---

## Verification Plan

### Manual Verification
1. Boot the server and check `http://localhost:3000`.
2. Confirm the static landing page loads instantly with full visual assets and icons.
3. Scroll down, click the CTAs to verify the smooth-scroll script captures the viewport correctly.
4. Input a test email (`test@practice.com`) and click **Request Early Access**. Confirm that:
   - The UI correctly displays "Spot Reserved Successfully" card with the green icon.
   - Database captures the email in Supabase and triggers the Resend API confirmation email securely.
5. Manually verify `http://localhost:3000/builder` retains full drag-and-drop packet generator functionalities and is accessible.
