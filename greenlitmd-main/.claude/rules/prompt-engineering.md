---
paths:
  - app/api/generate-pa/**
  - lib/pa-pipeline.ts
  - lib/letter-system-prompt.ts
  - lib/anthropic.ts
---

# Prompt Engineering Rules

## Extraction prompt (in `lib/pa-pipeline.ts`)
- Always instruct the model to return ONLY valid JSON — no prose wrappers, no markdown fences
- The `pa_strength` object returned by the LLM covers only 2 of the 8 factors —
  `diagnosis_codes` and `surgical_approach` — the two that genuinely require clinical
  judgment (does the diagnosis support the requested procedure; is the surgical
  approach specific/appropriate). The other 6 factors
  (`conservative_treatments_named`, `conservative_treatment_duration`,
  `imaging_findings`, `functional_limitations`, `cpt_code_valid`, `symptom_duration`)
  are scored deterministically in code by `computeDeterministicPaStrength` in
  `lib/pa-pipeline.ts`, computed directly from the already-normalized extracted
  fields — do not ask the LLM to score them, and do not reintroduce LLM/subjective
  judgment for them.
- Each factor must have `score` (0 or 1), `note` (string), and optionally `anchorText` (only when score=0)
- Scoring weights live in one shared module, `lib/pa-strength-weights.ts`
  (`PA_STRENGTH_WEIGHTS` + `computeEarnedWeight`), imported by both the client review
  page and any server code that needs the weighted 0-10 score (e.g. the PostHog
  capture in `app/api/generate-pa/route.ts`). Do not hardcode the weight matrix a
  second time anywhere else.

## Safety rules for all generation prompts
- Never instruct the model to invent dates, CPT codes, or treatment names absent from the source chart
- Imaging findings: output `null` if imaging is labeled pending, not ordered, or absent — never fabricate
- Conservative treatment `treatment_name` must never be `null` or `"unknown"` — if ambiguous, infer the most reasonable clinical term from context
- `denial_risk_flags` must be specific (specific treatment gap, specific missing modality) — generic flags like "insufficient documentation of medical necessity" are not useful to clinicians

## Anthropic API usage
- Always use `callAnthropicWithRetry` from `lib/anthropic.ts` for generation calls — handles timeouts, jittered/Retry-After-aware backoff, and stop_reason truncation/refusal handling
- Use `useStructuredOutput: true` (sets temperature=0) for JSON extraction calls; omit it for letter generation. (If a call site adopts real `output_config.format` structured outputs via a `jsonSchema` param, that is a prompt/request-shape change and requires the same `/prompt-regression-check` gate as any other prompt change.)
- Pass `deadlineMs: Date.now() + <budget>` on every call so the client's retry loop can't exceed the route's `maxDuration` — see the route-level pattern in `app/api/generate-pa/route.ts`
- Model defaults to `claude-sonnet-4-6` via `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"` in `lib/anthropic.ts` — override via env, do not hardcode a different model string in ad-hoc calls

## Regression gate
- Before merging any change to the extraction system prompt or `lib/letter-system-prompt.ts`, run the `/prompt-regression-check` skill, which runs `scripts/eval-pipeline.ts` against the three DOCX fixture charts (Kim/CPT 29827, Webb/CPT 27447, Vance-Sandra/CPT 27130) via the live API. Note: `lib/demo-data.ts` (Delgado/Chen/Vance) is a frozen UI sandbox fixture and must never be used for prompt evaluation.
