# Orthren — Roadmap

This file is the canonical, in-repo status doc going forward. It supersedes any
roadmap doc kept outside the repository — this repo is the source of truth for
project status. Keep it updated in the same PR as any change that closes or
reopens an item below.

Last updated: 2026-07-05

---

## STATUS SNAPSHOT (as of 2026-07-05)

| Track | State |
|---|---|
| Extraction/letter pipeline | SOURCE LOCK validated — 60/60 PASS (see below) |
| De-identification | Strengthened 2026-07-05 — independent fail-closed verification layer (`lib/deid-verify.ts`) now gates every route that sends PHI-bearing text off-server; offline stress harness (`scripts/deid-stress-check.ts`) 30/30 PASS across 3 fixtures + adversarial cases (see below) |
| Security (auth/RLS) | Verified 2026-07-04 — `scripts/test-rls.mjs` PASS on all 7 tables (0 leaks). Only `waitlist`, `waitlist_signups` exist in the live project; both have RLS enabled with a `service_role_only` policy (added to `waitlist` this pass). `users`, `pa_cases`, `submissions`, `profiles`, `subscriptions`, `payer_rules` do not exist in the schema yet — no RLS risk, but also not yet real tables to secure. |
| Payer rules engine | 8/12 rules `validated` in `lib/payer-rules.ts`; 3 UHC rules blocked (defer to licensed InterQual criteria); 1 Aetna rule blocked (no dedicated primary source exists) — see `scripts/payer-rules-status.ts` |
| Appeal talking points | Route built 2026-07-05, wired to `/review` 2026-07-18 (`AppealSupportPanel` in `app/review/page.tsx`) — SOURCE LOCK + CITATION LOCK + de-id verification, plus a sandbox-isolation guard (`isSampleChartPatientName`) and a chart-grounded client-only demo path with zero live Anthropic calls |
| Outreach infra | `[VERIFY: no outreach tooling (Streak, leave-behind materials, practice list) is tracked in this repo — status lives outside the codebase]` |
| Billing | Manual Stripe Payment Links live via `/pricing` (`lib/pricing.ts`) — static routing layer only, no Stripe API/SDK integration, no webhooks, no DB tables |
| Congressional App Challenge | `[VERIFY: frozen-branch / submission-date status — not discoverable from repo state alone]` |

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

## Security

- Auth rate limiting: `lib/rate-limit.ts` (Upstash sliding window, 5 req/60s),
  added in commit `11d6ee6`.
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
