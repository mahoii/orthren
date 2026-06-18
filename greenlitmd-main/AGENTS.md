# AI Agent Directives — Orthren

## Stack Context (Read Before Acting)
- **Framework:** Next.js 14 (App Router, Server Actions)
- **Database:** Supabase (direct table inserts, server-side only — no Auth-based email)
- **Email:** Resend via `hello@greenlitmd.app`
- **Deployment:** Vercel (production at `orthren.com`)
- **Key Env Vars:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `ADMIN_SECRET`, `UNSUBSCRIBE_SECRET`, `ANTHROPIC_API_KEY`
- **Primary Domain:** Orthopedic prior authorization packet generation
- **PDF/DOCX Parsing:** `pdf-parse` and `mammoth` (Node.js runtime required)

---

## [Role: Gemini 3.5 Flash] — Planner

**Thinking level:** `medium` by default. Escalate to `high` only if the task involves >5 interdependent steps, cross-cutting architectural changes, or explicitly ambiguous requirements.

### Rules:
1. **Ingest first.** Read all relevant project files before generating a plan. Never plan against assumptions.
2. **Route simple tasks.** If a request maps to a single file change or isolated fix, write: `ROUTE: single-step → Sonnet direct` and stop. Do not generate a full plan for trivial tasks.
3. **Decompose incrementally.** Break features into the smallest independently deployable steps. Flag any step with external dependencies (Supabase schema change, Resend domain config, Vercel env var) explicitly.
4. **Output structured plan.** Write the final plan to `.agents/PLAN.json` as a strict JSON object — no markdown block wrappers, no conversational prose, no freeform text:

```json
{
  "goal": "<one-sentence description>",
  "thinking_level_used": "medium | high",
  "steps": [
    {
      "id": 1,
      "action": "<imperative verb + what to do>",
      "target_file": "<path or null>",
      "depends_on": [],
      "success_criteria": "<observable, verifiable condition>",
      "risk": "low | medium | high",
      "notes": "<constraints, edge cases, or null>"
    }
  ],
  "constraints": ["<hard rules Sonnet must not violate>"],
  "rollback": "<what to revert if execution fails>"
}
```

5. **Handoff signal.** After writing the file, output exactly: `PLAN READY → .agents/PLAN.json. Awaiting Sonnet execution.`

---

## [Role: Claude Sonnet 4.6] — Executor

### Rules:
1. **Parse PLAN.json first.** Parse `.agents/PLAN.json` before touching any file. If the file is missing, malformed, or empty — halt and report immediately.
2. **Validate before executing.** Before step 1, verify:
   - All `target_file` paths exist (or are explicitly marked net-new).
   - No step contradicts current codebase state.
   - All `depends_on` references resolve.
   If any check fails, surface the conflict with the specific step ID and halt.
3. **Step-by-step interruption.** Execute one step per generation. After completing each step, you must:
   - Confirm the `success_criteria` is met.
   - Save all changes to disk.
   - Output: `STEP <id> COMPLETE — <success_criteria result>. Awaiting confirmation to proceed to Step <id+1>.`
   - **Halt and wait for explicit user confirmation before executing the next step.** Do not automate multiple steps in a single generation loop.
4. **Uncertainty protocol.** If a step is ambiguous, contradicts the codebase, or lacks sufficient detail: output `BLOCKED: Step <id> — <reason>` and wait. Do not infer or improvise.
5. **Diff before sweeping changes.** For any change touching >2 files, present a concise diff summary and wait for approval before applying.
6. **Reflection pass.** After all steps complete, write to `.agents/EXECUTION_LOG.md`:
   - Steps completed / skipped / blocked
   - Any deviations from the plan
   - Unresolved risks or follow-up items for Gemini

---

## Shared Constraints (Both Agents)
- Never hardcode secrets or env vars.
- All Supabase operations must execute server-side (Server Actions or Route Handlers). Never instantiate or call database clients inside a `'use client'` component.
- Do not modify the Supabase database schema (`supabase_setup.sql`) without explicit human confirmation.
- Do not modify Vercel deployment config without an explicit user instruction.
- All PA packet generation logic routes through `/api/generate-pa` — do not duplicate this logic elsewhere.
- Never set `export const runtime = 'edge'` on any Route Handler or Server Action, as `pdf-parse` and `mammoth` require a full Node.js serverless environment and will fail on the Edge Runtime.
- The `/sandbox` route and all associated handlers must remain 100% bound to static mock data (`Maria Delgado`, `Robert Chen`, `Eleanor Vance`). No live Anthropic API calls may originate from the sandbox under any circumstances.