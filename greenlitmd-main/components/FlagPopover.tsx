"use client";

import { useEffect, useRef, useState } from "react";

type FlagStatus = "unresolved" | "cannot_resolve" | "resolved";

interface FlagResolution {
  status: FlagStatus;
  note: string;
  anchorText: string | null;
}

interface FlagPopoverProps {
  flag: string;
  resolution: FlagResolution;
  position: { top: number; left: number };
  onResolve: (status: FlagStatus, note: string) => void;
  onClose: () => void;
}

const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT_ESTIMATE = 240;

export default function FlagPopover({
  flag,
  resolution,
  position,
  onResolve,
  onClose,
}: FlagPopoverProps) {
  const [status, setStatus] = useState<FlagStatus>(resolution.status);
  const [note, setNote] = useState(resolution.note);
  const ref = useRef<HTMLDivElement>(null);

  // Compute overflow-safe position
  const left = Math.min(position.left, window.innerWidth - POPOVER_WIDTH - 12);
  const top =
    position.top + POPOVER_HEIGHT_ESTIMATE > window.scrollY + window.innerHeight
      ? position.top - POPOVER_HEIGHT_ESTIMATE - 12
      : position.top;

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  const pills: { label: string; value: FlagStatus; active: string; inactive: string }[] = [
    {
      label: "Gap",
      value: "unresolved",
      active: "border-red-300 bg-red-100 text-red-700",
      inactive: "border-slate-200 bg-white text-slate-400",
    },
    {
      label: "Risk",
      value: "cannot_resolve",
      active: "border-amber-300 bg-amber-100 text-amber-700",
      inactive: "border-slate-200 bg-white text-slate-400",
    },
    {
      label: "Done",
      value: "resolved",
      active: "border-green-300 bg-green-100 text-green-700",
      inactive: "border-slate-200 bg-white text-slate-400",
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border border-[#d7dee8] bg-white shadow-lg"
      style={{ width: POPOVER_WIDTH, top, left, padding: "14px" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{flag}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-lg leading-none text-slate-400 hover:text-slate-700 transition"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Status pills */}
      <div className="flex gap-1.5 mb-3">
        {pills.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => setStatus(pill.value)}
            className={`flex-1 rounded-md border px-2 py-1 text-xs font-semibold transition ${
              status === pill.value ? pill.active : pill.inactive
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Note textarea */}
      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note for context..."
        className="w-full resize-none rounded-md border border-[#d7dee8] p-2 text-sm text-slate-800 outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
      />

      {/* Save */}
      <button
        type="button"
        onClick={() => onResolve(status, note)}
        className="mt-2 w-full rounded-md bg-clinical-navy py-2 text-sm font-semibold text-white transition hover:bg-clinical-blue"
      >
        Save
      </button>
    </div>
  );
}
