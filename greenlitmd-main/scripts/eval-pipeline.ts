/**
 * eval-pipeline.ts
 *
 * Runs the live two-call Anthropic PA pipeline against the three fixture DOCX
 * charts and evaluates SOURCE LOCK compliance on each generated letter.
 *
 * Usage:
 *   npx tsx scripts/eval-pipeline.ts
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

// ── Imports from lib/pa-pipeline (same modules used by /api/generate-pa) ────
// Using the shared lib directly avoids needing a running Next.js server and
// ensures prompts, normalization, and PHI handling stay in sync with the route.
import { extractChartDataFromText, generateLetterFromExtraction } from "../lib/pa-pipeline";
import type { RequestDetails } from "../lib/pa-pipeline";
import type { ExtractedChartData } from "../lib/types";

interface FixtureChart {
  name: string;
  docxPath: string;
  requestDetails: RequestDetails;
  expectedHardBlockLabels?: string[];
}

interface EvalResult {
  chartName: string;
  sourceLockPass: boolean;
  sourceLockViolations: SourceLockViolation[];
  extractionWarnings: string[];
  hardBlocks: string[];
  expectedHardBlocks: string[];
  unexpectedHardBlocks: string[];
  overallPass: boolean;
}

// ── Fixture chart definitions ────────────────────────────────────────────────

const CHARTS_DIR = path.join(__dirname, "../lib/sample-charts");

const FIXTURES: FixtureChart[] = [
  {
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
    name: "Vance, Sandra — THA CPT 27130 (INCOMPLETE)",
    docxPath: path.join(CHARTS_DIR, "chart-vance-sandra-tha-cpt27130-INCOMPLETE.docx"),
    requestDetails: {
      cptCode: "27130",
      payerName: "United Healthcare",
      providerName: "Dr. James Holloway",
      practiceName: "Riverside Orthopedic Associates",
    },
    expectedHardBlockLabels: ["Imaging Findings"],
  },
];

async function extractDocxText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  if (text.length < 50) throw new Error(`DOCX produced insufficient text (${text.length} chars)`);
  return text;
}


// ── SOURCE LOCK Evaluator ────────────────────────────────────────────────────
// Checks generated letter sentences against the extraction JSON for fabricated
// clinical content. Mirrors the 5 violation categories defined in SOURCE LOCK.

interface SourceLockViolation {
  sentence: string;
  reason: string;
}

const IMPLANT_KEYWORDS = [
  "cemented", "cementless", "press-fit", "tibial component", "femoral component",
  "polyethylene", "bearing surface", "cruciate-retaining", "posterior-stabilized",
  "stemmed", "revision component", "augment", "trabecular metal", "modular",
  "titanium stem", "cobalt chrome", "zirconia", "ceramic head",
  "cortical screw", "interference screw", "suture anchor", "knotless anchor",
  "bioabsorbable anchor", "metallic anchor",
];

const INJECTION_TECHNIQUE_KEYWORDS = [
  "ultrasound-guided", "fluoroscopy-guided", "image-guided", "ct-guided",
  "ultrasound guided", "fluoroscopy guided",
];

const FUTURE_CARE_KEYWORDS = [
  "will follow up", "will refer", "will consider", "plans to", "will initiate",
  "additional therapy", "pending referral",
  "will order", "will repeat", "will schedule",
];

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

function evaluateSourceLock(
  letter: string,
  extracted: ExtractedChartData & { validation: any }
): SourceLockViolation[] {
  // Hard-block letters (e.g. missing imaging gate) are not clinical letters —
  // skip SOURCE LOCK evaluation so they don't generate false violations.
  if (letter.includes("Cannot generate authorization letter:")) return [];

  const violations: SourceLockViolation[] = [];
  const letterLower = letter.toLowerCase();
  const sents = sentences(letter);

  const allowedLimitations = new Set(
    (extracted.functional_limitations ?? []).map((l: string) => l.toLowerCase())
  );
  const allowedTreatments = new Set(
    (extracted.conservative_treatments_attempted ?? []).map((t: any) =>
      (t.treatment ?? t.treatment_name ?? "").toLowerCase()
    )
  );
  const surgicalApproach = (extracted.surgical_approach_if_mentioned ?? "").toLowerCase();

  // 1. Implant / fixation details not in surgical_approach
  for (const kw of IMPLANT_KEYWORDS) {
    if (letterLower.includes(kw) && !surgicalApproach.includes(kw)) {
      const offending = sents.find((s) => s.toLowerCase().includes(kw));
      violations.push({
        sentence: offending ?? `(contains: "${kw}")`,
        reason: `Implant/fixation detail "${kw}" not present in surgical_approach_if_mentioned`,
      });
    }
  }

  // 2. Injection guidance technique not in source
  for (const kw of INJECTION_TECHNIQUE_KEYWORDS) {
    if (letterLower.includes(kw)) {
      const treatmentText = allowedTreatments.toString();
      if (!treatmentText.includes(kw)) {
        const offending = sents.find((s) => s.toLowerCase().includes(kw));
        violations.push({
          sentence: offending ?? `(contains: "${kw}")`,
          reason: `Injection technique "${kw}" not documented in conservative_treatments_attempted`,
        });
      }
    }
  }

  // 3. Future care / planned interventions not in source
  for (const kw of FUTURE_CARE_KEYWORDS) {
    if (letterLower.includes(kw)) {
      const offending = sents.find((s) => s.toLowerCase().includes(kw));
      violations.push({
        sentence: offending ?? `(contains: "${kw}")`,
        reason: `Forward-looking language "${kw}" speculates about future care not in source`,
      });
    }
  }

  // 4. Functional limitations not in extraction array
  // Look for limitation-pattern sentences and check if any word cluster matches allowed set
  const limitationPatterns = [
    /unable to (\w[\w\s]{3,40})/gi,
    /difficulty (\w[\w\s]{3,40})/gi,
    /limited (?:ability|capacity) to (\w[\w\s]{3,40})/gi,
    /cannot (\w[\w\s]{3,40})/gi,
  ];

  if (allowedLimitations.size > 0) {
    for (const sent of sents) {
      // The letter system prompt instructs a closing "activities of daily living"
      // statement as a template phrase — not an unsourced clinical claim.
      if (/activities of daily living/i.test(sent)) continue;
      for (const pat of limitationPatterns) {
        pat.lastIndex = 0;
        const m = pat.exec(sent);
        if (!m) continue;
        const claim = m[1].trim().toLowerCase();
        // Strip leading action verbs/prefixes so "navigate stairs" matches "use stairs"
        const VERB_PREFIX = /^(to |use |walk |navigate |perform |climb |do |participate |engage |maintain |achieve |complete |carry |lift |stand |sit |bend |reach |grip |ambulate |ascend |descend |with |basic |mobility |tasks |such as )+/;
        const normalize = (s: string) => s.replace(VERB_PREFIX, "").trim();
        const claimNorm = normalize(claim);
        // Semantic synonyms — map variant words to a canonical form before comparing
        const SYNONYMS: Record<string, string> = {
          entering: "getting", enter: "getting", exiting: "getting", exit: "getting",
          navigating: "using", navigate: "using",
          ascending: "climbing", descending: "climbing",
          ambulating: "walking", ambulate: "walking",
          prolonged: "extended", sustained: "extended",
        };
        const canonicalize = (s: string) =>
          s.split(/\s+/).map((w) => SYNONYMS[w] ?? w).join(" ");
        const claimCanon = canonicalize(claimNorm);
        // Content words — ignore short filler
        const keywords = (s: string) => s.split(/\s+/).filter((w) => w.length > 3);
        const claimWords = new Set(keywords(claimCanon));
        const matched = Array.from(allowedLimitations).some((allowed) => {
          const allowedNorm = canonicalize(normalize(allowed.replace(/^(cannot|unable to|difficulty|limited ability to)\s*/i, "")));
          if (allowedNorm.includes(claimCanon.slice(0, 12)) || claimCanon.includes(allowedNorm.slice(0, 12))) return true;
          // Keyword overlap: if ≥2 content words match, treat as same limitation
          const allowedWords = keywords(allowedNorm);
          const overlap = allowedWords.filter((w) => claimWords.has(w)).length;
          return overlap >= 2 || (overlap >= 1 && allowedWords.length <= 3);
        });
        if (!matched) {
          violations.push({
            sentence: sent,
            reason: `Functional limitation "${m[0].trim()}" not found in functional_limitations array`,
          });
        }
      }
    }
  }

  // 5. Imaging references when imaging is null/pending
  const imagingFindings = extracted.imaging_findings;
  if (!imagingFindings) {
    const imagingKws = ["mri", "magnetic resonance", "ct scan", "computed tomography"];
    for (const kw of imagingKws) {
      if (letterLower.includes(kw)) {
        const offending = sents.find((s) => s.toLowerCase().includes(kw));
        violations.push({
          sentence: offending ?? `(contains: "${kw}")`,
          reason: `Letter references ${kw.toUpperCase()} but imaging_findings is null — no completed imaging in source`,
        });
      }
    }
  }

  // Deduplicate by sentence
  const seen = new Set<string>();
  return violations.filter((v) => {
    const key = v.sentence.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Report printer ───────────────────────────────────────────────────────────

function printReport(results: EvalResult[]) {
  const sep = "─".repeat(72);
  console.log("\n" + "═".repeat(72));
  console.log("  EVAL-PIPELINE — SOURCE LOCK EVALUATION REPORT");
  console.log("  " + new Date().toISOString());
  console.log("═".repeat(72));

  let allPass = true;

  for (const r of results) {
    console.log("\n" + sep);
    console.log(`CHART: ${r.chartName}`);
    console.log(sep);

    const slStatus = r.sourceLockPass ? "✓ PASS" : "✗ FAIL";
    console.log(`SOURCE LOCK:        ${slStatus}`);

    if (r.sourceLockViolations.length > 0) {
      console.log("\nViolations:");
      for (const v of r.sourceLockViolations) {
        console.log(`  [VIOLATION] ${v.reason}`);
        console.log(`    → "${v.sentence.slice(0, 120)}${v.sentence.length > 120 ? "…" : ""}"`);
      }
    }

    if (r.expectedHardBlocks.length > 0) {
      console.log("\nHard blocks (expected for this fixture):");
      for (const b of r.expectedHardBlocks) console.log(`  [EXPECTED] ${b}`);
    }
    if (r.unexpectedHardBlocks.length > 0) {
      console.log("\nHard blocks (unexpected — failure):");
      for (const b of r.unexpectedHardBlocks) console.log(`  [HARD BLOCK] ${b}`);
    }

    if (r.extractionWarnings.length > 0) {
      console.log("\nExtraction warnings:");
      for (const w of r.extractionWarnings) console.log(`  [WARNING] ${w}`);
    }

    const overall = r.overallPass ? "✓ PASS" : "✗ FAIL";
    console.log(`\nOVERALL:            ${overall}`);

    if (!r.overallPass) allPass = false;
  }

  console.log("\n" + "═".repeat(72));
  if (allPass) {
    console.log("REGRESSION CHECK: ALL PASS");
  } else {
    console.log("REGRESSION CHECK: FAILED — do not merge until resolved");
  }
  console.log("═".repeat(72) + "\n");
}

// ── Raw output writer ────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, "../.eval-output");

function writeRawOutput(slug: string, extracted: Record<string, unknown>, letter: string) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, `${slug}-extraction.json`),
    JSON.stringify(extracted, null, 2),
    "utf-8"
  );
  fs.writeFileSync(path.join(OUT_DIR, `${slug}-letter.txt`), letter, "utf-8");
  console.log(`  Raw output → .eval-output/${slug}-extraction.json + ${slug}-letter.txt`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
// NOTE: This script calls the same lib modules used by /api/generate-pa
// (callAnthropicWithRetry, letterSystemPrompt, deidentify, etc.) directly,
// which is equivalent to POSTing to the route and avoids needing a running
// server. Any change to the route's prompt or logic must be mirrored here.

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }

  const results: EvalResult[] = [];

  for (const fixture of FIXTURES) {
    console.log(`\nProcessing: ${fixture.name} …`);

    if (!fs.existsSync(fixture.docxPath)) {
      console.error(`  ERROR: fixture not found at ${fixture.docxPath}`);
      console.error(`  Run: npx tsx scripts/create-fixture-charts.ts`);
      results.push({
        chartName: fixture.name,
        sourceLockPass: false,
        sourceLockViolations: [{ sentence: "", reason: "Fixture DOCX file not found" }],
        extractionWarnings: [],
        hardBlocks: ["Fixture file missing"],
        expectedHardBlocks: [],
        unexpectedHardBlocks: ["Fixture file missing"],
        overallPass: false,
      });
      continue;
    }

    try {
      // Step 1: Extract DOCX text
      console.log("  [1/3] Extracting text from DOCX …");
      const chartText = await extractDocxText(fixture.docxPath);

      // Step 2a: Run extraction call (via lib/pa-pipeline — same code as /api/generate-pa)
      console.log("  [2/3] Running extraction (call 1 of 2) …");
      const { _phiMap, ...extractedBase } = await extractChartDataFromText(chartText, fixture.requestDetails);
      const extracted = extractedBase as typeof extractedBase & { extraction_warnings?: string[] };

      // Step 2b: Run letter generation call
      console.log("  [3/3] Generating letter (call 2 of 2) …");
      const letter = await generateLetterFromExtraction(extracted, fixture.requestDetails, _phiMap);

      // Write raw extraction JSON + letter for inspection
      const slug = fixture.name.split("—")[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      writeRawOutput(slug, extracted as Record<string, unknown>, letter);

      // Step 3: SOURCE LOCK evaluation
      const violations = evaluateSourceLock(letter, extracted);

      const hardBlockLabels = (extracted.validation?.hard_blocks ?? []).map(
        (b: any) => `${b.label}: ${b.message}`
      );

      const extractionWarnings = extracted.extraction_warnings ?? [];

      const sourceLockPass = violations.length === 0;
      const expectedHardBlocks = hardBlockLabels.filter((b: string) =>
        (fixture.expectedHardBlockLabels ?? []).some((label) => b.startsWith(label))
      );
      const unexpectedHardBlocks = hardBlockLabels.filter((b: string) =>
        !(fixture.expectedHardBlockLabels ?? []).some((label) => b.startsWith(label))
      );
      // Overall pass: SOURCE LOCK must pass AND no unexpected hard blocks
      const overallPass = sourceLockPass && unexpectedHardBlocks.length === 0;

      results.push({
        chartName: fixture.name,
        sourceLockPass,
        sourceLockViolations: violations,
        extractionWarnings,
        hardBlocks: hardBlockLabels,
        expectedHardBlocks,
        unexpectedHardBlocks,
        overallPass,
      });

      console.log(`  Done. SOURCE LOCK: ${sourceLockPass ? "PASS" : "FAIL"}, unexpected hard blocks: ${unexpectedHardBlocks.length}`);
    } catch (err) {
      console.error(`  FATAL ERROR processing ${fixture.name}:`, err);
      results.push({
        chartName: fixture.name,
        sourceLockPass: false,
        sourceLockViolations: [{ sentence: "", reason: String(err) }],
        extractionWarnings: [],
        hardBlocks: ["Pipeline error"],
        expectedHardBlocks: [],
        unexpectedHardBlocks: ["Pipeline error"],
        overallPass: false,
      });
    }
  }

  printReport(results);

  const anyFail = results.some((r) => !r.overallPass);
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
