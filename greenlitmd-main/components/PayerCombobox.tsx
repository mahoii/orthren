"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getPayerRule } from "@/lib/payer-rules";

interface PayerComboboxProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  cptCode: string;
  disabled?: boolean;
}

type PayerOption = { display: string; value: string };

const PAYER_OPTIONS: PayerOption[] = [
  { display: "Aetna", value: "Aetna" },
  { display: "UnitedHealthcare", value: "UnitedHealthcare" },
  { display: "Cigna", value: "Cigna" },
  { display: "Anthem / Empire BCBS", value: "Anthem / Empire BCBS" },
  { display: "Humana", value: "Humana" },
  { display: "Medicare", value: "Medicare" },
  { display: "Medicaid", value: "Medicaid" },
  { display: "Other", value: "Other" },
];

const KNOWN_VALUES = new Set(
  PAYER_OPTIONS.filter((o) => o.value !== "Other").map((o) => o.value)
);

export default function PayerCombobox({ value, onChange, error, cptCode, disabled }: PayerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Free-text mode: dropdown is suppressed so the user can type any payer name.
  const [isOtherMode, setIsOtherMode] = useState<boolean>(() =>
    value ? !KNOWN_VALUES.has(value) : false
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    if (isOtherMode) return [] as PayerOption[];
    const q = value.trim().toLowerCase();
    const isExactSelection = PAYER_OPTIONS.some((o) => o.value.toLowerCase() === q);
    if (!q || isExactSelection) return PAYER_OPTIONS;
    return PAYER_OPTIONS.filter((o) => o.display.toLowerCase().includes(q));
  }, [value, isOtherMode]);

  function selectOption(option: PayerOption) {
    if (option.value === "Other") {
      setIsOtherMode(true);
      setOpen(false);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setIsOtherMode(false);
    onChange(option.value);
    setOpen(false);
  }

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const text = event.target.value;
    onChange(text);
    if (isOtherMode) {
      // Clearing the field returns control to the dropdown list.
      if (text === "") setIsOtherMode(false);
      return;
    }
    setOpen(true);
    setHighlight(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (isOtherMode) return;
    if (!open) {
      if (event.key === "ArrowDown") {
        setOpen(true);
        event.preventDefault();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (event.key === "Enter") {
      if (filtered[highlight]) {
        event.preventDefault();
        selectOption(filtered[highlight]);
      }
    }
  }

  return (
    <div className="block" ref={containerRef}>
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">Insurance payer name</span>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={handleInput}
          onFocus={() => {
            if (!isOtherMode) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Aetna"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className="mt-2 w-full rounded-md border border-clinical-line px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-clinical-blue focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />

        {open && !isOtherMode && filtered.length > 0 ? (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-clinical-line bg-white py-1 shadow-lg"
          >
            {filtered.map((option, index) => {
              const isSelected = value === option.value;
              const hasRule = getPayerRule(option.value, cptCode) !== null;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => {
                    // Prevent input blur before the click registers.
                    event.preventDefault();
                    selectOption(option);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                    index === highlight ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="w-4 flex-shrink-0 text-clinical-blue">{isSelected ? "✓" : ""}</span>
                  <span className="text-slate-900">{option.display}</span>
                  {hasRule ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-green-600">
                      <span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                      Payer criteria loaded
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {error ? <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
