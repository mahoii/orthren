@AGENTS.md

---

# Orthren — Claude Code Project Context

## Stack & Commands
- **Framework:** Next.js 14 App Router, TypeScript, Tailwind CSS
- **Database:** Supabase (server-side only — Server Actions / Route Handlers)
- **Email:** Resend via `hello@orthren.com` — domain verification required before Resend delivers
- **AI:** Anthropic API (`claude-sonnet-4-6`) via `lib/anthropic.ts`
- **Deployment:** Vercel → `orthren.com` (production) and `greenlitmd.app`
- **Commands:** `npm run dev` · `npm run build` · `npm run typecheck`
- **Env vars required:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `ADMIN_SECRET`, `UNSUBSCRIBE_SECRET`, `ANTHROPIC_API_KEY`

## Architecture Pointers
- **File ingestion → PA packet:** `app/api/generate-pa/route.ts` — pdf-parse / mammoth extraction, then 2× Anthropic calls (extraction + letter). Must stay `export const runtime = "nodejs"` — Edge Runtime breaks pdf-parse/mammoth.
- **PA Strength Score (8-factor):** Scoring weights are defined inline at the bottom of the extraction system prompt inside `app/api/generate-pa/route.ts`. Factor definitions and UI thresholds also live in `.claude/skills/pa-scoring.md`.
- **LOMN letter prompt:** `lib/letter-system-prompt.ts`
- **Anthropic wrapper:** `lib/anthropic.ts` — use `callAnthropicWithRetry` for all generation calls
- **DOCX export:** `app/api/export/route.ts`
- **Supabase client (server-side):** `lib/supabase/server.ts`
- **Demo / sandbox data:** `lib/demo-data.ts` + `lib/sample-charts.ts` — Delgado, Chen, Vance only

## Conventions
- Server Actions over API routes for mutations
- Strict Tailwind — no inline styles, no CSS modules
- All Supabase calls server-side; never in `'use client'` components
- API routes: `export const dynamic = "force-dynamic"` where needed; rate limiting via `lib/rate-limit.ts`

## Known Gotchas
- **CSRF / origin validation:** `next.config.mjs` `serverActions.allowedOrigins` must include production domain + `*.vercel.app` for preview branches. Adding a new domain requires updating this list.
- **Resend delivery:** Emails only deliver from `hello@orthren.com` once the domain is verified in the Resend dashboard. Any new sending domain requires DNS verification before use.
- **Edge Runtime incompatibility:** Never set `export const runtime = 'edge'` on any route that imports pdf-parse or mammoth — they require the Node.js serverless runtime.
- **Sandbox isolation:** `/sandbox` and its handlers must only read from the static Delgado / Chen / Vance profiles in `lib/demo-data.ts`. Zero live Anthropic calls from sandbox, ever.

## Testing / Regression Workflow
- The three synthetic charts — **Maria A. Delgado** (Clean TKA), **Robert Chen** (Messy Rotator Cuff), **Eleanor Vance** (Incomplete Lumbar Fusion) — are the standard regression set.
- Any change to the extraction prompt or letter-generation prompt must be checked against all three before merging. Use the `/prompt-regression-check` skill or the `prompt-evaluator` subagent.
- Run `npm run typecheck` before considering a change done. CI covers this, but catch it locally first.

## Clinical-Content Rules (Non-Negotiable)
- No real PHI anywhere in the repo — synthetic data only
- Generated letters must not hallucinate dates, CPT codes, or treatment history not present in the chart
- Conservative treatment extraction must be specific — never return `"not documented"` as a treatment name
- Imaging findings must not be fabricated — output `null` if imaging is labeled pending or absent
