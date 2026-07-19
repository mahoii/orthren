# Orthren — Roadmap

This file is the canonical, in-repo status doc going forward. It supersedes any
roadmap doc kept outside the repository — this repo is the source of truth for
project status. Keep it updated in the same PR as any change that closes or
reopens an item below.

Last updated: 2026-07-19

---

## STATUS SNAPSHOT (as of 2026-07-19)

| Track | State |
|---|---|
| Extraction/letter pipeline | SOURCE LOCK validated — 60/60 PASS baseline (see below); Anthropic client hardened and structured-outputs conversion pending live re-verification (see "API client hardening" below) |
| De-identification | Strengthened 2026-07-05, extended 2026-07-19 — independent fail-closed verification layer (`lib/deid-verify.ts`) now gates every route that sends PHI-bearing text off-server; offline stress harness (`scripts/deid-stress-check.ts`) 39/39 PASS across 3 fixtures + adversarial cases, up from 30/30 (see "De-identification corpus extension" below) |
| API client hardening | 2026-07-19 — `lib/anthropic.ts` rewritten: per-attempt timeout + cross-call deadline budget, full-jitter backoff honoring `Retry-After`, `stop_reason` truncation/refusal handling, multi-text-block concatenation, prompt caching (`cache_control: ephemeral`), configurable model via `ANTHROPIC_MODEL`. All 6 Anthropic-calling routes gained `maxDuration = 300`. Offline harness `scripts/anthropic-client-check.ts` 9/9 PASS. Live `/prompt-regression-check` still pending (batched with structured-outputs work). |
| CSP / CI | 2026-07-19 — `Content-Security-Policy-Report-Only` staged in `next.config.mjs` (PostHog + Supabase origins; observation-only, not enforcing). New `.github/workflows/ci.yml`: typecheck + build + deid-stress-check on every push/PR, verified secretless with placeholder env. |
| Security (auth/RLS) | Verified 2026-07-04 — `scripts/test-rls.mjs` PASS on all 7 tables (0 leaks). Only `waitlist`, `waitlist_signups` exist in the live project; both have RLS enabled with a `service_role_only` policy (added to `waitlist` this pass). `users`, `pa_cases`, `submissions`, `profiles`, `subscriptions`, `payer_rules` do not exist in the schema yet — no RLS risk, but also not yet real tables to secure. |
| Payer rules engine | 8/12 rules `validated` in `lib/payer-rules.ts`; 3 UHC rules blocked (defer to licensed InterQual criteria); 1 Aetna rule blocked (no dedicated primary source exists) — see `scripts/payer-rules-status.ts` |
| Appeal talking points | Route built 2026-07-05, wired to `/review` 2026-07-18 (`AppealSupportPanel` in `app/review/page.tsx`) — SOURCE LOCK + CITATION LOCK + de-id verification, plus a sandbox-isolation guard (`isSampleChartPatientName`) and a chart-grounded client-only demo path with zero live Anthropic calls |
| Case persistence (Auth/DB) | 🔴 DEFERRED (Roast KILL finding) — builder→review is sessionStorage only. No cross-session anchoring for appeals or audit trails; real fix requires full accounts/DB layer (deliberately deferred). |
| Outreach infra | `[VERIFY: no outreach tooling (Streak, leave-behind materials, practice list) is tracked in this repo — status lives outside the codebase]` |
| Billing | Manual Stripe Payment Links live via `/pricing` (`lib/pricing.ts`) — static routing layer only, no Stripe API/SDK integration, no webhooks, no DB tables |
| Congressional App Challenge | `[VERIFY: frozen-branch / submission-date status — not discoverable from repo state alone]` |

---

## 2026-07-19 hardening pass (Anthropic client, de-id corpus, CSP/CI, cleanup)

Four parallel work packages, merged and cross-checked. Full context/evidence in the session's plan file; this is the durable summary.

**Anthropic client (`lib/anthropic.ts` + all 6 Anthropic-calling routes):**
- Per-attempt `AbortSignal.timeout`, plus a `deadlineMs` budget threaded through `callAnthropic`/`callAnthropicWithRetry` and now also through `lib/pa-pipeline.ts` (`extractChartDataFromText`, `generateLetterFromExtraction`) and `lib/extractionValidator.ts` (`validateExtraction`) — `generate-pa`'s route computes one shared deadline (`startTime + 280s`) across its up-to-4 Anthropic calls so the client's own retries can't blow the route's `maxDuration`.
- Full-jitter exponential backoff, honors the `Retry-After` header on 429/529 (`computeBackoffDelayMs`, pure/testable).
- `stop_reason` handling: `max_tokens` → one retry at up to 1.5× tokens (capped 8192) then `AnthropicTruncatedError`; `refusal` → immediate `AnthropicRefusalError`, no retry.
- Text extraction now concatenates all `type: "text"` blocks instead of indexing `content[0]`.
- System prompt sent as `[{type:"text", text, cache_control:{type:"ephemeral"}}]` — prompt-caching breakpoint, bytes-identical otherwise. Per-call `usage` (input/output/cache_read/cache_creation) logged.
- Model configurable via `ANTHROPIC_MODEL` env var (defaults `claude-sonnet-4-6`).
- `export const maxDuration = 300` on all 6 Anthropic routes (Vercel Pro + Fluid supports up to 800s).
- `generate-pa`: upload cap corrected 10MB → 4.5MB (matches the Vercel body limit already mandated in `.claude/rules/api-conventions.md`); added PDF/DOCX magic-byte sniff before parsing.
- `regenerate-letter`: added request-body shape validation (was an unchecked raw cast, malformed bodies threw raw 500s).
- New offline harness `scripts/anthropic-client-check.ts` (mocked fetch, zero API calls) — 9/9 PASS, covers timeout/Retry-After/jitter/truncation/refusal/deadline/multi-block behavior.

**De-identification corpus extension (`lib/deidentify.ts`, `scripts/deid-stress-check.ts`):** 30 → 39 passing cases. Two new additive passes: ALL-CAPS bare city names in relocation/origin context (Titlecase was already covered by the existing residual sweep; ALL-CAPS was not), and unlabeled bare alphanumeric identifiers with 3+ hyphen-joined segments (narrow enough to never collide with CPT modifiers, HCPCS codes, spine levels, or ICD-10 decimal codes — all separately tested as must-survive). `lib/deid-verify.ts` (the independent second layer) was deliberately left untouched. Residual risk accepted and documented (not fixed — no safe additive regex exists): unlabeled bare IDs with 0–1 hyphens or none, bare 17-char VINs, schemeless URLs. Each maps to a specific HIPAA Safe Harbor §164.514(b)(2) identifier category.

**CSP + CI:** `Content-Security-Policy-Report-Only` added to `next.config.mjs` (PostHog `*.posthog.com`/`*.i.posthog.com`, Supabase host derived from `NEXT_PUBLIC_SUPABASE_URL` at build time — not hardcoded); the 4 existing enforcing headers unchanged; no enforcing CSP yet (deliberate staged rollout, pending an observation window). New `.github/workflows/ci.yml`: typecheck → build → `deid-stress-check` on push/PR, Node 20, rehearsed secretless with placeholder env vars (Redis/Supabase/Anthropic/Resend/admin secrets — `POSTHOG_API_KEY` deliberately left unset to exercise the new startup-warn path below).

**Cleanup:**
- Deleted `app/api/anchor-flags/route.ts` (zero runtime callers, confirmed by full repo grep both before and after this pass).
- `lib/posthog.ts`: the installed `posthog-node` throws (not silently no-ops) at construction on an empty `POSTHOG_API_KEY`, which would crash cold start on every importing route. Now falls back to a no-op stub client + one-time `console.warn`, so server analytics (including the `deid_verification_failed` compliance audit event) degrade to silently-dropped rather than crashing. Found independently by two workers; fixed centrally during merge.
- `app/api/feedback/route.ts`: `pa_outcomes` Redis list now trimmed to the most recent 10,000 entries after each `lpush` (was unbounded).
- Removed a stray broken gitlink (`greenlitmd`, mode 160000) that had ended up tracked in the repo, unrelated to this pass.

**Deferred, not attempted this pass:** real structured outputs (`output_config.format json_schema`) on the extraction/validator/appeal calls — capability confirmed live (`claude-sonnet-4-6` supports it), implementation pending as the run's one batched live-regression change. CSP enforcement flip. `lib/deid-verify.ts` changes. Sonnet 5 migration.

---

## Extraction/letter pipeline — SOURCE LOCK validation

**Status: CLOSED.** 60/60 PASS across all three fixture charts (Kim, Webb, Vance)
via the tiered multi-route check in `scripts/eval-pipeline.ts`
(`SOURCE_LOCK_TIERED=1`):

- `generate-pa` × 10 runs per fixture
- `regenerate-letter` × 5 runs per fixture
- `regenerate-denial-fix` × 5 runs per fixture

Commit `d585dde` ("significant source lock gate issue: closed") landed the
date-normalization fix (`parseDateFlexible`, `isDateGroundedInHaystack` in
`lib/pa-pipeline.ts`) that resolved a Webb false positive (0/10 → 10/10 after
the fix).

`scripts/source-lock-multirun-check.ts` is a separate, narrower script and is
explicitly out of scope for this fix — it has no date-matching logic and the
Webb bug class doesn't apply to it.

## De-identification

**Status: strengthened, commit `a97bec9` ("de id layer strength optimized").**

- `lib/deidentify.ts` substantially reworked (627 insertions / 191 deletions) — broader normalization (bidi/formatting control chars, smart quotes, NFKC), more identifier categories, credential/name-dedupe fixes.
- New `lib/deid-verify.ts`: an independent, fail-closed post-redaction leak detector. By design it never imports detection regexes from `deidentify.ts` (only the name stoplist is shared as pure data) — the two passes are kept structurally independent so a bug in one can't silently blind the other. Leak reports carry only a category label + offset, never a raw value, so even a thrown error can't leak PHI through a log or API response.
- `assertDeidentified` / `DeidVerificationError` are now wired in as a hard gate (422 `DEID_VERIFICATION_FAILED` + PostHog `deid_verification_failed` event) at every seam that sends PHI-bearing text to Anthropic or off-server: `generate-pa`, `regenerate-letter`, `regenerate-denial-fix` (both the extraction-JSON and letter redactions, checked against the final merged PHI map), and `anchor-flags`.
- New offline harness `scripts/deid-stress-check.ts` (`npx tsx scripts/deid-stress-check.ts`, no live API calls) — regression-checks `deidentify.ts` + `deid-verify.ts` against the 3 real fixture charts (name/MRN/date/etc. must be scrubbed; clinical content like CPT/ICD codes and treatment values must survive) plus ~25 adversarial cases (zero-width-split SSNs, smart-quote/JSON-escaping edge cases, unlabeled bare digits, planted-leak controls, etc.). **Current result: 30/30 PASS** (verified 2026-07-05).

**Exit criteria for CLAUDE.md's "de-identification pipeline verified against a real chart, not just fixtures" item:** still open — this pass strengthens and regression-tests against the fixture set, but does not itself constitute a real (non-fixture) chart run.

## Appeal talking points

**Status: wired to `/review`.** Route commit `e8801e1`; UI wiring 2026-07-18.

- `app/api/generate-appeal-talking-points/route.ts` — Anthropic-backed route that turns a denial reason + extracted chart into structured peer-to-peer/appeal rebuttal points (`rebuttal_points`, `criteria_citations`, `suggested_next_step`).
- Carries the same SOURCE LOCK / CITATION LOCK / injection-guard discipline as the letter pipeline, plus field-whitelisting (`buildSanitizedChart`) and de-identification (`deidentifySanitizedChart`, gated by `assertDeidentified` per the de-id section above) before any chart data leaves the server.
- Sandbox isolation: `isSampleChartPatientName` guard added to the route (mirrors `regenerate-denial-fix`), and the `AppealSupportPanel` client component in `app/review/page.tsx` short-circuits entirely for demo charts — the demo path builds a result from already-loaded chart fields with no `fetch` call at all.
- Consumed by a new "Denial & Appeal Support" panel in the `/review` right rail: paste a denial reason, get rebuttal points, citations, and a suggested next step.
- 2026-07-18: `isSampleChartPatientName` guard added to `app/api/regenerate-letter/route.ts` — it was the last live-Anthropic route missing the sandbox-isolation check its siblings (`regenerate-denial-fix`, `generate-appeal-talking-points`) already had.

## Security

- Auth rate limiting: `lib/rate-limit.ts` (Upstash sliding window, 5 req/60s),
  added in commit `11d6ee6`. Hardened in commit `1f806ce` with limits on `/api/unsubscribe` and test route GETs, plus try/catch blocks on test routes and auth/signout.
- Data cleanup: Deleted committed junk including `mcp_client.mjs` (had a live-looking OAuth JWT), stray `.ps1` scripts, and shell-accident files (commit `1f806ce`).
- Database schema: `supabase_setup.sql` updated to add `name`/`unsubscribed` columns to match actual writes.
- RLS: `scripts/test-rls.mjs` run against the live Supabase project
  (`greenlitmd`, `zvarxrjfjxghclarvoux`) on 2026-07-04 with the anon key.
  Result: **0 leaks / 7 checked, all PASS.**

  | Table | Exists live? | RLS enabled | `service_role_only` policy | Result |
  |---|---|---|---|---|
  | `waitlist` | yes | yes | added this pass (`supabase_setup.sql` + live migration `add_service_role_only_policy_waitlist`) — coexists with the pre-existing `Allow public inserts` anon INSERT policy needed for the signup form | PASS |
  | `waitlist_signups` | yes | yes | yes (pre-existing) | PASS |
  | `users` | no | n/a | n/a | PASS (table does not exist — `test-rls.mjs` reports this as `[OK]` rather than `[SKIP]` because PostgREST's "table not found" error isn't code `42P01`; script's skip-detection is stale) |
  | `pa_cases` | no | n/a | n/a | PASS (does not exist, same caveat as above) |
  | `submissions` | no | n/a | n/a | PASS (does not exist, same caveat as above) |
  | `profiles` | no | n/a | n/a | PASS (does not exist, same caveat as above) |
  | `subscriptions` | no | n/a | n/a | PASS (does not exist, same caveat as above) |
  | `payer_rules` | no | n/a | n/a | PASS (does not exist, same caveat as above) |

  Note: `public.waitlist` is a separate, smaller table from `public.waitlist_signups`
  (different columns, 0 vs 2 rows) — looks like a legacy/duplicate table still
  live in prod. Not in scope to consolidate here; flagging for follow-up.

## Payer rules engine

Per `scripts/payer-rules-status.ts` (run against current `lib/payer-rules.ts`):

- **8 validated** — confirmed by directly fetching and quoting the primary payer source
- **3 blocked** (UHC, CPT 27447/27130/29827) — payer policy defers PT-week/NSAID-trial thresholds to licensed InterQual criteria, which is not accessible
- **1 blocked** (Aetna, CPT 29827) — no dedicated payer policy document exists for this procedure at all

## Outreach infra

Not tracked in this repository (Streak CRM, leave-behind materials, practice
list are external tooling). `[VERIFY: current state with whoever owns that tooling — not visible from repo]`

## Billing

`/pricing` (`app/pricing/page.tsx` + `lib/pricing.ts`) routes to manually-created
Stripe Payment Links (env vars `NEXT_PUBLIC_STRIPE_LINK_SOLO`,
`NEXT_PUBLIC_STRIPE_LINK_GROUP`) — intentionally a static routing layer, not a
billing integration. No Stripe SDK, no webhooks, no DB tables, no subscription
gating on `/builder` or `/review`. If a Payment Link env var is unset, the CTA
renders disabled with a `mailto:kamari@orthren.com` fallback.

## Congressional App Challenge

`[VERIFY: branch name, freeze status, and submission deadline — not present anywhere in repo config or docs]`

---

## Phase gates

- **Phase 0.5 (SOURCE LOCK validation): CLOSED.** Exit criteria (30/30 clean
  runs across all three fixtures) exceeded — 60/60 across the expanded
  three-route tiered check landed in `d585dde`.
- **Phase 1 (in-person outreach): UNBLOCKED** as of this validation, per the
  SOURCE LOCK gate closing above. Execution status of Phase 1 itself lives in
  outreach tooling, not this repo — see note above.

---

## Case Persistence (Architectural Gap)

**State: 🔴 DEFERRED (Roast KILL finding)**

Currently, data passage from builder to `/review` relies entirely on `sessionStorage`. There is no cross-session case persistence. Consequently, the new appeal panel (and any future audit trail) has nothing to anchor to across sessions, breaking the long-term utility of the appeal feature. 

This is a core architectural gap. A real fix requires building out an accounts and DB layer, which has been deliberately deferred for this run (payment-links-only, no dashboard yet). Flagged as a known gap for future prioritization.

## Polish & Hardening (Commit `1f806ce`)

- **Config & TS:** Updated `tsconfig.json` (es5 → ES2017, enabled `noUnusedLocals`/`noUnusedParameters`, removed all `any` casts). Clean `npm run typecheck` and `npm run build`.
- **Builder Limits:** Fixed contradictory upload limits (enforcing the correct 4.5MB Vercel body limit) and removed stray `alert()` calls.
- **Copy Updates:** Removed unsubstantiated "HIPAA compliant" badge from landing page (replaced with claim backed by the de-id pipeline) and qualified denial-cost stats as "industry estimates."
- **Styling:** Migrated `Logo.tsx` and `PricingSection` off inline-styles/Calendly to use Tailwind and `/pricing`.
- **Cleanup:** Deleted committed junk (`mcp_client.mjs` with leaked JWT, stray `.ps1` files, dev logs, 2 dead components).
