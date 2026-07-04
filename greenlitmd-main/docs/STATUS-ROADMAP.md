# Orthren — Roadmap

This file is the canonical, in-repo status doc going forward. It supersedes any
roadmap doc kept outside the repository — this repo is the source of truth for
project status. Keep it updated in the same PR as any change that closes or
reopens an item below.

Last updated: 2026-07-03

---

## STATUS SNAPSHOT (as of 2026-07-03)

| Track | State |
|---|---|
| Extraction/letter pipeline | SOURCE LOCK validated — 60/60 PASS (see below) |
| Security (auth/RLS) | Rate limiter live (`lib/rate-limit.ts`); RLS policy + regression test exist (`supabase_setup.sql`, `scripts/test-rls.mjs`) for `waitlist_signups`. `[VERIFY: full list of tables covered by RLS policies and current pass/fail state of scripts/test-rls.mjs — not run as part of this update]` |
| Payer rules engine | 8/12 rules `validated` in `lib/payer-rules.ts`; 3 UHC rules blocked (defer to licensed InterQual criteria); 1 Aetna rule blocked (no dedicated primary source exists) — see `scripts/payer-rules-status.ts` |
| Outreach infra | `[VERIFY: no outreach tooling (Streak, leave-behind materials, practice list) is tracked in this repo — status lives outside the codebase]` |
| Billing | Not built in repo — no Stripe integration present |
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

## Security

- Auth rate limiting: `lib/rate-limit.ts` (Upstash sliding window, 5 req/60s),
  added in commit `11d6ee6`.
- RLS: `supabase_setup.sql` enables RLS + a `service_role_only` policy on
  `waitlist_signups`. `scripts/test-rls.mjs` is a regression check (anon-key
  probe) covering `waitlist`, `users`, `pa_cases`, `submissions`, `profiles`,
  `subscriptions`, `payer_rules`.
- `[VERIFY: whether all tables in scripts/test-rls.mjs's TABLES list currently have RLS policies defined, and whether the script has been run recently — this doc does not re-run it]`

## Payer rules engine

Per `scripts/payer-rules-status.ts` (run against current `lib/payer-rules.ts`):

- **8 validated** — confirmed by directly fetching and quoting the primary payer source
- **3 blocked** (UHC, CPT 27447/27130/29827) — payer policy defers PT-week/NSAID-trial thresholds to licensed InterQual criteria, which is not accessible
- **1 blocked** (Aetna, CPT 29827) — no dedicated payer policy document exists for this procedure at all

## Outreach infra

Not tracked in this repository (Streak CRM, leave-behind materials, practice
list are external tooling). `[VERIFY: current state with whoever owns that tooling — not visible from repo]`

## Billing

No Stripe or billing integration present in the codebase as of this commit.

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
