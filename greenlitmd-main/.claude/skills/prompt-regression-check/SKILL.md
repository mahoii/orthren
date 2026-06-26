---
name: prompt-regression-check
description: Runs extraction and letter generation prompts against the three live fixture charts and reports regressions. Use before merging any change to the extraction prompt, lib/letter-system-prompt.ts, or lib/anthropic.ts.
context: fork
agent: general-purpose
---

# Skill: Prompt Regression Check

## When to Use
Run before merging any change to:
- Extraction system prompt in `app/api/generate-pa/route.ts`
- `lib/letter-system-prompt.ts`
- `lib/anthropic.ts` (model, temperature, parameters)

## What This Skill Does
Runs the current prompts against the three fixture charts via the live API (not lib/demo-data.ts — that file is a frozen UI fixture and must never be used for evaluation). Reports deviations from known-good baseline behavior.

## Instructions for Claude When Invoked

1. Read the current state of the changed prompt file
2. Run `scripts/eval-pipeline.ts` against all three fixture charts:
   - `chart-kim-rachel-rotator-cuff-cpt29827-CLEAN.docx` (CPT 29827)
   - `chart-webb-marcus-tka-cpt27447-MESSY.docx` (CPT 27447)
   - `chart-vance-sandra-tha-cpt27130-INCOMPLETE.docx` (CPT 27130)
3. For each chart, evaluate the raw extraction JSON and generated letter for:
   - **SOURCE LOCK violations** — any clinical finding, imaging result, or treatment not present in the source chart
   - **CPT mismatch** — procedure name or code in the letter body doesn't match the fixture's CPT
   - **Hallucinated surgical approach** — approach stated in letter not documented in chart
   - **Date hallucination** — dates in letter not present in chart text
   - **Imaging not in source** — imaging modality referenced that was not confirmed completed in chart
   - **DOB extraction** — must be non-null for all three fixtures
   - **Single signature block** — flag if more than one sig block present
   - **Re: line format** — must include patient name, DOB, procedure, CPT, ICD-10

4. Output: PASS or FAIL per chart, with field-level detail on any failure

## Known-Good Baseline

**Kim (29827 — CLEAN):**
- DOB: 03/17/1966
- CPT consistent: 29827 throughout
- Imaging: X-ray (Feb 10 2025) + MRI (Mar 1 2025) only — no other modalities
- Conservative care: PT (Nov–Dec 2024), Meloxicam 4mo, corticosteroid injection (Jan 15 2025)
- pa_score expected: ≥ 8.0, zero SOURCE LOCK violations

**Webb (27447 — MESSY):**
- DOB: 11/08/1952
- CPT consistent: 27447 throughout — flag immediately if spine code (e.g. 22612) appears
- No MRI on file — letter must not reference MRI
- BMI not recorded — must not be fabricated
- Conservative care dates/duration vague — letter must not invent specifics
- ≥1 denial risk flag expected (documentation gaps)

**Vance (27130 — INCOMPLETE):**
- DOB: 07/02/1960
- CPT consistent: 27130 throughout
- Imaging ordered but not completed — letter must not reference imaging findings
- Conservative care minimal (acetaminophen + rest only) — no PT, no injections
- pa_score expected: amber range, imaging and conservative care flags expected

## Merge Gate
Any FAIL blocks merge. Surface findings for prompt revision before proceeding.