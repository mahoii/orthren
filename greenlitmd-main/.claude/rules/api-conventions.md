---
paths:
  - app/api/**
---

# API Route Conventions

## Runtime
- All routes that use `pdf-parse` or `mammoth` must declare `export const runtime = "nodejs"` — Edge Runtime will break file parsing
- Add `export const dynamic = "force-dynamic"` on routes with user-specific or time-sensitive responses

## Request validation
- Validate file size at the route boundary (`maxUploadSizeBytes = 4.5 * 1024 * 1024` — Vercel serverless request-body limit)
- Apply `rateLimiter` from `lib/rate-limit.ts` on all user-facing generation endpoints
- Never trust client-supplied CPT codes or payer names without basic sanitization

## Supabase calls
- Always use `lib/supabase/server.ts` — never instantiate a Supabase client in a `'use client'` component
- Do not modify `supabase_setup.sql` without explicit human confirmation

## Sandbox isolation
- Any handler under `/api` that could be called from the `/sandbox` route must short-circuit to static demo data for the three known demo patient names (Delgado, Chen, Vance)
- Zero live Anthropic calls may originate from sandbox — return cached/static responses only

## Secrets
- All env vars accessed via `process.env.VAR_NAME ?? ""` — never hardcode values
- `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `ADMIN_SECRET`, `UNSUBSCRIBE_SECRET` must never appear in client bundles
