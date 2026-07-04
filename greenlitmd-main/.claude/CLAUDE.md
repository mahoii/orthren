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
- **PA Strength Score (8-factor):** Extraction prompt lives in `lib/pa-pipeline.ts`. Only 2 factors (`diagnosis_codes`, `surgical_approach`) are LLM-scored there; the other 6 are scored deterministically by `computeDeterministicPaStrength` in the same file. Shared weights live in `lib/pa-strength-weights.ts`. Factor definitions and UI thresholds live in `.claude/skills/pa-scoring-conventions/SKILL.md`.
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

## Which Agent/Skill When
- Change to `lib/letter-system-prompt.ts` → `letter-prompt-logic-auditor` agent (static, no API calls, checks SOURCE LOCK/sig block/Re: line/pa_strength against the fixtures).
- Change to `/api/export`, `/api/regenerate-denial-fix`, or `postProcessLetter` → `docx-export-verifier` agent.
- Diff touching chart ingestion, `/api/generate-pa`, `/api/suggest-fix`, `lib/deidentify.ts`, or any Supabase query over patient data → `phi-reviewer` agent.
- Any change to the extraction prompt, `lib/letter-system-prompt.ts`, or `lib/anthropic.ts` before merging → `/prompt-regression-check` skill (live API, runs against Kim/Webb/Vance).

## Windows Environment Notes
- No `python` on PATH (Windows Store alias only, exits 49) — use `node -e "..."` for one-off scripts instead.
- The Bash tool runs Git Bash, not PowerShell — never feed it PowerShell cmdlets (`Remove-Item`, `Get-Content`, etc.) or `$var` syntax.
- Run project scripts from the repo root (or `cd` into it first) so relative imports resolve against the real `node_modules` — a script written to a scratch/temp dir will fail to resolve project packages like `mammoth` or `dotenv`.
- `Bash(rm -rf *)` is deny-listed. Delete a directory with `node -e "fs.rmSync('<dir>',{recursive:true,force:true})"` instead of retrying `rm -rf` or reaching for PowerShell's `Remove-Item`.
- Avoid a trailing backslash immediately before a closing quote in a bash string (`"C:\...\"`) — Git Bash reads it as an escaped quote and the command hangs on an unterminated string.

## Deploy Triage
- Production is `orthren.com` (Vercel). If the Vercel MCP server is enabled, prefer `get_deployment_build_logs` / `get_runtime_errors` scoped directly to that project over pasting logs by hand — but don't discover the project via `list_teams`/`list_projects` unless it's actually unknown; ask the user for the project name/ID first if a deploy-triage session needs it repeatedly.

## Testing / Regression Workflow
- The standard regression set is the three **DOCX** fixture charts in `lib/sample-charts/`: **Kim, Rachel** (CPT 29827, Clean rotator cuff), **Webb, Marcus** (CPT 27447, Messy TKA), **Vance, Sandra** (CPT 27130, Incomplete THA) — run via `scripts/eval-pipeline.ts`. Note: `lib/demo-data.ts` (Maria Delgado / Robert Chen / Eleanor Vance) is a separate, frozen `/sandbox` UI fixture and must never be used for prompt evaluation.
- Any change to the extraction prompt or letter-generation prompt must be checked against all three before merging. Use the `/prompt-regression-check` skill.
- Run `npm run typecheck` before considering a change done. CI covers this, but catch it locally first.

## Clinical-Content Rules (Non-Negotiable)
- No real PHI anywhere in the repo — synthetic data only
- Generated letters must not hallucinate dates, CPT codes, or treatment history not present in the chart
- Conservative treatment extraction must be specific — never return `"not documented"` as a treatment name
- Imaging findings must not be fabricated — output `null` if imaging is labeled pending or absent
