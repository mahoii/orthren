---
name: synthetic-patient
description: Generates a new synthetic orthopedic patient chart with realistic documentation gaps, matching the style of the existing Delgado/Chen/Vance demo profiles. Pass a short description of the gap to embed as $ARGUMENTS.
disable-model-invocation: true
---

# Skill: Generate Synthetic Patient Chart

## Usage
```
/synthetic-patient <gap description>
```
Example: `/synthetic-patient incomplete conservative care — only one injection documented, no PT dates`

## What This Skill Does
Creates a realistic synthetic orthopedic prior authorization chart that:
1. Uses a fictional patient identity (name, DOB, MRN — no real PHI ever)
2. Embeds the specific documentation gap described in `$ARGUMENTS`
3. Matches the structure and detail level of the three existing demo charts
4. Is suitable for use as a regression test case for prompt changes

## Chart Structure to Follow
Mirror the format of `lib/demo-data.ts` exports (`CLEAN_TKA`, `MESSY_ROTATOR_CUFF`, `INCOMPLETE_LUMBAR_FUSION`). Each chart has:
- `extracted`: an `ExtractedChartDataWithValidation` object matching `lib/types.ts`
- Realistic orthopedic context: diagnosis codes, conservative treatments, imaging, functional limitations, CPT code, provider info
- A clear documentation gap that would trigger one or more `denial_risk_flags`

## Instructions for Claude When Invoked
1. Parse `$ARGUMENTS` to identify the specific gap to embed
2. Choose a plausible orthopedic case type not already covered by existing demos (TKA, rotator cuff, and lumbar fusion are taken)
3. Generate a fictional patient name and demographics — no real names, no real DOBs
4. Populate all `ExtractedChartData` fields realistically, deliberately leaving the described gap incomplete
5. Ensure `pa_strength` scores reflect the gap (relevant factor = 0)
6. Ensure `denial_risk_flags` includes at least one flag corresponding to the gap
7. Output the chart as a TypeScript object matching the `lib/demo-data.ts` export format, ready to paste in

## PHI Rule
**Never use real patient names, real dates of birth, real MRNs, or any other real PHI.** Invented names like "James Okafor" or "Priya Patel" are acceptable — real names from actual medical records are not.
