// Offline regression harness for lib/deidentify.ts + lib/deid-verify.ts.
// No live API calls -- pure regex/string checks. Run with:
//   npx tsx scripts/deid-stress-check.ts
//
// Prints case name + failure category only -- never a raw PHI-shaped
// string, even on failure.

import * as fs from "fs";
import * as path from "path";
import * as mammoth from "mammoth";
import {
  deidentify,
  reidentify,
  createDeidentifyState,
  preprocess,
} from "../lib/deidentify";
import { verifyDeidentified } from "../lib/deid-verify";

type CaseResult = { name: string; pass: boolean; details: string[] };

const results: CaseResult[] = [];

function safeReport(name: string, pass: boolean, details: string[] = []): void {
  results.push({ name, pass, details });
}

function assert(name: string, condition: boolean, failDetail: string): void {
  if (!condition) safeReport(name, false, [failDetail]);
}

// ── Part A: real fixture charts ─────────────────────────────────────────

const CHARTS_DIR = path.join(__dirname, "../lib/sample-charts");

type FixtureConfig = {
  slug: string;
  file: string;
  mustSurvive: string[];
  mustBeAbsent: string[];
};

const FIXTURES: FixtureConfig[] = [
  {
    slug: "kim",
    file: "chart-kim-rachel-rotator-cuff-cpt29827-CLEAN.docx",
    mustSurvive: ["29827", "M75.121", "M75.111", "Kenalog", "Meloxicam", "7/10", "9/10", "3/5"],
    mustBeAbsent: ["Kim", "Rachel"],
  },
  {
    slug: "webb",
    file: "chart-webb-marcus-tka-cpt27447-MESSY.docx",
    mustSurvive: ["27447", "M17.11", "M17.12", "8/10", "4/10", "Metformin", "Lisinopril", "Atorvastatin"],
    mustBeAbsent: ["Webb", "Marcus"],
  },
  {
    slug: "vance",
    file: "chart-vance-sandra-tha-cpt27130-INCOMPLETE.docx",
    mustSurvive: ["27130", "M16.12", "200 feet"],
    mustBeAbsent: ["Vance", "Sandra"],
  },
];

const RESIDUAL_TOKEN_RE = /\[[A-Z][A-Z_]*(?:_\d+)?\]/;

async function runFixtureChecks(): Promise<void> {
  for (const fx of FIXTURES) {
    const filePath = path.join(CHARTS_DIR, fx.file);
    if (!fs.existsSync(filePath)) {
      safeReport(`fixture:${fx.slug}`, false, [`fixture file not found`]);
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const { value } = await mammoth.extractRawText({ buffer });
    const chartText = value.trim();

    // Precondition: a wrong guess about the fixture's content must fail
    // loudly here, not pass vacuously later.
    for (const token of fx.mustSurvive) {
      assert(
        `fixture:${fx.slug}:precondition`,
        chartText.includes(token),
        `expected raw fixture text to contain a clinical token that wasn't found (see fixture config)`
      );
    }

    const { redacted, map } = deidentify(chartText);

    for (const token of fx.mustSurvive) {
      assert(`fixture:${fx.slug}:mustSurvive`, redacted.includes(token), `clinical token missing after redaction`);
    }
    for (const token of fx.mustBeAbsent) {
      const re = new RegExp(`\\b${token}\\b`, "i");
      assert(`fixture:${fx.slug}:mustBeAbsent`, !re.test(redacted), `identifying token still present after redaction`);
    }

    const verify = verifyDeidentified(redacted, map);
    assert(
      `fixture:${fx.slug}:verifyPass`,
      verify.pass,
      `verify failed with categories: ${Array.from(new Set(verify.leaks.map((l) => l.split("@")[0]))).join(", ")}`
    );

    const roundTrip = reidentify(redacted, map);
    let roundTripOk = true;
    for (const [ph, raw] of Object.entries(map)) {
      if (raw === "90+") continue;
      if (!roundTrip.includes(raw)) roundTripOk = false;
    }
    if (RESIDUAL_TOKEN_RE.test(roundTrip)) roundTripOk = false;
    assert(`fixture:${fx.slug}:roundTrip`, roundTripOk, `reidentify did not fully restore mapped values`);

    if (fx.mustSurvive.every((t) => redacted.includes(t)) && fx.mustBeAbsent.every((t) => !new RegExp(`\\b${t}\\b`, "i").test(redacted)) && verify.pass && roundTripOk) {
      safeReport(`fixture:${fx.slug}`, true);
    }
  }
}

// ── Part B: adversarial synthetic cases ─────────────────────────────────

type AdversarialCase = {
  name: string;
  input: string;
  check: (redacted: string, map: Record<string, string>) => { pass: boolean; detail?: string };
};

function includesAll(text: string, tokens: string[]): boolean {
  return tokens.every((t) => text.includes(t));
}
function excludesAll(text: string, tokens: string[]): boolean {
  return tokens.every((t) => !new RegExp(`\\b${t}\\b`, "i").test(text));
}

const ADVERSARIAL_CASES: AdversarialCase[] = [
  {
    name: "allcaps-header",
    input: "WEBB, MARCUS\nDOB: 03/14/1961\nHPI: patient reports improvement.",
    check: (r) => ({ pass: excludesAll(r, ["WEBB", "MARCUS"]) && r.includes("[DOB]") }),
  },
  {
    name: "re-line-lastfirst",
    input: "Re: Webb, Marcus - DOB 3/14/1961\n\nHPI: stable.",
    check: (r) => ({ pass: excludesAll(r, ["Webb", "Marcus"]) }),
  },
  {
    name: "re-line-firstlast",
    input: "Re: Marcus Webb\n\nHPI: stable.",
    check: (r) => ({ pass: excludesAll(r, ["Marcus", "Webb"]) }),
  },
  {
    name: "mr-lastname-followup",
    input: "Patient: Marcus Webb\n\nMr. Webb reports improvement in symptoms.",
    check: (r) => ({ pass: excludesAll(r, ["Webb"]) }),
  },
  {
    name: "hyphen-apostrophe-suffix",
    // The two hyphenated-surname HALVES are "O'Brien" and "Smith" (split on
    // the hyphen only) -- a bare "Brien" (splitting further on the
    // apostrophe) is not a promised variant, so it isn't asserted absent.
    input: "Patient: O’Brien-Smith, Siobhan K. Jr.\n\nMs. O'Brien-Smith reports pain. Smith reports pain.",
    check: (r, map) => ({
      pass: excludesAll(r, ["Smith", "Siobhan"]) && !/\bO'Brien\b/i.test(r) && !!map["[PATIENT_NAME]"],
    }),
  },
  {
    name: "credentialed-provider-dedupe",
    input: "Sarah Chen, MD performed the exam. Later, Dr. Chen advised surgery.",
    check: (r, map) => {
      const providerTokens = Array.from(r.matchAll(/\[PROVIDER_\d+\]/g)).map((m) => m[0]);
      const unique = new Set(providerTokens);
      return { pass: unique.size === 1 && r.includes(", MD"), detail: JSON.stringify(providerTokens) };
    },
  },
  {
    name: "npi-before-phone",
    input: "Office NPI: 1234567893",
    check: (r) => ({ pass: /\[NPI_\d+\]/.test(r) && !r.includes("[PHONE]") }),
  },
  {
    name: "labeled-phone-variants",
    // Each phone is individually labeled -- an unlabeled bare 10-digit run
    // is deliberately NOT redacted by deidentify() (see the
    // "unlabeled-bare-digits-verify-fails-closed" case below); that residual
    // risk is caught by the fail-closed verifier instead.
    input: "Cell: 2125551234. Phone: +1 2125559999.",
    check: (r) => ({ pass: r.includes("[PHONE]") && !/\d{10}/.test(r) }),
  },
  {
    name: "unlabeled-bare-digits-verify-fails-closed",
    input: "Reference value: 2125551234 recorded without context.",
    check: (r, map) => {
      const verify = verifyDeidentified(r, map);
      const hasDigitRunLeak = verify.leaks.some((l) => l.startsWith("digit_run"));
      return { pass: !verify.pass && hasDigitRunLeak };
    },
  },
  {
    name: "ordinal-and-day-month-dates",
    input: "Seen January 15th, 2024. Also 15th of January, 2024. Also 15 Jan 2024.",
    check: (r) => {
      // Each phrasing is textually distinct, so each gets its own [DATE_n]
      // token (no semantic same-calendar-date merging is implemented, nor
      // promised) -- the assertion is that every variant was tokenized and
      // no literal month name survives.
      const tokens = Array.from(new Set(Array.from(r.matchAll(/\[DATE_\d+\]/g)).map((m) => m[0])));
      return { pass: tokens.length === 3 && !/January|Jan\b/i.test(r) };
    },
  },
  {
    name: "no-year-context-vs-clinical-fractions",
    input: "Seen on 3/24, since 1/15. Strength 4/5. ROM 120/135. Pain 7/10. BP 120/80. Acuity 20/40.",
    check: (r) => ({
      pass: includesAll(r, ["4/5", "120/135", "7/10", "120/80", "20/40"]) && r.includes("[DATE_"),
    }),
  },
  {
    name: "may-of-year",
    input: "Symptoms began May of 2024.",
    check: (r) => ({ pass: r.includes("[DATE_") && !/May/.test(r) }),
  },
  {
    name: "date-range-numeric-and-textual",
    input: "PT from 6/2024–8/2024. Also June-August 2024.",
    check: (r) => {
      const tokens = Array.from(r.matchAll(/\[DATE_\d+\]/g)).map((m) => m[0]);
      return { pass: tokens.length >= 2 && !/June|August/.test(r) };
    },
  },
  {
    name: "metro-city-zip-with-cpt-icd-negative",
    input: "Patient lives in Brooklyn, NY 11215. Also moved to Queens last year. CPT 27447. ICD M17.11.",
    check: (r) => ({
      pass: /\[CITY_\d+\], NY/.test(r) && /\[CITY_\d+\]/.test(r) && includesAll(r, ["27447", "M17.11"]),
    }),
  },
  {
    name: "baltimore-vs-credential",
    input: "Referred from Baltimore, MD 21230. Seen by Jones, PA-C. Seen by Smith, MD.",
    check: (r) => ({
      pass:
        /\[CITY_\d+\], MD \[ZIP_\d+\]/.test(r) &&
        /\[PROVIDER_\d+\], PA-C/.test(r) &&
        /\[PROVIDER_\d+\], MD/.test(r),
    }),
  },
  {
    name: "po-box",
    input: "Mailing address: P.O. Box 4521",
    check: (r) => ({ pass: r.includes("[ADDRESS]") && !/4521/.test(r) }),
  },
  {
    name: "implant-lot-device",
    input: "Zimmer NexGen implant, Lot #ABC12345, REF 5844-02-11.",
    check: (r) => ({
      pass: includesAll(r, ["Zimmer NexGen"]) && (r.match(/\[DEVICE_\d+\]/g) ?? []).length >= 2,
    }),
  },
  {
    name: "portal-url-ip",
    input: "Portal link https://portal.example.com/p/abc123 accessed from 192.168.1.4.",
    check: (r) => ({ pass: r.includes("[URL_1]") && r.includes("[IP_1]") }),
  },
  {
    name: "age-90plus-roundtrip",
    input: "Patient is a 94-year-old male.",
    check: (r, map) => {
      const rt = reidentify(r, map);
      return { pass: r.includes("[AGE_90PLUS]") && rt.includes("90+") && !rt.includes("94") };
    },
  },
  {
    name: "age-under-90-roundtrip",
    input: "Patient is a 72-year-old male.",
    check: (r, map) => {
      const rt = reidentify(r, map);
      return { pass: r.includes("[AGE]") && rt.includes("72-year-old") };
    },
  },
  {
    name: "zero-width-split-ssn",
    input: "SSN: 123-45​-6789",
    check: (r, map) => {
      const verify = verifyDeidentified(r, map);
      return { pass: /\[SSN_\d+\]/.test(r) && verify.pass };
    },
  },
  {
    name: "smart-quotes-json-safety",
    input: JSON.stringify({ note: "Patient said “it hurts” and ‘can’t move it’" }, null, 2),
    check: (r) => {
      let parsedOk = true;
      try {
        JSON.parse(r);
      } catch {
        parsedOk = false;
      }
      return { pass: parsedOk };
    },
  },
  {
    name: "json-native-labels-no-seeding",
    input: JSON.stringify(
      { patient_name: "Webb, Marcus", date_of_birth: "1961-03-14", city: "Hoboken", member_id: "XJ4-889-21" },
      null,
      2
    ),
    check: (r) => {
      let parsedOk = true;
      try {
        JSON.parse(r);
      } catch {
        parsedOk = false;
      }
      return {
        pass:
          parsedOk &&
          r.includes("[PATIENT_NAME]") &&
          r.includes("[DOB]") &&
          !/Webb|Marcus|Hoboken/.test(r),
      };
    },
  },
  {
    name: "clinical-header-negative",
    input: "FLEXION, LIMITED\nEXTENSION, FULL\nROTATION, PAINFUL",
    check: (r, map) => ({
      pass: !map["[PATIENT_NAME]"] && includesAll(r, ["FLEXION, LIMITED", "EXTENSION, FULL", "ROTATION, PAINFUL"]),
    }),
  },
  {
    name: "contact-labeled-vs-patient-surname",
    input: "Patient: Webb, Marcus\nEmergency contact: Denise Webb (wife), (718) 555-0101",
    check: (r) => ({
      pass: /\[CONTACT_\d+\]/.test(r) && r.includes("[PHONE]") && !/Webb|Denise/.test(r),
    }),
  },
  {
    name: "shared-state-inherit",
    input: "n/a", // handled specially below
    check: () => ({ pass: true }),
  },
  {
    name: "planted-leak-controls",
    input: "n/a", // handled specially below
    check: () => ({ pass: true }),
  },
];

function runAdversarialCases(): void {
  for (const c of ADVERSARIAL_CASES) {
    if (c.name === "shared-state-inherit") {
      const state = createDeidentifyState();
      deidentify(JSON.stringify({ patient_name: "Webb, Marcus" }), state);
      const { redacted } = deidentify("Mr. Webb's denial letter dated 3/1/2025.", state);
      const pass = !/Webb/.test(redacted) && redacted.includes("[DATE_");
      safeReport(c.name, pass, pass ? [] : ["shared-state name inheritance failed"]);
      continue;
    }
    if (c.name === "planted-leak-controls") {
      const plantedMap = { "[SSN_1]": "999-88-7777" };
      const leakCases: Array<[string, Record<string, string>, string]> = [
        ["123-45-6789 leaked in plain text", plantedMap, "ssn"],
        ["value echo test text", { "[TEST_1]": "value echo test" }, "map_value_TEST"],
        ["contact jdoe@example.com present", {}, "email"],
        ["MRN: 884213 present", {}, "labeled_identifier_residue"],
      ];
      let allDetected = true;
      const details: string[] = [];
      for (const [text, map, expectedCategory] of leakCases) {
        const verify = verifyDeidentified(text, map);
        const found = verify.leaks.some((l) => l.startsWith(expectedCategory));
        if (!found) {
          allDetected = false;
          details.push(`expected category "${expectedCategory}" not detected`);
        }
      }
      safeReport(c.name, allDetected, details);
      continue;
    }

    const { redacted, map } = deidentify(c.input);
    const { pass, detail } = c.check(redacted, map);
    safeReport(c.name, pass, pass ? [] : [detail ?? "assertion failed"]);
  }
}

// ── Report ───────────────────────────────────────────────────────────────

function printReport(): boolean {
  let anyFail = false;
  console.log("\nDE-ID STRESS CHECK RESULTS\n" + "=".repeat(40));
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) anyFail = true;
    console.log(`[${status}] ${r.name}${r.details.length ? " -- " + r.details.join("; ") : ""}`);
  }
  console.log("=".repeat(40));
  console.log(anyFail ? "RESULT: FAILED -- do not merge until resolved" : "RESULT: ALL PASS");
  return anyFail;
}

async function main(): Promise<void> {
  // Sanity check preprocess() is wired and exported for reuse.
  if (preprocess("test") !== "test") {
    safeReport("preprocess-sanity", false, ["preprocess altered plain ASCII text unexpectedly"]);
  }
  await runFixtureChecks();
  runAdversarialCases();
  const anyFail = printReport();
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error("[deid-stress-check] fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
