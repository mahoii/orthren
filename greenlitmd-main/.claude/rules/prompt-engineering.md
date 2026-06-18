---
paths:
  - app/api/generate-pa/**
  - lib/letter-system-prompt.ts
  - lib/anthropic.ts
---

# Prompt Engineering Rules

## Extraction prompt (in `app/api/generate-pa/route.ts`)
- Always instruct the model to return ONLY valid JSON — no prose wrappers, no markdown fences
- The `pa_strength` object must include all 8 factors: `diagnosis_codes`, `conservative_treatments_named`, `conservative_treatment_duration`, `imaging_findings`, `functional_limitations`, `surgical_approach`, `cpt_code_valid`, `symptom_duration`
- Each factor must have `score` (0 or 1), `note` (string), and optionally `anchorText` (only when score=0)
- Scoring weights are defined in the extraction prompt itself and computed client-side — do not add server-side weight logic elsewhere

## Safety rules for all generation prompts
- Never instruct the model to invent dates, CPT codes, or treatment names absent from the source chart
- Imaging findings: output `null` if imaging is labeled pending, not ordered, or absent — never fabricate
- Conservative treatment `treatment_name` must never be `null` or `"unknown"` — if ambiguous, infer the most reasonable clinical term from context
- `denial_risk_flags` must be specific (specific treatment gap, specific missing modality) — generic flags like "insufficient documentation of medical necessity" are not useful to clinicians

## Anthropic API usage
- Always use `callAnthropicWithRetry` from `lib/anthropic.ts` for generation calls — handles overload retries with backoff
- Use `useStructuredOutput: true` (sets temperature=0) for JSON extraction calls; omit it for letter generation
- Model is `claude-sonnet-4-6` — do not hardcode a different model in ad-hoc calls

## Regression gate
- Before merging any change to the extraction system prompt or `lib/letter-system-prompt.ts`, run the output against all three synthetic charts (Delgado, Chen, Vance) — use `/prompt-regression-check` or delegate to the `prompt-evaluator` subagent
