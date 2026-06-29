"use client";

import { useState } from "react";
import Link from "next/link";

export function DemoModeBar() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-clinical-navy px-5 py-3 text-sm text-white">
      <p className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
          D
        </span>
        <span>
          You&rsquo;re in demo mode. Sign in to upload real charts.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/login?redirect=/builder"
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-clinical-navy transition hover:bg-slate-100"
        >
          Sign In
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss demo banner"
          className="text-white/60 transition hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
