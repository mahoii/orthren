# AUDIT-FINDINGS.md — Fable 5 full-strength audit (2026-07-09)

Baseline state at audit start: `main` @ `a8196f7`, working tree clean, `npm run typecheck` **PASS** (exit 0).
Method: 3 parallel read-only sweep agents (routes / UI / DB-security) + first-hand verification of every backlog item and every high-severity agent claim by the lead session. Confidence labels: **verified** (defect read directly in code by lead, or reproduced), **probable** (strong code indication, needs runtime repro), **speculative** (do not fix without upgrade to verified).

Ordering follows fix priority: SOURCE LOCK / data-integrity first, user-facing correctness second, cosmetic third.
Format: sections A/B (and E1) carry the full 6-part structure (observation / why wrong / root cause / solution+alternatives / blast radius / confidence). Sections C/D/E are lower-tier findings compressed to one block each — all six elements are present in prose, abbreviated for scanability.

---

## SECTION A — SOURCE LOCK / data-integrity risk

### A1. De-id gate does not cover the full outbound prompt — raw `objective_measurements` (and BMI/ASA lines) sent to Anthropic un-redacted on both letter paths — **verified**

1. **Observation** — `lib/pa-pipeline.ts:162-164` builds `objectiveMeasurementsStr` from the raw, re-identified `extracted.objective_measurements` and appends it to the prompt at `lib/pa-pipeline.ts:217`, *outside* the `redactedChartData` block that `assertDeidentified` checked at line 204. Identical pattern in `app/api/regenerate-letter/route.ts:59-61` + `:89` (assertion at `:74` covers only the JSON block). `bmiAsaLines` shares the shape (lower-risk values).
2. **Why it's wrong** — STATUS-ROADMAP.md ("De-identification"): the fail-closed gate must sit at "every seam that sends PHI-bearing text off-server." The seam here is the outbound prompt string; the assertion runs on a substring of it. A measurement like "KOOS 32/100 measured 03/01/2025" ships the date verbatim. The same array is redacted *inside* the JSON block, so the redaction system itself recognizes this field as PHI-bearing.
3. **Root cause** — the gate boundary is "the redacted JSON blob" rather than "the final assembled prompt." Prompt assembly appends extra material after the gate has run.
4. **Proposed solution** — build the full prompt, then de-identify/assert **the assembled prompt** against the letter phi-map (alternative considered: individually redact `objectiveMeasurementsStr`/`bmiAsaLines` with the shared `phiState` before interpolation — works, but leaves the gate boundary fragile against the next appended field; asserting the final string is the structural fix and matches the stated invariant). Reidentify handling is unaffected (the model output path already reidentifies).
5. **Blast radius** — `generate-pa` initial letter, its source-lock retry prompt, and `regenerate-letter`. Letter content itself shouldn't change (same information, redacted form), but **any prompt change requires the tiered SOURCE LOCK re-run** before done.
6. **Confidence** — **verified** (read first-hand at both call sites).

### A2. Same gate gap: physician-supplied `supplements` interpolated raw into the denial-fix prompt — **verified**

1. **Observation** — `app/api/regenerate-denial-fix/route.ts:56-59` builds `supplementList` from client-supplied free text; `:87-90` interpolates it into `userMessage`. `deidentify`/`assertDeidentified` (`:70-77`) cover only `redactedExtraction` and `redactedLetter` — never the supplements or the assembled prompt.
2. **Why it's wrong** — supplements are exactly the kind of text the fix-guidance placeholders solicit ("Physical therapy: Oct 2024 – Dec 2024…", `lib/suggest-fix-templates.ts:25`) — patient-tied treatment dates are PHI. Violates the same "every seam" invariant as A1.
3. **Root cause** — same as A1: per-field gating instead of outbound-boundary gating.
4. **Proposed solution** — fold supplements into the shared `phiState` redaction (they must round-trip through the same map so `[DATE_n]` tokens stay consistent across extraction/letter/supplements), then assert the final assembled `userMessage`. Same fix shape as A1.
5. **Blast radius** — every denial-fix regeneration. Prompt change ⇒ tiered SOURCE LOCK re-run required.
6. **Confidence** — **verified** (structural gap read first-hand; whether a given physician types PHI is situational, but the gate's absence is not).

### A3. `regenerate-denial-fix` runs SOURCE LOCK verification against the **pre-merge** extraction — physician supplements are guaranteed "ungrounded" — **verified**

1. **Observation** — `app/api/regenerate-denial-fix/route.ts:119-132` calls `finalizeLetter({ extracted: extractionJson … })` with the *original* extraction; `mergeSupplementsIntoExtraction` runs only afterward (`:134`). `verifySourceLock` (`lib/pa-pipeline.ts:446-501`) builds its haystack solely from `extracted`. Meanwhile the prompt's REVISION INSTRUCTION 4 (`route.ts:101`) tells the model supplements *are* legitimate source and instruction 3 says to integrate them.
2. **Why it's wrong** — a supplement like "8 weeks PT" or "Naproxen 500mg" appears in the revised letter (as instructed), matches `DURATION_PATTERN`/`DOSAGE_PATTERN`/`HIGH_RISK_VOCABULARY`, is absent from the haystack ⇒ violation ⇒ one full wasted Anthropic retry with the identical temperature-0 prompt ⇒ same violation ⇒ **false `sourceLockWarning` shown to the physician about content they themselves supplied**, which also disables Download (`app/review/page.tsx:570`). The prompt contract and the runtime verifier disagree about what counts as source.
3. **Root cause** — merge ordered after `finalizeLetter` instead of before it. The stale claim in `scripts/eval-pipeline.ts:463-468` ("the merge … never [affects] the letter/SOURCE LOCK check") documents the wrong order as intended.
4. **Why the 60/60 PASS didn't catch it** — the eval's denial-fix tier sends a single deliberately inert supplement, `{ conservative_treatments_attempted: "Added PT notes" }` (`scripts/eval-pipeline.ts:840`) — no dates/durations/dosages/implant vocab, so the false-positive path was never exercised. (That key also matches no case in `mergeSupplementsIntoExtraction` — see C4.)
5. **Proposed solution** — merge supplements first, pass `mergedExtraction` to `finalizeLetter` (alternative considered: add supplements as a second haystack argument to `verifySourceLock` — more invasive signature change for no benefit, since merged extraction *is* the post-supplement source of truth and is already what the response's rescore uses). Then extend the eval tier with a realistic date/duration-bearing supplement so the class stays covered.
6. **Blast radius** — denial-fix letter verification + retry economics + physician-facing warning banner + Download gating. SOURCE LOCK-adjacent ⇒ tiered re-run required.
7. **Confidence** — **verified** (call order + haystack construction + prompt contract all read first-hand; agent A reached the same conclusion independently).

### A4. `regenerate-letter` leaks `denial_risk_flags` (payer-threshold commentary) into the letter prompt; initial path also leaks `extraction_warnings` — **verified**

1. **Observation** — `lib/pa-pipeline.ts:148` strips `denial_risk_flags` from the letter prompt. `app/api/regenerate-letter/route.ts:58` strips only `validation, pa_strength` — flags ride along into the serialized chart JSON. Also, `generate-pa` attaches `extraction_warnings` to the extraction (`app/api/generate-pa/route.ts:102-105` per agent A), and pa-pipeline's strip list doesn't remove it either.
2. **Why it's wrong** — the DENIAL FLAG ISOLATION rationale is written into `verifySourceLock`'s haystack comment (`lib/pa-pipeline.ts:448-452`): flag text contains payer-threshold language ("typical payer threshold of 3-6 months") that must not enter or ground letter content. On regenerate, the model can absorb a threshold duration; since the haystack *excludes* flags, that duration is then flagged as ungrounded ⇒ wasted retry ⇒ spurious warning. Worse, if the model paraphrases a threshold into medical-necessity narrative, that's fabricated clinical history.
3. **Root cause** — destructuring strip-lists duplicated at two call sites and drifted.
4. **Proposed solution** — make regenerate-letter's strip list identical to pa-pipeline's and add `extraction_warnings` to both (alternative: centralize a `buildLetterPromptChartData(extracted)` helper in pa-pipeline and use it at both call sites — preferred, kills the drift class permanently).
5. **Blast radius** — regenerate-letter content fidelity + false warnings. Prompt-content change ⇒ tiered re-run required.
6. **Confidence** — **verified** (both strip lists read first-hand; `extraction_warnings` attachment at `app/api/generate-pa/route.ts:102-105` independently re-read and confirmed by the adversarial grading pass — sub-claim upgraded to **verified**).

### A5. `/api/feedback` persists un-deidentified clinician free text to Redis — the one server-side persistence of user clinical text — **verified**

1. **Observation** — `app/api/feedback/route.ts:55-67`: `denialReason` (clinician-typed free text) is stored verbatim and permanently via `redis.lpush("pa_outcomes", …)` with no `deidentify()` pass and no length cap — directly under a comment claiming "No Patient Name, No DOB to ensure zero PHI storage." Contrast `generate-appeal-talking-points`, which caps its denial_reason at 5,000 chars and de-identifies it before use (per security agent, `route.ts:156-158, 177`).
2. **Why it's wrong** — a pasted denial letter routinely contains patient name/DOB/MRN; this lands raw in Upstash. Violates the product posture ("no PHI stored") and the de-id invariant. Unbounded list growth is a secondary issue.
3. **Root cause** — feedback was treated as analytics, not as a PHI-bearing text seam.
4. **Proposed solution** — run `deidentify()` on `denialReason` before persisting + cap length (5,000 chars, matching the appeal route). Alternative (drop the field) rejected: denial reasons are core product-learning signal.
5. **Blast radius** — feedback route only; no prompts touched ⇒ no SOURCE LOCK re-run. Existing Redis entries may already contain PHI — **flag for a one-time scrub decision (only you can authorize touching prod data).**
6. **Confidence** — **verified** (read first-hand).

---

## SECTION B — User-facing correctness

### B1. `cpt_code_valid` "Apply Fix" is a dead end: user-entered corrected CPT is consumed by nothing — **verified** (backlog item 3 confirmed, and currently worse than reported)

1. **Observation** — the fix card explicitly asks for a "Correct CPT code" (`lib/suggest-fix-templates.ts:70-75`). On regenerate: (i) `mergeSupplementsIntoExtraction` **intentionally skips** the key (`app/api/regenerate-denial-fix/route.ts:269-275`); (ii) the server rescores with `computeDeterministicPaStrength(mergedExtraction, requestDetails.cptCode)` — the *original* CPT (`:149`), so `scoreCptCodeValid` returns 0 again (`lib/pa-pipeline.ts:975-984`); (iii) the client no longer force-bumps scores — `handleRegenerate` merges the server-returned extraction verbatim (`app/review/page.tsx:355-362`) and never updates `data.cptCode`; (iv) `sanitizeLetterPlaceholders` stamps the letter with `requestDetails.cptCode` — still the old code (`lib/pa-pipeline.ts:295-303`).
2. **Why it's wrong** — the UI solicits a corrected CPT and then discards it. Score stays 0, card stays "Gap", the letter's Re: line and any export keep the wrong CPT. The *only* consumer is the raw supplement line injected into the letter prompt (see A2), which can push the new CPT into letter *prose* while the Re: line keeps the old one — an internally inconsistent letter. The skip-comment at `route.ts:270-274` justifies itself with "already bumps pa_strength client-side (app/review/page.tsx handleRegenerate)" — that client behavior was removed (the comment at `route.ts:139-145` in the same file says so), so the two comments contradict each other and the code matches neither.
3. **Root cause** — `cpt_code_valid` isn't chart-derived; it derives from `requestDetails.cptCode`, and the fix flow has no path that updates `requestDetails`/`data.cptCode`. When the client-side force-set was removed, this factor's fix path silently became a no-op.
4. **Proposed solution** — treat a `cpt_code_valid` supplement as a corrected CPT: parse/validate the entered code against `lib/known-cpt-codes.ts`, substitute it into `requestDetails.cptCode` server-side before letter regen + rescore, return the effective CPT so the client updates `data.cptCode`, and drop the supplement from `supplementList` (it isn't clinical narrative). Alternatives considered: (a) removing the Apply Fix card for this factor entirely (honest, but the correction is genuinely useful and cheap once routed); (b) client-side-only CPT swap before the request (leaves server prompt/Re: line derivation trusting an unvalidated client value; validation belongs at the route).
5. **Blast radius** — denial-fix route, review-page state, Re: line via `sanitizeLetterPlaceholders`, PostHog `cpt_code` properties, export filename. Touches letter finalization inputs ⇒ tiered re-run required.
6. **Confidence** — **verified** (full flow traced first-hand end to end).

### B2. PA Strength breakdown: **passing** factor rows expose no `note`/evidence anywhere — pass is unauditable — **verified** (backlog item 2 confirmed, broader than reported)

1. **Observation** — the "All 8 strength factors" accordion rows render only icon + label + "OK"/"Gap" (`app/review/page.tsx:866-901`); `f.note` is in `scoreFactors` (`:127`) but never rendered there, and `onClick` is disabled for passing rows (`:877-878`). Failing factors surface their note via attention-item cards (`:138-154`); passing factors appear *only* in the accordion.
2. **Why it's wrong** — the pipeline deliberately produces an evidence note on **pass** for all 8 factors (deterministic scorers: e.g. `lib/pa-pipeline.ts:880,912,918`; LLM factors: extraction prompt requires a note for both scores, `lib/pa-pipeline.ts:96`). The reviewing physician can't see *why* a factor passed — e.g. which 2 treatments counted, which imaging findings were accepted — so a false pass (extraction error) is invisible. This is not limited to `diagnosis_codes`/`surgical_approach` as the backlog stated; it's all 8.
3. **Root cause** — accordion row template simply omits the note; pass rows were treated as "nothing to do" rather than "evidence to display."
4. **Proposed solution** — make passing rows expandable to show `note` (same toggle pattern the gap rows already use), no layout redesign. Alternative (tooltip on hover) rejected: not inspectable on touch devices and truncates multi-clause notes.
5. **Blast radius** — review page only; no pipeline/prompt change ⇒ no SOURCE LOCK re-run needed.
6. **Confidence** — **verified** (JSX read first-hand).

### B3. Sandbox/demo data can reach a live Anthropic route: Regenerate is not `isDemo`-gated and no route short-circuits demo profiles — **verified** (backlog item 4: isolation holds at generation, leaks at regeneration)

1. **Observation** — builder demo path is clean: test-case submissions short-circuit client-side to static profile data, no fetch (`app/builder/page.tsx:258-287`). But review receives that data with `isDemo: true` (`:276`), and while Download is `isDemo`-disabled (`app/review/page.tsx:570`), **Regenerate is not** (`:538` — disabled only on `!hasSupplements || isRegenerating`). `handleRegenerate` posts the demo extraction to `/api/regenerate-denial-fix`. No route checks `SAMPLE_PATIENT_NAMES` — that export (`lib/sample-charts.ts:21`) has **zero consumers** repo-wide.
2. **Why it's wrong** — `.claude/rules/api-conventions.md` "Sandbox isolation": any `/api` handler reachable from sandbox must short-circuit to static demo data for Delgado/Chen/Vance; "zero live Anthropic calls may originate from sandbox." An authenticated user filling a supplement in a demo review triggers a real, billed Anthropic call on synthetic data. (Unauthenticated public-demo users get a 401 → error toast — bad UX, no API spend.)
3. **Root cause** — the isolation rule was implemented as a client-side short-circuit at generation only; the review page's live actions were never demo-gated, and the prescribed server-side name check was never wired to any route.
4. **Proposed solution** — both layers: (i) gate Regenerate (and any future live action) on `data.isDemo` in review, with a "demo mode" tooltip like Download's; (ii) add the `SAMPLE_PATIENT_NAMES` short-circuit at `regenerate-denial-fix` (and `regenerate-letter`/`anchor-flags` if reachable) returning a canned response, per the api-conventions rule — client gating alone is bypassable and the rule explicitly demands the server check. Alternative (server-only) rejected: leaves a broken-feeling button in the demo UI.
5. **Blast radius** — review UI + one guard clause per route; no prompt change (guard returns before any Anthropic call) ⇒ no SOURCE LOCK re-run needed if implemented as an early return.
6. **Confidence** — **verified** (button condition, session payload, and zero-consumer grep all first-hand).

### B4. Backlog item 1 — `conservative_treatment_duration` scoring: **already fixed; stale backlog** — **verified refutation**

1. **Observation** — scoring is no longer in the extraction prompt at all: the prompt explicitly excludes the 6 deterministic factors (`lib/pa-pipeline.ts:102`), and `scoreConservativeTreatmentDuration` (`lib/pa-pipeline.ts:889-914`) implements an explicit numeric rubric in code: exclude single-administration treatments; N < 2 ⇒ 0; else score 1 iff ≥ 50% of eligible treatments have an explicit numeric duration (`TREATMENT_DURATION_VALUE_PATTERN`, `:866`). The note even reports "D of N (…%)".
2. **Verdict** — the reported inconsistency (LLM case-by-case judgment, no numeric threshold) cannot occur in current code. **No action.** One residual nit: `SINGLE_ADMINISTRATION_TREATMENT_PATTERN` is `/injection/i` only — a series like "corticosteroid injection ×3 over 6 months" is excluded from duration eligibility by design per `.claude/skills/pa-scoring-conventions/SKILL.md`; consistent, not a defect.
3. **Confidence** — **verified**.

### B5. `lib/demo-data.ts` drift (backlog item 4, drift half) — isolated as intended — **verified refutation of leakage**

1. **Observation** — `lib/demo-data.ts` is imported only by `app/builder/page.tsx` (client demo UI), `lib/sample-charts.ts`, and `scripts/generate-sample-fix-cache.ts` (offline script). Nothing in the live pipeline (`lib/pa-pipeline.ts`, any `/api` route) imports it or `lib/sample-fix-cache.json`. Prompt-eval uses `lib/sample-charts/` (DOCX fixtures dir), not demo data.
2. **Verdict** — frozen-fixture isolation holds for the *pipeline*; the only demo-data-to-live-route path is the runtime one described in B3. Related dead weight: `lib/sample-charts.ts` and `lib/sample-fix-cache.json` have no runtime consumers at all (the `/api/suggest-fix` route they served no longer exists) — see C3.
3. **Confidence** — **verified**.

### B6. Regenerate silently rescores the two LLM factors with lax presence checks — a clinically-judged 0 can flip to 1 with no new clinical input — **verified**

1. **Observation** — `regenerate-denial-fix` calls `computeDeterministicPaStrength(mergedExtraction, requestDetails.cptCode)` with the 3rd (`llmRawPaStrength`) arg intentionally omitted (`app/api/regenerate-denial-fix/route.ts:142-149`). Without it, `diagnosis_codes` falls back to "any non-empty code list ⇒ 1" and `surgical_approach` to "any non-null string ⇒ 1" (`lib/pa-pipeline.ts:1023-1032`, `986-1005`).
2. **Why it's wrong** — the extraction LLM can score `diagnosis_codes` 0 for a *clinically mismatched* code (extraction prompt: "a vague or mismatched code does not [support]", `lib/pa-pipeline.ts:98`). On any regenerate — even one supplementing an unrelated factor — that 0 flips to 1 because the codes array is non-empty. The headline PA Strength score inflates without any new clinical evidence, exactly the failure class the server-side rescore was built to prevent (its own comment, `route.ts:139-145`, says so).
3. **Root cause** — no fresh extraction call exists on the regenerate path, and instead of carrying forward the previous LLM judgment, the code substitutes a weaker rubric.
4. **Proposed solution** — pass the *previous* LLM factor scores through as the 3rd arg (client already has them in `extractionJson.pa_strength`; only override when the supplement actually targets that factor — e.g. a `diagnosis_codes` supplement legitimately changes the codes and warrants re-evaluation, for which the honest options are: keep previous score, or presence-check with the note flagging it as unverified). Alternatives: (a) fresh extraction-scoring LLM call on regenerate — costs a call per regenerate; (b) status quo — misleads on the product's core number.
5. **Blast radius** — scoring displayed to the physician + PostHog `pa_score` + payer-checklist derivation (`getPayerChecklist` consumes the rescored extraction). Scoring logic ⇒ re-run eval fixtures for score calibration (Kim should stay 8/8).
6. **Confidence** — **verified** (both fallbacks and the omitted arg read first-hand).

---

## SECTION C — Robustness / hygiene (agent-sourced, spot-checked where noted)

### C1. Client JSON trusted via `as`-casts in denial-fix ⇒ raw TypeErrors as 500s — **verified (agent A; consistent with first-hand reads)**
`app/api/regenerate-denial-fix/route.ts:43-54` validates fields only as truthy, then `:162` calls `.filter` on `denial_risk_flags` and the merge spreads `conservative_treatments_attempted` — a body missing either array throws `TypeError` → 500 with the raw message (see C2). Fix: minimal shape validation at the boundary (arrays are arrays), not a schema framework. Blast radius: the route only.

### C2. 4 of 6 routes return raw `error.message` to clients at 500 — **verified (agent A)**
`regenerate-letter:131-132`, `regenerate-denial-fix:200-201`, `generate-appeal-talking-points:260-261`, `anchor-flags:75-76` — includes raw Anthropic response bodies via `AnthropicHttpError`. `generate-pa:177-179` already does it right (generic message, detailed server log). Fix: match generate-pa's pattern. Low-severity info disclosure; no PHI (deid errors are structurally PHI-free), but internals leak.

### C3. Dead code cluster — **verified (agent A + first-hand greps)**
- `lib/sample-charts.ts` + `lib/sample-fix-cache.json` + `scripts/generate-sample-fix-cache.ts`: zero runtime consumers; served a `/api/suggest-fix` route that no longer exists. CLAUDE.md and the phi-reviewer agent description still reference `/api/suggest-fix` (stale docs).
- `app/api/anchor-flags` note: grep finds **no client caller** of `/api/anchor-flags` (only the route itself) — the route appears live-but-orphaned; confirm with UI agent result before treating as dead. **probable**.
- `generate-pa/route.ts:189-191, 213-220`: unreachable `!isPdf`/`!isDocx` guards (caller already dispatches). `lib/pa-pipeline.ts`: `normalizeChartData`/`nullableString` exported, imported nowhere; `parseJsonObject` async with no await. Cosmetic.

### C4. Eval-vs-route supplement key mismatch — **verified first-hand**
`scripts/eval-pipeline.ts:840` sends supplement key `conservative_treatments_attempted`; the route's merge switches on `conservative_treatments_named` / `conservative_treatment_duration` (`route.ts:241,248`). Harmless today only because the eval deliberately doesn't port the merge — but it means the eval exercises a supplement key the product never sends. Fix alongside A3's eval extension.

### C5. Anchor-flags robustness (if route is kept): no reidentify pass on returned anchors + shape-unvalidated `parsed.anchors` + silent catch — **verified (agent A)**, contingent on C3's orphan question
`app/api/anchor-flags/route.ts:44-62` — anchors are quoted from the *redacted* letter and returned without `reidentifyDeep` (contrast `generate-appeal-talking-points/route.ts:208-215` which fixes exactly this); `catch {}` at `:58` is unlogged. If the route is orphaned (C3), delete instead of fix.

### C6. `captureEvent` awaited in-line can convert successes/422s into 500s — **probable (agent A)**
`app/api/generate-pa/route.ts:137-147` awaits PostHog flush between paid generation and response; a flush rejection discards the result (and inside `DeidVerificationError` handlers, converts a structured 422 into a 500). Depends on posthog-node v5 flush rejection behavior — verify before fixing (e.g. wrap in try/catch or fire-and-forget with `.catch(console.error)`).

### C7. Single shared 5-req/60s per-IP rate bucket across all six routes — **verified structurally (agent A); operational impact probable**
`lib/rate-limit.ts:4-8` — one sliding window shared by all user-facing routes, keyed by first `x-forwarded-for` hop. A clinic behind one NAT IP exhausts 5 slots in one normal workflow (generate → anchor-flags → regenerate → export). Also `UPSTASH_REDIS_REST_URL/TOKEN` missing from CLAUDE.md's required-env list while `Redis.fromEnv()` throws at module load. Product decision on limits needed; doc fix is free.

### C8. Review page is wall-to-wall inline `style={{}}` — **verified first-hand; cosmetic, recommend deferring**
`app/review/page.tsx` throughout (e.g. `:834-901`, `:919-939`) violates the strict-Tailwind convention (CLAUDE.md "Conventions"). Converting is a large, regression-prone diff with zero user-visible payoff — flag for a dedicated pass, don't bundle into this session.

### C9. Telemetry nit — **verified (agent A)**
`generate-pa:169-176` failure event hardcodes `distinctId: "server"` while success uses `user.id`. Trivial.

---

## SECTION D — UI hygiene (UI agent; evidence cited, not independently re-read unless noted)

### D1. Dead components — **verified (agent)**
`components/FlagPopover.tsx` and `components/EHRAddendumGenerator.tsx`: zero importers repo-wide (previous-generation review UI). Delete candidates.

### D2. Demo FeedbackWidget posts live to `/api/feedback` — **verified (agent)**
`app/review/page.tsx:1462` — demo sessions pollute the real `pa_outcomes` Redis list. Fold into B3's `isDemo` gating fix.

### D3. 300ms stale-letter window — **probable (agent)**
`handleContentEditableInput` debounces `setEditedLetter` 300ms (`app/review/page.tsx:218-225`); Regenerate/Download clicked in edit mode within that window send the pre-edit letter. Fix: flush the debounce at the top of `handleRegenerate`/`handleDownload`.

### D4. `export const dynamic = 'force-dynamic'` on a `'use client'` page — **speculative-harmless (agent)**
`app/review/page.tsx:2` — route-segment config is a server-component feature; ignored here. Remove for clarity.

### D5. Browser Supabase clients in `'use client'` files — auth-only, rule-text violation — **verified (agent), decision needed**
`app/builder/DemoModeBar.tsx:5,12-13`, `app/login/page.tsx:69-70`, `app/auth/confirm/page.tsx:18-37`. All session/OTP flows, zero data queries, anon key only. Either amend the CLAUDE.md rule to say "data queries" or restructure auth — recommend amending the rule.

---

## SECTION E — Security (security agent; lead spot-checked E1 and A5 first-hand)

### E1. Open redirect in auth callback via unvalidated `next` param — **verified (spot-checked first-hand)**
`app/api/auth/callback/route.ts:11-21` — `redirect` param gets `startsWith('/')`; `next` gets **no validation** and is concatenated into `NextResponse.redirect(`${origin}${next}`)`. `?next=@evil.com` → `https://orthren.com@evil.com` → browser lands on evil.com from a trusted magic-link URL. Fix: same-origin validation for both params (`startsWith('/') && !startsWith('//')`), one shared helper. Related **probable**: `startsWith('/')` alone admits protocol-relative `//evil.com` in `app/auth/confirm/page.tsx:12-15` and `app/login/page.tsx:63-66` — same helper fixes all four sites. Blast radius: auth flow — re-verify full sign-in→out→in cycle by hand per `.claude/rules/auth-flow.md`.

### E2. ADMIN_SECRET routes: no rate limit + non-constant-time compare — **verified (agent)**
`app/api/admin/send-launch/route.ts:21-24`, `send-update/route.ts:20-23`, `test-extraction/route.ts:17-20`, `test-letter/route.ts:8-11` — none import `rateLimiter`; all use plain `===`/`!==`. Unthrottled brute-force target; prize = mass email to waitlist + arbitrary live Anthropic spend. `/admin` page (`app/admin/page.tsx:16-19,80`) advertises the credential name with a cosmetic client gate. Fix: `rateLimiter` + `crypto.timingSafeEqual` on all four.

### E3. Unsubscribe executes on bare GET + swallowed DB error — **verified (agent; consistent with `.claude/rules/auth-flow.md` scanner-prefetch history)**
`app/api/unsubscribe/route.ts:8-27` — email-scanner prefetch (documented failure mode in this very repo's auth rules) silently unsubscribes recipients. And `lib/supabase/server.ts:115-118` discards the update result — a failed update still redirects to "/unsubscribed" (CAN-SPAM exposure). Fix: confirm-page POST pattern + check the update result.

### E4. Raw `error.message` passthrough (extends C2) — **verified (agent)**
Also `feedback/route.ts:71-72`, `admin/send-launch:66-67`, `admin/send-update:74-75`. Same fix as C2: generic client message, detailed server log. Related **probable**: `generate-pa:169-176` ships raw error text to PostHog — make it a fixed enum/truncated.

### E5. `supabase_setup.sql` stale vs live schema — **verified (agent, confirmed against live DB via MCP)**
File creates `waitlist_signups` without `name`/`unsubscribed`; code writes both (`lib/supabase/server.ts:59,98,110,117`). Live DB has them, so prod works — but the repo's only SQL source-of-truth builds a broken schema. Also: orphan live table `kv_store_2439e7c2` (0 rows, referenced nowhere); `.neq("unsubscribed", true)` excludes NULL rows (**speculative** edge — live default is `false`). Fix: update the SQL file (note: `.claude/rules/api-conventions.md` requires explicit human confirmation to touch it — will ask).

### E6. Committed credentials/junk tracked in git — **verified (agent)**
`mcp_client.mjs:5` (expired Motion OAuth JWT), `poll_token.ps1`/`poll_token2.ps1` (expired device codes), `next-dev.log`/`next-dev.err.log`, zero-byte shell-accident files (`echo`, `exit`, `fi`, `TARGET_FILE=`). Nothing currently exploitable; delete + gitignore. History scrub is your call (rewriting history on a frozen-for-submission repo mirror is exactly the kind of thing NOT to do — delete-forward only).

### E7. No security headers — **verified absence (agent)**
No CSP/HSTS/X-Frame-Options/Referrer-Policy anywhere (`next.config.mjs`, `vercel.json`, `middleware.ts`) on a product holding PHI in browser sessionStorage. Fix: `headers()` in next.config.mjs; CSP needs care with PostHog/Supabase origins — start with HSTS, X-Frame-Options DENY, Referrer-Policy, nosniff.

### E8. Env-var doc drift — **verified (agent)**
CLAUDE.md says `SUPABASE_ANON_KEY`; code uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` + undocumented `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/server.ts:36-37`); `UPSTASH_REDIS_REST_URL/TOKEN` absent from CLAUDE.md while `Redis.fromEnv()` throws at module load (see C7). `lib/posthog.ts:3` empty-key fallback silently drops all server analytics **including `deid_verification_failed` audit events** — worth a startup warn.

### E9. `*.vercel.app` wildcard in serverActions.allowedOrigins — **probable-low (agent)**
`next.config.mjs:5-11` — whitelists every Vercel customer's origin for Server Action CSRF checks. Currently mitigated (only server action is the public waitlist join). Scope it when authenticated actions are added. Note CLAUDE.md's gotcha explicitly prescribes the wildcard — doc and hardening in tension; decide when it matters.

### Security checked-and-clean highlights (agent, full list in transcript)
No nonexistent-table queries; browser Supabase is auth-only; all 7 user-facing routes session-gated; unsubscribe HMAC uses `timingSafeEqual` with required secret; no `NEXT_PUBLIC_` secret misuse; PostHog payloads PHI-free except E4's error string; no chart/letter persistence outside A5; `.env*` untracked; RLS enabled on both live tables; admin secret travels in header only.

---

## Priority order for Phase 2 (pending your confirmation)

**Tier 1 — SOURCE LOCK / PHI integrity:** A1, A2 (de-id gate to outbound-prompt boundary), A3 (merge-before-verify + eval supplement), A4 (strip-list drift), A5 (feedback de-id+cap).
**Tier 2 — user-facing correctness:** B1 (cpt fix routing), B6 (fallback rescore), B3+D2 (demo gating both layers), B2 (pass-row notes), E1 (redirect validation), E2 (admin throttle), E3 (unsubscribe GET).
**Tier 3 — hygiene:** C1, C2+E4, C3+D1 (dead code), C4, C6 (verify then fix), C7+E8 (docs+limits decision), E5 (needs your OK on supabase_setup.sql), E6 (delete-forward), E7, D3, D4, D5 (rule amendment), C9.
**Explicitly deferred:** C8 (inline-style conversion — separate pass), E9 (until authenticated server actions exist), payer rules (4 blocked — out of scope per session brief), history scrub (E6).

**Backlog-item verdicts:** item 1 (conservative_treatment_duration) — already fixed, stale report (B4). Item 2 (breakdown UI) — confirmed, broader than reported (B2). Item 3 (cpt Apply Fix) — confirmed, worse than reported (B1). Item 4 (demo-data) — pipeline isolation holds (B5), runtime leak exists via Regenerate (B3).
