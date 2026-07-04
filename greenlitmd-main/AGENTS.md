# AI Agent Directives — Orthren

## Stack Context (Read Before Acting)
- **Framework:** Next.js 14 (App Router, Server Actions)
- **Database:** Supabase (direct table inserts, server-side only — no Auth-based email)
- **Email:** Resend via `hello@orthren.com`
- **Deployment:** Vercel (production at `orthren.com`)
- **Key Env Vars:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `ADMIN_SECRET`, `UNSUBSCRIBE_SECRET`, `ANTHROPIC_API_KEY`
- **Primary Domain:** Orthopedic prior authorization packet generation
- **PDF/DOCX Parsing:** `pdf-parse` and `mammoth` (Node.js runtime required)

## Hard Constraints
- Never hardcode secrets or env vars.
- All Supabase operations must execute server-side (Server Actions or Route Handlers). Never instantiate or call database clients inside a `'use client'` component.
- Do not modify the Supabase database schema (`supabase_setup.sql`) without explicit human confirmation.
- Do not modify Vercel deployment config without an explicit user instruction.
- All PA packet generation logic routes through `/api/generate-pa` — do not duplicate this logic elsewhere.
- Never set `export const runtime = 'edge'` on any Route Handler or Server Action, as `pdf-parse` and `mammoth` require a full Node.js serverless environment and will fail on the Edge Runtime.
- The `/sandbox` route and all associated handlers must remain 100% bound to static mock data (`Maria Delgado`, `Robert Chen`, `Eleanor Vance`). No live Anthropic API calls may originate from the sandbox under any circumstances.

## Closing Out Work
- When a numbered finding, audit item, or roadmap track changes state (opened, fixed, blocked, deferred), update `docs/STATUS-ROADMAP.md` in the same session — it is the single source of truth for project status. Do not assume prior "batches," findings, or roadmap items exist unless they appear in that file or in git history; if a brief references state you can't find there, say so instead of guessing.
