---
paths:
  - app/auth/**
  - app/api/auth/**
  - app/login/**
---

# Auth / Magic-Link Rules

This flow consumed ~10 separate sessions over two weeks (Jun 18–29) chasing the same handful of landmines. Check here before re-diagnosing a magic-link bug from scratch.

## Email-scanner prefetch consumes tokens
Corporate/consumer email scanners (Outlook Safe Links, Gmail image proxies, etc.) issue a GET against the magic-link URL before the human clicks it — if that GET fully verifies the OTP/code, the token is burned and the user's real click gets "invalid or expired," forcing a second request every time. This was the root cause of a chronic "always have to request the link twice" bug. Do not treat a real click "consuming" a token as inherently broken — the fix is to make sure only *one* verification path (the client-side `/auth/confirm` page or the server-side `/api/auth/callback` route, not both racing) actually calls `exchangeCodeForSession` / `verifyOtp`, and that the flow is resilient to a single extra prefetch GET.

## Cookies must be set on the response you actually return
`cookies()` from `next/headers` and a `NextResponse.redirect(...)` are different response objects — setting cookies via the former does not attach them to the latter, so the session cookie silently never reaches the browser. Build the redirect `NextResponse` first, then pass its `.cookies.set` into the Supabase server client's `setAll`, as `app/api/auth/callback/route.ts` does now. If a session appears to "half work" (redirects but user isn't actually logged in), check this first.

## Handle both `token_hash` and `code` params
Supabase can send either an OTP `token_hash` (+ `type`, use `supabase.auth.verifyOtp`) or a PKCE `code` (use `supabase.auth.exchangeCodeForSession`) depending on flow configuration. Both `app/api/auth/callback/route.ts` and `app/auth/confirm/page.tsx` must handle both shapes — don't assume only one will ever appear.

## Config dependencies live outside the repo
- `NEXT_PUBLIC_SITE_URL` (or equivalent) must match the deployed origin, or generated links point at the wrong host.
- Supabase Dashboard → Authentication → URL Configuration must allow the redirect URL(s) in use, including preview domains.
- `next.config.mjs` `serverActions.allowedOrigins` must include the production domain and `*.vercel.app` for preview branches (see CLAUDE.md gotchas) — a new domain silently breaks Server Actions on that origin, not just auth.
None of these are visible from the code alone; if a fix looks correct in the repo but still fails live, check these three first.

## Route-gating: sandbox/builder buttons
Auth guards on "try the sandbox" / "interactive demo" buttons (`/builder`, `/sandbox` entry points) have previously conflicted with the sign-in/sign-out flow — e.g. a logged-in user being asked for a magic link again when pressing a demo button. When changing the auth gate on any entry point, verify the full sign-in → sign-out → sign-in cycle, not just the single path you changed.

## Testing note
There is no automated test for this flow (email round-trips make it expensive to automate reliably) — verify by hand: request a link, let it sit unclicked for a few seconds (simulates scanner prefetch), then click it for real, then sign out and repeat.
