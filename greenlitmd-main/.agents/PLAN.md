# Plan - Lightweight Outcome Feedback Widget

This plan implements a lightweight outcome feedback widget on the Greenlit MD review page (`app/review/page.tsx`) to capture whether a submitted Prior Authorization (PA) was approved, denied, or pending. The feedback is persisted to Vercel KV using `@vercel/kv` and does not contain any Protected Health Information (PHI).

---

## 📋 Execution Checklist

### 1. Install Dependencies
- [ ] Run `npm install @vercel/kv` in the root of the workspace.
- [ ] Ensure that it is successfully added to `package.json`.

### 2. Create the Feedback API Route
- [ ] Create a new file [app/api/feedback/route.ts](file:///c:/projects/health2/greenlitmd-main/app/api/feedback/route.ts).
- [ ] Implement the `POST` handler with the following features:
  - Export `runtime = "nodejs"`.
  - Import `NextResponse` from `"next/server"`.
  - Import `kv` from `"@vercel/kv"`.
  - Accept and validate the payload:
    - `cptCode`: string
    - `payerName`: string
    - `outcome`: `"approved"` | `"denied"` | `"pending"`
    - `denialReason`: string | null | undefined
    - `paScore`: number (the computed `paScore` value from review page)
  - Generate a secure UUID via `crypto.randomUUID()` and timestamp.
  - Store the record to Vercel KV: `await kv.lpush("pa_outcomes", JSON.stringify(record))`.
  - Handle errors gracefully, returning appropriate HTTP status codes (400 for validation errors, 500 for server errors).

#### `app/api/feedback/route.ts` Blueprint:
```typescript
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

interface FeedbackPayload {
  cptCode: string;
  payerName: string;
  outcome: "approved" | "denied" | "pending";
  denialReason?: string | null;
  paScore: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FeedbackPayload;
    const { cptCode, payerName, outcome, denialReason, paScore } = body;

    // Validate required fields
    if (!cptCode || typeof cptCode !== "string") {
      return NextResponse.json({ error: "cptCode is required and must be a string" }, { status: 400 });
    }
    if (!payerName || typeof payerName !== "string") {
      return NextResponse.json({ error: "payerName is required and must be a string" }, { status: 400 });
    }
    if (!outcome || !["approved", "denied", "pending"].includes(outcome)) {
      return NextResponse.json({ error: "outcome must be 'approved', 'denied', or 'pending'" }, { status: 400 });
    }
    if (typeof paScore !== "number" || isNaN(paScore)) {
      return NextResponse.json({ error: "paScore is required and must be a number" }, { status: 400 });
    }

    // Construct record (No Patient Name, No DOB to ensure zero PHI storage)
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      cptCode: cptCode.trim(),
      payerName: payerName.trim(),
      outcome,
      denialReason: outcome === "denied" ? (denialReason?.trim() || null) : null,
      paScore,
    };

    // Store in Vercel KV list "pa_outcomes"
    await kv.lpush("pa_outcomes", JSON.stringify(record));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### 3. Implement `FeedbackWidget` Component and Wire-up in `app/review/page.tsx`
- [ ] Open [app/review/page.tsx](file:///c:/projects/health2/greenlitmd-main/app/review/page.tsx).
- [ ] Implement a new `FeedbackWidget` component at the bottom of the file or above the other helper components.
- [ ] Inside the `<header>` element, right after the main controls `div` (the one containing "Download PA Packet"), render the `<FeedbackWidget />`.
- [ ] Ensure that `FeedbackWidget` only renders when `data` is not null (which is already true since `data` is checked at the top of `ReviewPage`).

#### `FeedbackWidget` Blueprint:
```typescript
interface FeedbackWidgetProps {
  cptCode: string;
  payerName: string;
  paScore: number;
  setToast: (message: string | null) => void;
}

function FeedbackWidget({ cptCode, payerName, paScore, setToast }: FeedbackWidgetProps) {
  const [outcome, setOutcome] = useState<"approved" | "denied" | "pending" | null>(null);
  const [denialReason, setDenialReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(selectedOutcome: "approved" | "denied" | "pending", reason?: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cptCode,
          payerName,
          outcome: selectedOutcome,
          denialReason: reason || null,
          paScore
        })
      });

      if (!response.ok) {
        const errPayload = await response.json();
        throw new Error(errPayload.error || "Failed to submit feedback.");
      }

      setSubmitted(true);
      setToast("Thanks — your feedback helps improve Greenlit MD.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="border-t border-clinical-line bg-slate-50 px-6 py-3">
        <div className="mx-auto max-w-7xl text-sm font-semibold text-slate-700">
          Thanks — your feedback helps improve Greenlit MD.
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-clinical-line bg-slate-50 px-6 py-3">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-clinical-navy">Did this PA get approved?</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSubmitting || (outcome !== null && outcome !== "approved")}
              onClick={() => {
                setOutcome("approved");
                handleSubmit("approved");
              }}
              className={`rounded border border-clinical-line px-3 py-1.5 text-xs font-semibold transition-colors ${
                outcome === "approved"
                  ? "bg-clinical-navy text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ✓ Approved
            </button>
            <button
              type="button"
              disabled={isSubmitting || (outcome !== null && outcome !== "denied")}
              onClick={() => {
                setOutcome("denied");
              }}
              className={`rounded border border-clinical-line px-3 py-1.5 text-xs font-semibold transition-colors ${
                outcome === "denied"
                  ? "bg-clinical-navy text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ✗ Denied
            </button>
            <button
              type="button"
              disabled={isSubmitting || (outcome !== null && outcome !== "pending")}
              onClick={() => {
                setOutcome("pending");
                handleSubmit("pending");
              }}
              className={`rounded border border-clinical-line px-3 py-1.5 text-xs font-semibold transition-colors ${
                outcome === "pending"
                  ? "bg-clinical-navy text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              ⏳ Pending
            </button>
          </div>
        </div>

        {outcome === "denied" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit("denied", denialReason);
            }}
            className="flex flex-1 items-center gap-2 mt-2 md:mt-0 md:ml-4"
          >
            <label htmlFor="denial-reason-input" className="text-xs font-semibold text-clinical-navy whitespace-nowrap">
              Denial reason (optional):
            </label>
            <input
              id="denial-reason-input"
              type="text"
              placeholder="e.g. Missing conservative treatment details"
              value={denialReason}
              disabled={isSubmitting}
              onChange={(e) => setDenialReason(e.target.value)}
              className="flex-1 max-w-xs rounded border border-clinical-line bg-white px-3 py-1 text-xs font-medium text-slate-800 focus:border-clinical-blue focus:ring-1 focus:ring-blue-100 outline-none"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-clinical-navy px-3 py-1 text-xs font-semibold text-white hover:bg-clinical-blue transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setOutcome(null);
                setError(null);
              }}
              className="rounded border border-clinical-line bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </form>
        )}

        {error && (
          <div className="text-xs font-semibold text-red-600 flex items-center gap-2">
            <span>Error: {error}</span>
            <button
              type="button"
              onClick={() => {
                if (outcome) {
                  handleSubmit(outcome, outcome === "denied" ? denialReason : undefined);
                }
              }}
              className="text-clinical-blue underline hover:text-clinical-navy font-semibold"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

#### Placement inside `app/review/page.tsx` Header:
```tsx
      {/* Header */}
      <header className="border-b border-clinical-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
          ...
        </div>
        <FeedbackWidget
          cptCode={data.cptCode}
          payerName={data.payerName}
          paScore={paScore}
          setToast={setToast}
        />
      </header>
```

### 4. Verification and Type Checking
- [ ] Run `npx tsc --noEmit` from the root directory to confirm the build succeeds with zero compiler/TypeScript errors.
