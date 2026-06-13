/**
 * generate-sample-fix-cache.ts
 *
 * Regenerates /lib/sample-fix-cache.json by calling the Claude API once per
 * sample-chart × factor combination and writing the results to disk.
 *
 * Run after prompt changes:
 *   npx tsx scripts/generate-sample-fix-cache.ts
 *
 * Prerequisites:
 *   ANTHROPIC_API_KEY must be set in the environment (or .env.local).
 *   Install tsx if needed:  npm i -D tsx
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Inline the factor labels so this script has no Next.js / app-router deps.
// These MUST match the `label` values in paStrengthFactors in review/page.tsx.
// ---------------------------------------------------------------------------
const FACTOR_LABELS = [
  "Diagnosis Codes",
  "Conservative Treatments Named",
  "Conservative Treatment Duration",
  "Imaging Findings",
  "Functional Limitations",
  "Surgical Approach",
  "CPT Code Valid",
  "Symptom Duration",
] as const;

type FactorLabel = (typeof FACTOR_LABELS)[number];

// ---------------------------------------------------------------------------
// Inline sample chart extracted data (avoids transpiling @/ path aliases)
// ---------------------------------------------------------------------------
// We read the existing JSON from disk rather than importing TS modules, so
// we can run this script without a bundler.  The source of truth is still
// demo-data.ts; update that file first, then re-run this script.

const DEMO_DATA_PATH = path.join(__dirname, "../lib/demo-data.ts");
const CACHE_OUTPUT_PATH = path.join(__dirname, "../lib/sample-fix-cache.json");

// We extract the `extracted` blobs via a dynamic import of the compiled JS
// if available, or fall back to reading the JSON cache that already exists.
// The safest approach for this helper script: require tsx to run it, and
// use dynamic import with ts-node/esm resolver so we can import the TS file.

// ---------------------------------------------------------------------------
// Anthropic API (raw fetch — no SDK dependency needed)
// ---------------------------------------------------------------------------

async function callClaude(patientContext: object, factor: FactorLabel): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: "You are a clinical documentation assistant.",
      messages: [
        {
          role: "user",
          content: `Based on this patient chart context: ${JSON.stringify(
            patientContext
          )}, suggest a clinically appropriate value for the missing field: ${factor}. Return only the suggested value as a short plain text string, no explanation.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error for factor "${factor}": ${text}`);
  }

  const data = (await response.json()) as {
    content?: { text?: string }[];
  };
  const text = data.content?.[0]?.text?.trim();
  if (!text) throw new Error(`Empty response for factor "${factor}".`);
  return text;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Dynamically import the demo-data TS module (tsx resolves this at runtime).
  // Use a path alias-free relative import so tsx can resolve it without tsconfig.
  const demoData = await import("../lib/demo-data");

  const profiles: Record<string, object> = {
    [demoData.CLEAN_TKA.extracted.patient_name as string]: demoData.CLEAN_TKA.extracted,
    [demoData.MESSY_ROTATOR_CUFF.extracted.patient_name as string]: demoData.MESSY_ROTATOR_CUFF.extracted,
    [demoData.INCOMPLETE_LUMBAR_FUSION.extracted.patient_name as string]: demoData.INCOMPLETE_LUMBAR_FUSION.extracted,
  };

  const cache: Record<string, Record<string, string>> = {};

  for (const [patientName, extracted] of Object.entries(profiles)) {
    console.log(`\n── ${patientName} ──`);
    cache[patientName] = {};

    for (const factor of FACTOR_LABELS) {
      process.stdout.write(`  ${factor} ... `);
      try {
        const suggestion = await callClaude(extracted, factor);
        cache[patientName][factor] = suggestion;
        console.log("✓");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`✗  ${message}`);
        // Preserve any existing cached value so a partial failure doesn't wipe the cache.
        const existingRaw = fs.existsSync(CACHE_OUTPUT_PATH)
          ? JSON.parse(fs.readFileSync(CACHE_OUTPUT_PATH, "utf8"))
          : {};
        cache[patientName][factor] = existingRaw?.[patientName]?.[factor] ?? "";
      }

      // Small delay between calls to avoid Anthropic rate-limit bursts.
      await new Promise((res) => setTimeout(res, 500));
    }
  }

  fs.writeFileSync(CACHE_OUTPUT_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
  console.log(`\n✅  Cache written to ${CACHE_OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
