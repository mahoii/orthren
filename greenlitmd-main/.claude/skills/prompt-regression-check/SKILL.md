---
name: prompt-regression-check
description: Runs extraction and letter generation prompts against the three live fixture charts and reports regressions. Use before merging any change to the extraction prompt, lib/letter-system-prompt.ts, or lib/anthropic.ts.
context: fork
agent: general-purpose
---

# Skill: Prompt Regression Check

## When to Use
Run before merging any change to:
- Extraction system prompt in `lib/pa-pipeline.ts`
- `lib/letter-system-prompt.ts`
- `lib/anthropic.ts` (model, temperature, parameters)

## What This Skill Does
Runs the current prompts against the three fixture charts via the live API (not lib/demo-data.ts — that file is a frozen UI fixture and must never be used for evaluation). Reports deviations from known-good baseline behavior.

**Cost note:** a full run is 6+ live Anthropic calls per fixture and has run $3–5 for large multi-run batches. Prefer the cheapest mode that answers the actual question — see "Cost-Controlled Runs" below.

## Instructions for Claude When Invoked

0. Before running, clear stale output so a prior failure can't masquerade as a new one: delete `.eval-output/` with `node -e "fs.rmSync('.eval-output',{recursive:true,force:true})"` (the `Bash(rm -rf *)` shape is deny-listed in this project — this is the working substitute).
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

## Cost-Controlled Runs
For the default single-pass check above, just run `npx tsx scripts/eval-pipeline.ts` — it's fast and cheap and this is what merge-gate checks should use.

For deeper multi-run SOURCE LOCK validation (checking intermittent, sampling-variance failures across all three generation routes, not just a single pass), use tiered mode — see the env-var contract documented inline at `scripts/eval-pipeline.ts` around line 299 (`SOURCE_LOCK_TIERED=1`). Useful knobs for controlling cost, all read from that same block:
- `SOURCE_LOCK_ONLY_FIXTURES=kim,vance` — re-validate only specific fixtures (e.g. after fixing an issue found on one, without re-spending on the others).
- `SOURCE_LOCK_REUSE_BASELINE=1` — skip re-generating a fixture's baseline extraction if a prior verified one is cached.
- `SOURCE_LOCK_GEN_RUNS` / `SOURCE_LOCK_REGEN_LETTER_RUNS` / `SOURCE_LOCK_REGEN_DENIAL_RUNS` / `SOURCE_LOCK_ESCALATED_RUNS` — override run counts per route (defaults 10/5/5/10).

Don't invent new ad-hoc env vars for this mid-session — check whether the knob you need already exists in that block first.

## Known-Good Baseline

**Before trusting any baseline claim below (including from a prior Claude session's SKILL.md edit), spot-check it against the actual fixture file** — this section has drifted from the fixtures before (a stale DOB, a loosely-worded conservative-care baseline) and a wrong baseline produces false regressions or false passes.

**Kim (29827 — CLEAN):**
- DOB: 04/15/1975
- CPT consistent: 29827 throughout
- Imaging: X-ray + MRI (both Jan 22 2025) only — no other modalities
- Conservative care: PT (Sept–Oct 2024, 8 wks), Meloxicam 15mg (July–Oct 2024, 3mo), Kenalog 40mg injection (Nov 5 2024)
- pa_strength expected: 8/8, zero SOURCE LOCK violations. `conservative_treatment_duration` scores 1: the
  Kenalog injection is a single-administration treatment, excluded from both N (the denominator) and D (the
  numerator) per the rubric — leaving N=2 (PT, Meloxicam), both with an explicit documented duration, so D/N=100%,
  well above the 50% threshold. (Historical note: a prior run of this fixture scored this factor 0/7-8-total due
  to LLM run-to-run judgment variance on an ambiguous scoring call — this factor is now computed deterministically
  in code by `computeDeterministicPaStrength` in `lib/pa-pipeline.ts`, so it is no longer subject to that
  variance.)

**Webb (27447 — MESSY):**
- DOB: 11/03/1958
- CPT consistent: 27447 throughout — flag immediately if spine code (e.g. 22612) appears
- No MRI on file — letter must not reference MRI
- BMI 34.2 is documented in chart — referencing it is correct, not fabrication
- Conservative care dates/duration vague — letter must not invent specifics
- ≥1 denial risk flag expected (documentation gaps)

**Vance (27130 — INCOMPLETE):**
- DOB: 07/28/1962
- CPT consistent: 27130 throughout
- Imaging ordered but not completed — letter must not reference imaging findings
- Conservative care minimal (acetaminophen + rest only) — no PT, no injections
- pa_score expected: amber range, imaging and conservative care flags expected

## Merge Gate
Any FAIL blocks merge. Surface findings for prompt revision before proceeding.