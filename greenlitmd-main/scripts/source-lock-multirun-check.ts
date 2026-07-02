/**
 * source-lock-multirun-check.ts
 *
 * Runs each fixture chart through the full live pipeline N times (default 10)
 * and checks every generated letter's functional_limitations narrative — plus
 * the imaging_status gate outcome — against its own run's extraction output.
 *
 * scripts/eval-pipeline.ts runs each fixture once per invocation and is
 * sufficient for most prompt changes. This script exists because some SOURCE
 * LOCK violations are intermittent under sampling variance even at
 * temperature=0 (e.g. the model occasionally generalizing a specific
 * functional_limitations entry into a category phrase, or the imaging_status
 * gate picking the wrong CRITICAL rule when two rules both match). A single
 * run won't surface that; ten will usually catch it if the failure rate is
 * anywhere above a few percent. Run this after any change to the SOURCE LOCK
 * / functional limitations / imaging gate language in
 * lib/letter-system-prompt.ts, or to the imaging_status / functional_limitations
 * extraction instructions in lib/pa-pipeline.ts.
 *
 * Resume behavior: each run's output is written to
 * <OUT_DIR>/<fixture-slug>-run<N>.json (+ a matching -letter.txt). On a
 * subsequent invocation with the same OUT_DIR, any run whose output file
 * already exists is skipped rather than re-executed — so an interrupted
 * batch (network error, rate limit, etc.) resumes exactly where it left off
 * without re-spending API calls on runs that already completed. To force a
 * clean run, point SOURCE_LOCK_OUT_DIR at a new/empty subdirectory.
 *
 * Usage:
 *   npx tsx scripts/source-lock-multirun-check.ts
 *   SOURCE_LOCK_RUNS=5 npx tsx scripts/source-lock-multirun-check.ts
 *   SOURCE_LOCK_OUT_DIR=my-check npx tsx scripts/source-lock-multirun-check.ts
 *
 * Requires ANTHROPIC_API_KEY in .env.local (or environment).
 */

import * as fs from "fs";
import * as path from "path";
import mammoth from "mammoth";

// ── Load .env.local before any imports that read process.env ────────────────
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

import { extractChartDataFromText, generateLetterFromExtraction } from "../lib/pa-pipeline";
import type { RequestDetails } from "../lib/pa-pipeline";

const RUNS = Number(process.env.SOURCE_LOCK_RUNS ?? 10);
const CHARTS_DIR = path.join(__dirname, "../lib/sample-charts");
const OUT_DIR = path.join(
  __dirname,
  "../.eval-output/" + (process.env.SOURCE_LOCK_OUT_DIR ?? "source-lock-multirun")
);

interface Fixture {
  slug: string;
  name: string;
  docxPath: string;
  requestDetails: RequestDetails;
}

// The three named regression fixtures (Kim/Webb/Vance) — see
// .claude/skills/prompt-regression-check/SKILL.md and
// .claude/agents/letter-prompt-logic-auditor.md for their known-good baselines.
const FIXTURES: Fixture[] = [
  {
    slug: "kim",
    name: "Kim, Rachel — Rotator Cuff CPT 29827 (CLEAN)",
    docxPath: path.join(CHARTS_DIR, "chart-kim-rachel-rotator-cuff-cpt29827-CLEAN.docx"),
    requestDetails: {
      cptCode: "29827",
      payerName: "Blue Cross Blue Shield",
      providerName: "Dr. Michael Torres",
      practiceName: "Summit Orthopedic Group",
    },
  },
  {
    slug: "webb",
    name: "Webb, Marcus — TKA CPT 27447 (MESSY)",
    docxPath: path.join(CHARTS_DIR, "chart-webb-marcus-tka-cpt27447-MESSY.docx"),
    requestDetails: {
      cptCode: "27447",
      payerName: "Aetna PPO",
      providerName: "Dr. Sandra Reyes",
      practiceName: "Lakeside Orthopedic Surgery Center",
    },
  },
  {
    slug: "vance",
    name: "Vance, Sandra — THA CPT 27130 (INCOMPLETE)",
    docxPath: path.join(CHARTS_DIR, "chart-vance-sandra-tha-cpt27130-INCOMPLETE.docx"),
    requestDetails: {
      cptCode: "27130",
      payerName: "United Healthcare",
      providerName: "Dr. James Holloway",
      practiceName: "Riverside Orthopedic Associates",
    },
  },
];

async function extractDocxText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

// Pull the FUNCTIONAL LIMITATIONS numbered section plus the opening clinical
// paragraph and medical necessity summary, since the prompt says limitation
// language "applies everywhere in the letter."
function extractLetterSections(letter: string) {
  const grab = (startHeader: string, endHeaders: string[]) => {
    const startIdx = letter.indexOf(startHeader);
    if (startIdx === -1) return "";
    let endIdx = letter.length;
    for (const h of endHeaders) {
      const idx = letter.indexOf(h, startIdx + startHeader.length);
      if (idx !== -1 && idx < endIdx) endIdx = idx;
    }
    return letter.slice(startIdx, endIdx).trim();
  };
  return {
    clinicalHistory: grab("CLINICAL HISTORY AND PRESENTING COMPLAINT", ["DIAGNOSIS"]),
    functionalLimitationsSection: grab("FUNCTIONAL LIMITATIONS", ["CONSERVATIVE TREATMENT HISTORY"]),
    medicalNecessitySummary: grab("MEDICAL NECESSITY SUMMARY", []),
  };
}

// Simple limitation-claim scanner mirroring scripts/eval-pipeline.ts's
// pattern set, restricted to functional_limitations grounding only.
function findUngroundedLimitationClaims(text: string, allowedLimitations: string[]): string[] {
  const allowed = allowedLimitations.map((l) => l.toLowerCase());
  const patterns = [
    /unable to ([a-z][a-z\s]{3,60})/gi,
    /difficulty (?:with )?([a-z][a-z\s]{3,60})/gi,
    /limited (?:ability|capacity) to ([a-z][a-z\s]{3,60})/gi,
    /cannot ([a-z][a-z\s]{3,60})/gi,
    /requires? (?:assistance|help) (?:with|from) ([a-z][a-z\s]{3,60})/gi,
    /relies? on ([a-z][a-z\s]{3,60})/gi,
  ];
  const sents = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const flagged: string[] = [];
  for (const sent of sents) {
    // Prompt mandates a generic ADL capstone sentence in the closing summary
    // (letter-system-prompt.ts body item 5) — not an unsourced limitation claim.
    if (/activities of daily living/i.test(sent)) continue;
    for (const pat of patterns) {
      pat.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.exec(sent)) !== null) {
        const claim = m[1].trim().toLowerCase().replace(/[.,;].*$/, "");
        const claimWords = new Set(claim.split(/\s+/).filter((w) => w.length > 3));
        const matched = allowed.some((a) => {
          if (a.includes(claim.slice(0, 15)) || claim.includes(a.slice(0, 15))) return true;
          const aWords = new Set(a.split(/\s+/).filter((w) => w.length > 3));
          let overlap = 0;
          Array.from(claimWords).forEach((w) => { if (aWords.has(w)) overlap++; });
          return overlap >= 2;
        });
        if (!matched) {
          flagged.push(`"${m[0].trim()}"  (sentence: ${sent})`);
        }
      }
    }
  }
  return Array.from(new Set(flagged));
}

interface RunRecord {
  run: number;
  functional_limitations: string[];
  denial_risk_flags: unknown;
  imaging_status: string | undefined;
  letterRefused: boolean;
  chart_data_snapshot: {
    primary_complaint: string | null;
    objective_measurements: string[];
    conservative_treatments_attempted: unknown;
    surgical_approach_if_mentioned: string | null;
  };
  letterSections: ReturnType<typeof extractLetterSections>;
  flaggedLimitations: string[];
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const summary: Array<{
    fixture: string;
    run: number;
    flaggedCount: number;
    flaggedLimitations: string[];
    imaging_status?: string;
    letterRefused?: boolean;
  }> = [];

  for (const fixture of FIXTURES) {
    console.log(`\n=== ${fixture.name} — ${RUNS} runs ===`);
    const chartText = await extractDocxText(fixture.docxPath);

    for (let run = 1; run <= RUNS; run++) {
      const existingPath = path.join(OUT_DIR, `${fixture.slug}-run${run}.json`);
      if (fs.existsSync(existingPath)) {
        const cached = JSON.parse(fs.readFileSync(existingPath, "utf-8")) as RunRecord;
        console.log(`  run ${run}/${RUNS}: already have output, skipping (flagged=${cached.flaggedLimitations.length})`);
        summary.push({
          fixture: fixture.slug,
          run,
          flaggedCount: cached.flaggedLimitations.length,
          flaggedLimitations: cached.flaggedLimitations,
          imaging_status: cached.imaging_status,
          letterRefused: cached.letterRefused,
        });
        continue;
      }

      process.stdout.write(`  run ${run}/${RUNS}: extracting... `);
      const { _phiMap, ...extracted } = await extractChartDataFromText(chartText, fixture.requestDetails);
      process.stdout.write("generating letter... ");
      const letter = await generateLetterFromExtraction(extracted as any, fixture.requestDetails, _phiMap);

      const sections = extractLetterSections(letter);
      const combinedLimitationText = [
        sections.clinicalHistory,
        sections.functionalLimitationsSection,
        sections.medicalNecessitySummary,
      ].join("\n");

      const flaggedLimitations = findUngroundedLimitationClaims(
        combinedLimitationText,
        extracted.functional_limitations ?? []
      );

      const runRecord: RunRecord = {
        run,
        functional_limitations: extracted.functional_limitations,
        denial_risk_flags: extracted.denial_risk_flags,
        imaging_status: (extracted as any).imaging_status,
        letterRefused: letter.includes("Cannot generate authorization letter:"),
        chart_data_snapshot: {
          primary_complaint: extracted.primary_complaint,
          objective_measurements: extracted.objective_measurements,
          conservative_treatments_attempted: extracted.conservative_treatments_attempted,
          surgical_approach_if_mentioned: extracted.surgical_approach_if_mentioned,
        },
        letterSections: sections,
        flaggedLimitations,
      };

      fs.writeFileSync(existingPath, JSON.stringify(runRecord, null, 2), "utf-8");
      fs.writeFileSync(path.join(OUT_DIR, `${fixture.slug}-run${run}-letter.txt`), letter, "utf-8");

      const statusTag = `[imaging_status=${runRecord.imaging_status}${runRecord.letterRefused ? ", REFUSED" : ""}]`;
      console.log(`${statusTag} ` + (flaggedLimitations.length > 0 ? `FLAGGED (${flaggedLimitations.length})` : "clean"));
      if (flaggedLimitations.length > 0) {
        for (const f of flaggedLimitations) console.log(`      -> ${f}`);
      }

      summary.push({
        fixture: fixture.slug,
        run,
        flaggedCount: flaggedLimitations.length,
        flaggedLimitations,
        imaging_status: runRecord.imaging_status,
        letterRefused: runRecord.letterRefused,
      });
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "_summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log("\n=== SUMMARY ===");
  for (const s of summary) {
    console.log(`${s.fixture} run ${s.run}: ${s.flaggedCount} flagged, imaging_status=${s.imaging_status}${s.letterRefused ? " REFUSED" : ""}`);
  }

  const anyFlagged = summary.some((s) => s.flaggedCount > 0);
  console.log("\n" + (anyFlagged ? "RESULT: FLAGGED — review flagged runs above" : "RESULT: CLEAN — no ungrounded limitations across all runs"));
  process.exit(anyFlagged ? 1 : 0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
