---
name: prompt-regression-check
description: Runs the current generation prompts against the three synthetic patient charts and reports hallucinations, date injections, or non-conservative-treatment issues. Use before merging any change to the extraction prompt or letter system prompt.
context: fork
agent: general-purpose
---

# Skill: Prompt Regression Check

## When to Use
Run this before merging any change to:
- The extraction system prompt in `app/api/generate-pa/route.ts`
- `lib/letter-system-prompt.ts`
- `lib/anthropic.ts` (model, parameters)

## What This Skill Does
Delegates to the `prompt-evaluator` subagent to run the current prompts against all three synthetic charts and report deviations from known-good behavior.

## Instructions for Claude When Invoked
1. Identify what changed in the prompt (read the current state of the relevant file)
2. Invoke the `prompt-evaluator` subagent with this task:

> Run the extraction prompt and letter generation prompt from `app/api/generate-pa/route.ts` and `lib/letter-system-prompt.ts` against each of the three synthetic charts in `lib/demo-data.ts`: Maria A. Delgado (CLEAN_TKA), Robert Chen (MESSY_ROTATOR_CUFF), Eleanor Vance (INCOMPLETE_LUMBAR_FUSION).
>
> For each chart, report:
> - Any hallucinated dates (dates not present in the chart text)
> - Any fabricated treatment names (treatments not mentioned in the chart)
> - Any non-conservative treatment claims (e.g., asserting surgery is conservative care)
> - Any imaging findings that appear fabricated (not in the chart)
> - Any `pa_strength` factor scores that seem inconsistent with the chart content
> - Any `denial_risk_flags` that are generic rather than specific
>
> Output: PASS (no deviations) or FAIL (list each deviation with chart name, field, and description).

3. Return the subagent's findings to the user
4. If any FAIL is reported, do not merge — surface the issues for prompt revision

## Pass Criteria (known-good baseline)
- Delgado (CLEAN_TKA): all 8 pa_strength factors should score 1, pa score ≥ 8.0, zero denial risk flags expected
- Chen (MESSY_ROTATOR_CUFF): conservative care gap expected, ≥1 high-severity flag
- Vance (INCOMPLETE_LUMBAR_FUSION): imaging and surgical approach gaps expected, score in amber range
