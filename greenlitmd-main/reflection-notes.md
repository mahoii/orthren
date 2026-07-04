# Reflection Notes — Claude Code Setup Review

**Date:** 2026-07-04
**Method:** 5 subagents mined all 125 session transcripts for this project (June 11 – July 4, 2026, `~/.claude/projects/C--projects-health2-greenlitmd-main/`); clusters and verdicts assigned by weighing recurrence against build cost. Diagnosis only — nothing below has been built or changed.

**Verdict key:** FIX = edit existing config/docs · SKILL = new or updated skill/rules asset · AUTOMATION = hook/script · NOTHING = observed, not worth building for.

---

## Ranked candidates (most leverage first)

### 1. Rewrite AGENTS.md — it injects a dead two-agent protocol into every session · **FIX**

`@AGENTS.md` in CLAUDE.md loads 77 lines of directives written for a *different* orchestration setup ("[Role: Gemini 3.5 Flash] — Planner" writing `.agents/PLAN.json`; "[Role: Claude Sonnet 4.6] — Executor" required to *halt and wait for explicit user confirmation before executing the next step*). No current session runs that protocol, but the text costs context every session and its rules still bind at the worst moments.

**Evidence:**
- Protocol artifacts (`PLAN.json` refs / "Awaiting confirmation" outputs) in 5 sessions: `21e551eb`, `424d952d`, `a05abb65`, `33c6837c`, `47f5e9d6` (as recent as Jul 2–3). `.agents/` dir last touched Jun 20 — the workflow is dead.
- Session `e12bef96` (Jul 3): user opened with "NOTE TO SELF BEFORE RUNNING: AGENTS.md prohibits modifying supabase_setup.sql without your explicit confirmation" — pre-planning around their own config. Claude asked the mandated confirmation question; it sat 6.5 min, was rejected, and the session was abandoned with **zero edits**. The same gate was re-asked and re-answered next morning (`6423b3ee`).
- The "Shared Constraints" section at the bottom is the only part that still earns its keep, and most of it duplicates CLAUDE.md.

**Action:** delete the Planner/Executor role sections; keep (or fold into CLAUDE.md) only the Shared Constraints, and decide deliberately whether the supabase_setup.sql confirmation gate should stay. ~15 min.

---

### 2. Purge stale references: deleted `prompt-evaluator` agent + self-contradicting fixture rules · **FIX**

`prompt-evaluator.md` was created Jun 18 (`47d5c35`) and deleted Jun 25 (`0900a23`, replaced by `letter-prompt-logic-auditor`), but the docs still route work to it — and one rules file contradicts itself about which fixtures to use.

**Evidence:**
- `@agent-prompt-evaluator` invoked 17× across 5 sessions (`5040906a`, `69ab4cf4`, `974cae83`, `22f5a945`, `9f82ea5d`) — including after deletion (`9f82ea5d`, Jun 26).
- `.claude/CLAUDE.md:39` still says "use the `/prompt-regression-check` skill or the `prompt-evaluator` subagent."
- `.claude/rules/prompt-engineering.md:28` says to check against "(Delgado, Chen, Vance)" and delegate to `prompt-evaluator` — while **line 42 of the same file** correctly says Kim/Webb/Vance and warns that demo-data must never be used for evaluation. The old agent actually did evaluate statically against `lib/demo-data.ts` (`5040906a`, Jun 19) — the exact anti-pattern now forbidden; session `22f5a945` burned 9 evaluator loops (94 min) before Claude flagged the loop itself as structurally broken.

**Action:** remove the prompt-evaluator references; delete or rewrite line 28 of prompt-engineering.md. ~10 min.

---

### 3. Batch-campaign state: make STATUS-ROADMAP.md updates part of closing every task · **FIX (convention), not a skill**

The dominant work pattern is externally drafted briefs (40+ across all batches: `TASK:`/`CONTEXT:`/`DO NOT TOUCH:` scaffolding, mid-word paste truncations proving external drafting). The briefs assume persistent state Claude doesn't have, and the user hand-carries dependency state between sessions — both failure modes fired repeatedly.

**Evidence:**
- `cc294341` (Jul 3): brief referenced "your roadmap," "Batch 8," "finding 2.4," a "Karen/OSC walk-in" — none existed in repo or memory; Claude refused to fabricate status and the session dead-ended. The real roadmap lived in `c:\Users\kamar\Downloads\orthren-roadmap.md`, outside the repo.
- `2b47627a` (Jul 1): a full brief re-issued for work already implemented and committed — 42-second no-op session.
- Manual scope fences ("Run after Batch 3 (depends on the supplement-merge from 1.5)", "Do NOT add runtime verification here — that's Batch 3") caused 4 of 9 AskUserQuestion scope-conflict escalations in the Jul 3 campaign; brief `b39b411e` was internally contradictory (read-only vs. extend-and-run) and its session was abandoned, redesigned, and re-run as `01505458`.
- The user already started the fix: `docs/STATUS-ROADMAP.md` created Jul 3 ("repo is now source of truth", commit `393032a`).

**Action:** add one CLAUDE.md convention line: *"After completing any numbered finding/batch, update docs/STATUS-ROADMAP.md in the same session (status, date, commit)."* Claude Code's memory directory can carry the softer context (what "Batch 8" means, who Karen is). This removes the need for the external planner to guess at repo state. ~15 min.

---

### 4. Harden the eval-pipeline loop knowledge into `prompt-regression-check` · **SKILL (update existing)**

The eval loop is the project's core engineering ritual and its most expensive one: `eval-pipeline` appears in ~23 sessions; single sessions ran it 8× (`da5c8ac0`) and 10×-per-fixture (`4e37077d`, `01505458`); each full run is 6+ live Anthropic calls (~$3–5 for big runs). The hard-won cost-control knowledge currently lives only in old transcripts.

**Evidence:**
- Tiered/cheap-run knobs (`SOURCE_LOCK_TIERED`, `SOURCE_LOCK_ONLY_FIXTURES`, `SOURCE_LOCK_REUSE_BASELINE`, `SOURCE_LOCK_GEN_RUNS=2`) were invented mid-session (`01505458`, `33c6837c`) and are documented nowhere.
- Skill baseline drift caught twice by runs: stale DOB note (`04955692`), loose "acetaminophen + rest only" baseline (`fef8cf18` L291) — the skill's baseline section goes stale silently.
- Stale `.eval-output/` caused a false regression requiring manual deletion (`04955692`).
- Waiting on long paid runs strained the harness: 16× ScheduleWakeup polling (`503dc186`), a blocked `sleep`, and a ScheduleWakeup validation error (`01505458`).

**Action:** update `.claude/skills/prompt-regression-check/SKILL.md` with (a) the env-var knob recipe incl. "cheap re-check" mode, (b) a "clean `.eval-output/` first" step using `node -e "fs.rmSync(...)"` (see #6), (c) a note to verify baseline claims against the fixture files, not the skill's prose. ~30 min.

---

### 5. Auth/magic-link landmines → new path-scoped rules file · **SKILL (rules asset — the one genuinely recurring "new" candidate)**

The magic-link/auth flow consumed ~10 sessions over two weeks, and each session re-derived overlapping landmine knowledge. `app/auth/confirm/page.tsx` is open in the IDE right now — this is not a closed topic.

**Evidence:** `45f701e3`, `7d2a4b67`, `93ee9c3a`, `5b1f15a3` (Jun 18–23: token_hash never handled, `verifyOtp`, SMTP config, prefetch diagnosis); `39128d07`, `a8ee916d`, `54dace7c`, `b29e04c8` (Jun 25: "invalid or expired… i always have to request another immediately afterwards", cookie-set-on-wrong-response bug, sign-out flow); `881a9e55`, `942ee3e0`, `ff0b6ab9` (Jun 26–29: email-scanner prefetch consuming `/api/auth/callback` tokens, redirect-to-/builder conflicts, route auth guards). Plus 3 user corrections in one session (`39128d07`: "are you sure because even when im logged in…").

**Action:** create `.claude/rules/auth-flow.md` scoped to `app/auth/**`, `app/api/auth/**`, `app/login/**`, capturing: email-scanner prefetch consumes magic-link tokens (never verify on GET prefetch); `token_hash` + `verifyOtp` handling; set cookies only on the final redirect response; `NEXT_PUBLIC_SITE_URL` + Supabase URL-configuration dependencies; where the auth gate for sandbox/builder buttons lives. ~30 min, pays back on the next auth session. (A scripted auth smoke test was considered and rejected: email round-trips make automation cost exceed recurrence value.)

---

### 6. Kill the `rm -rf` denial→workaround loop · **FIX**

`Bash(rm -rf *)` is deny-listed (correctly), but Claude proposed it ≥7 times, got denied, then improvised: PowerShell `Remove-Item` inside Git Bash (exit 127), `node -e "fs.rmSync(...)"`, `grep -v` output filtering, or asking the user to right-click-delete.

**Evidence:** `8daa959c` (Jun 23), `04955692` ("deleted. rerun regression check now"), `843ddc65`, `94d005b1` (Jun 26–29), `4e37077d` ×2, `c5bb18dc` (Jul 1). Target is almost always `.eval-output/` or scratch dirs.

**Action:** add a CLAUDE.md gotcha line — *"`rm -rf` is deny-listed; delete directories with `node -e "fs.rmSync('<dir>',{recursive:true,force:true})"`"* — and/or a tiny `scripts/clean-eval-output.mjs` (runnable under the existing `Bash(npx tsx *)` allow rule). ~5 min.

---

### 7. Windows environment notes in CLAUDE.md · **FIX**

A steady drip of environment paper cuts, each small, collectively dozens of wasted tool calls:

**Evidence:** `python` not found — Windows Store alias, exit 49 (`613c84fa`, `d6ef7175`, `e77583b5`); PowerShell cmdlets/syntax fed to Git Bash (`01a6f29b` ×2, `162b04f0`, `8daa959c` `Remove-Item`, `69250f10` `Get-Content`); backslash path mangling in bash (`4a6852b5` ×4, `c5bb18dc` `Cannot find module 'C:UserskamarAppData…'`); scratchpad scripts failing to resolve project `node_modules` (`fe216377` dotenv, `14853971` mammoth) and tsx ESM URL-scheme errors (`34696af3` ×2); trailing-backslash quote errors (`49e0ea10`, `682d2f0a`, `cc294341`, `4e37077d`).

**Action:** a 6-line "Windows environment" block in CLAUDE.md: use `node -e` not python; run project-dependent scripts from repo root (or cd first) so imports resolve; forward slashes in bash; no PowerShell cmdlets in the Bash tool; no trailing backslash before a closing quote. ~10 min.

---

### 8. Vercel triage: pin the project in CLAUDE.md so MCP beats pasting · **FIX**

Deploy/runtime logs were hand-pasted in ≥6 sessions while the Vercel MCP server sat enabled. The one time Claude reached for MCP, it started at `list_teams` (slow discovery), and the user rejected it mid-call in favor of pasting.

**Evidence:** pasted logs in `5f5e0fa1`, `45f701e3`, `3ac1b1f2`, `419360a4`, `d3cd998b`; rejection-in-favor-of-paste in `e77583b5`; plus one 15.9K-char local terminal dump (`b29e04c8`).

**Action:** add to CLAUDE.md: the Vercel team + project name/ID and one line — *"For deploy failures, call `get_deployment_build_logs` / `get_runtime_errors` on project <id> directly; don't enumerate teams/projects."* ~5 min. A dedicated skill is not warranted; the pasting works fine when the user is faster than discovery.

---

### 9. "Which tool when" table + agent-frontmatter fragility · **FIX**

The verification stack (3 agents + 2 skills) works well when invoked — every audit loop in the Jul 3 campaign acted on findings — but discovery has failed in both directions.

**Evidence:** user asked outright "what would i use: docx export agent, letter prompt agent, or prompt regression skill" (`04955692`); phi-reviewer went unused during the 6-session de-identification arc Jun 29–30 (user pasted a Gemini audit instead) despite being purpose-built for it; agent YAML broke discovery twice (`49e0ea10` unquoted `Re:` colon in description — "i restarted and it still didnt pick it up"; `612c8e3f` `tools: Read` → `[Read]`).

**Action:** 4-line routing table in CLAUDE.md (change to letter prompt → letter-prompt-logic-auditor; change to /api/export → docx-export-verifier; diff touching chart data/PHI → phi-reviewer; prompt changes pre-merge → /prompt-regression-check). Quote all YAML description strings. ~10 min.

---

### 10. Interaction preferences worth remembering (memory, not config) · **NOTHING to build**

- **AskUserQuestion is a poor fit mid-brief:** 3 of 9 AskUserQuestion calls in the Jul 3 campaign were rejected; the user's pattern is to revise the brief rather than pick an option (`b39b411e` ×2, `e12bef96`; also `32791269`). State blockers as plain text and let them re-issue.
- **Model laddering is deliberate:** 32 `/model` switches in 24 sessions — haiku for Q&A, sonnet for execution, opus/fable for big audits. The only waste is the haiku→sonnet bounce minutes apart when haiku falls short of a real task (`419360a4`, `39128d07`, `da5c8ac0`, `682d2f0a`); starting execution tasks at sonnet avoids the failed first pass.
- **Cross-AI verification is the user's chosen process** (7+ claude.ai-chat pastes, Gemini audits) — the STATUS-ROADMAP.md convention (#3) fixes its main failure mode; nothing else to build.

---

## Already resolved / observations only

- **`npm run typecheck` missing script — fixed Jul 3** (commit `d585dde`), after failing in **~29 sessions over 14 days** (5 sessions Jun 19–23, 9 Jun 23–25, 12 Jun 26–30, 1 Jul 1, 3 on Jul 3 itself). Meta-lesson: a CLAUDE.md-documented command that errors every session went unfixed for two weeks — worth a habit of "if a documented command fails, fix the doc or the script in that session." This retro is the mechanism that caught it.
- **The prompt-rule persistence trap (Jun 23):** 3 sessions of prompt re-tweaking (`45ab53cb`, `68e6120f`, `52adaf73`) before `5433b700` found the real cause — `/api/regenerate-letter` bypassed the rules/post-processing path. Pattern to remember: when a prompt rule "doesn't take," check for divergent code paths before strengthening the prompt. (The Jul 3 consolidation of the three post-processing stacks, `503dc186`, structurally fixed this class.)
- **"AI service temporarily unavailable"** hid three different root causes across 3 sessions (`9fab2507` Anthropic overload, `419360a4` max_tokens JSON truncation, `e77583b5` control-char JSON.parse). App-level improvement (distinct error codes/logging), not a setup change — noted for the product backlog.
- **Platform-level losses, no local fix:** 3h05m usage-limit stall mid-batch (`5dca8022`), ~55 min billing outage spawning 4 junk sessions (`4e37077d`, `50ea3352`, `32791269`, `df91036d`, `1f1890d7`), 2 Claude Code process exits killing background agents (`94d005b1`, `5af033e1`), compaction dropping fetched PDFs and forcing a re-ask in the 4.5MB session (`fef8cf18`).
- **Frontier-access deadline:** the Jul 3 audit (`47f5e9d6`) was explicitly framed as one-time — "I will not have frontier-model access to this repo again after July 7." Items #1–#3 above are the ones that most protect post-July-7 sessions on smaller models: less context pollution, no stale routing, repo-canonical state.
