---
name: deploy-checklist
description: Step-by-step deploy checklist for GreenlitMD: env var verification, Vercel deploy, and smoke test. Run before every production deployment.
disable-model-invocation: true
---

# Skill: Deploy Checklist

## Pre-Deploy Verification
Run these checks in order. Do not deploy until all pass.

### 1. Environment Variables
Confirm the following are set in Vercel project settings (Settings → Environment Variables):
- [ ] `ANTHROPIC_API_KEY` — present, not expired
- [ ] `SUPABASE_URL` — points to production project
- [ ] `SUPABASE_ANON_KEY` — matches production project
- [ ] `RESEND_API_KEY` — valid, domain `greenlitmd.app` verified in Resend dashboard
- [ ] `ADMIN_SECRET` — set and matches any admin-route usage
- [ ] `UNSUBSCRIBE_SECRET` — set

### 2. Local Build Check
```bash
npm run typecheck
npm run build
```
Both must exit 0. Fix any type errors or build failures before proceeding.

### 3. Sandbox Isolation Smoke Test
Start `npm run dev` locally and navigate to `/sandbox`. Confirm:
- [ ] The three demo profiles (Delgado, Chen, Vance) load correctly
- [ ] No network requests to `api.anthropic.com` are triggered from the sandbox (check browser Network tab)
- [ ] Generating a PA packet in the sandbox returns cached/mock data, not a live API response

### 4. Deploy
```bash
vercel deploy --prod
```
Or push to `main` if auto-deploy is configured.

### 5. Post-Deploy Smoke Test (greenlitmd.app)
- [ ] Home page loads without errors
- [ ] Upload a test chart (use one of the synthetic charts from `lib/demo-data.ts`) and confirm PA packet generates
- [ ] Check that the LOMN letter appears in the right panel
- [ ] Confirm no console errors in browser DevTools

### 6. Vercel Logs Check
After deploy, check Vercel function logs for any 500 errors or cold-start failures:
```bash
vercel logs --prod
```
Or use the Vercel MCP via `/vercel-logs` to query directly from the session.

## Rollback
If smoke tests fail after deploy:
1. In Vercel dashboard → Deployments → select previous successful deployment → Promote to Production
2. Investigate root cause before re-deploying
