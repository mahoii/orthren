"use client";

import { useState } from "react";
import WaitlistForm from "@/components/WaitlistForm";

export default function EarlyAccessAccordion() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-clinical-navy underline-offset-2 hover:underline transition focus:outline-none"
        aria-expanded={open}
      >
        Or request early access →
      </button>

      <div
        className={`w-full max-w-md overflow-hidden transition-all duration-300 ${
          open ? "max-h-56 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <WaitlistForm variant="hero" outlineButton />
      </div>
    </div>
  );
}
