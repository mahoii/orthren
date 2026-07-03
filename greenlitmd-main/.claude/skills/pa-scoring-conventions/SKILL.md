---
name: pa-scoring-conventions
description: Reference skill for the 8-factor PA Strength Score weighting, factor definitions, and UI threshold logic. Load when touching scoring, pa_strength fields, or triage UI.
---

# PA Strength Score — Conventions Reference

## 8-Factor Weight Matrix
Weights live in one shared module, `lib/pa-strength-weights.ts` (`PA_STRENGTH_WEIGHTS` +
`computeEarnedWeight`), imported by both the client review page and any server code that needs
the weighted 0-10 score. 6 of the 8 factors are scored deterministically in code
(`computeDeterministicPaStrength` in `lib/pa-pipeline.ts`) directly from the normalized extracted
fields — reproducible run-to-run. The remaining 2 (`diagnosis_codes`, `surgical_approach`) are
scored by the extraction LLM because they require clinical judgment.

| Factor | Weight | Scored By | Score=0 Means |
|---|---|---|---|
| `diagnosis_codes` | 10% | LLM | No ICD-10 code present, or none clinically support the requested procedure |
| `conservative_treatments_named` | 20% | Deterministic | Fewer than 2 distinct named treatment modalities documented |
| `conservative_treatment_duration` | 10% | Deterministic | Fewer than 50% of duration-eligible treatments (PT, NSAID/med courses, bracing, HEP — single-administration injections excluded) have an explicit numeric duration, or fewer than 2 duration-eligible treatments are named at all |
| `imaging_findings` | 15% | Deterministic | No completed imaging with non-null findings text (pending, not-ordered, or completed-with-no-findings-text all score 0) |
| `functional_limitations` | 15% | Deterministic | Fewer than 2 specific functional limitations documented |
| `surgical_approach` | 10% | LLM | No specific, procedure-appropriate surgical approach described |
| `cpt_code_valid` | 10% | Deterministic | CPT code not present in `lib/known-cpt-codes.ts`'s allowlist |
| `symptom_duration` | 10% | Deterministic | Symptom duration doesn't parse to ≥12 weeks (day/week/month/year units) |

**Total: 100%** — computed as `sum(factor.score * weight)` → expressed as 0–10.

`conservative_treatments_named ≥2` and `functional_limitations ≥2` are house rules (product
judgment, not derived from a specific payer citation) — unlike `symptom_duration ≥12wks`, which
matches the ~3-month language in `payer-rules.ts`'s Aetna/Cigna entries.

## UI Threshold States
- **Score < 5.0** → Red Alert — high denial risk, sidebar highlights deficiencies
- **Score 5.0–7.9** → Amber Warning — moderate risk, review flags before submission
- **Score ≥ 8.0** → Green Cleared — packet meets typical payer threshold

## Factor Object Schema
Each factor in `pa_strength` (from `lib/types.ts`):
```ts
type PaStrengthFactor = {
  score: 0 | 1;
  note: string;          // plain English explanation of the score
  anchorText?: string;   // only when score=0: 10-50 char verbatim phrase, or a stable
                          // letter section heading (real letter text doesn't exist yet
                          // at scoring time for the 6 deterministic factors)
};
```

## Where This Lives in Code
- **Type definitions:** `lib/types.ts` — `PaStrength`, `PaStrengthFactor`
- **Extraction prompt (LLM-scored factors only):** `lib/pa-pipeline.ts`, `extractionSystemPrompt` (search for "pa_strength")
- **Deterministic scoring:** `computeDeterministicPaStrength` in `lib/pa-pipeline.ts`
- **Shared weights:** `lib/pa-strength-weights.ts`
- **Known-CPT allowlist:** `lib/known-cpt-codes.ts`
- **Validated-payer duration penalty:** `applyValidatedPayerDurationPenalty` in `lib/payer-rules.ts` — re-demotes `conservative_treatment_duration` to 0 when a validated payer rule's PT-week minimum exceeds what's documented; applied in both `app/api/generate-pa/route.ts` and `app/api/regenerate-denial-fix/route.ts`
- **UI rendering:** sidebar PA score display reads `extracted.pa_strength` from the generation response

## Denial Risk Flags
Separate from pa_strength — `denial_risk_flags` is an array of `DenialRiskFlag` objects:
```ts
type DenialRiskFlag = {
  id: string;
  label: string;           // 5–8 word title
  severity: "high" | "medium" | "low";
  explanation: string;     // why payers flag this
  recommendation: string;  // chart addendum suggestion
  anchorText: string;      // exact phrase from the generated letter
};
```
Two mandatory flags are always added by the extraction prompt when triggered:
- `flag-conservative-care` → fewer than 3 distinct treatment modalities with complete duration data
- `flag-pending-imaging` → imaging is scheduled but not yet completed
