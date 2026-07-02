---
name: pa-scoring-conventions
description: Reference skill for the 8-factor PA Strength Score weighting, factor definitions, and UI threshold logic. Load when touching scoring, pa_strength fields, or triage UI.
---

# PA Strength Score — Conventions Reference

## 8-Factor Weight Matrix
Weights are applied client-side; the API returns raw 0/1 scores per factor:

| Factor | Weight | Score=0 Means |
|---|---|---|
| `diagnosis_codes` | 10% | No ICD-10 codes present |
| `conservative_treatments_named` | 20% | No specific treatment names extracted |
| `conservative_treatment_duration` | 10% | Fewer than 50% of named duration-eligible treatments (PT, NSAID/med courses, bracing, HEP — single-administration injections excluded) have an explicit duration, or fewer than 2 duration-eligible treatments are named at all |
| `imaging_findings` | 15% | No completed imaging (pending = 0) |
| `functional_limitations` | 15% | No specific functional limitations stated |
| `surgical_approach` | 10% | No surgical approach described |
| `cpt_code_valid` | 10% | CPT code missing or implausible |
| `symptom_duration` | 10% | No symptom timeline stated |

**Total: 100%** — computed as `sum(factor.score * weight)` → expressed as 0–10.

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
  anchorText?: string;   // only when score=0: 10-50 char verbatim phrase from letter
};
```

## Where This Lives in Code
- **Type definitions:** `lib/types.ts` — `PaStrength`, `PaStrengthFactor`
- **Scoring prompt:** bottom of the extraction system prompt in `app/api/generate-pa/route.ts` (search for "pa_strength")
- **UI rendering:** sidebar PA score display reads `extracted.pa_strength` from the generation response
- **Skill flat file (legacy):** `.claude/skills/pa-scoring.md` — superseded by this directory

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
