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

// [REDACTED] is the fail-closed residual-pass token: intentionally non-reversible
// (never added to the map), so it is expected to remain after reidentify() and
// must NOT count as an unrestored placeholder here.
const RESIDUAL_TOKEN_RE = /\[(?!REDACTED\])[A-Z][A-Z_]*(?:_\d+)?\]/;

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
    for (const [, raw] of Object.entries(map)) {
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
    check: (r, _map) => {
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
    // Each phone is individually labeled and captured as [PHONE]. An UNLABELED
    // bare digit run is now masked by the fail-closed residual pass at redaction
    // time (see the "unlabeled-bare-digits-residual-masks" case below).
    input: "Cell: 2125551234. Phone: +1 2125559999.",
    check: (r) => ({ pass: r.includes("[PHONE]") && !/\d{10}/.test(r) }),
  },
  {
    name: "unlabeled-bare-digits-residual-masks",
    // Previously deidentify() left an unlabeled bare 10-digit run untouched and
    // only the verifier flagged it. The fail-closed residual pass now masks any
    // PHI-length (6+) bare digit run to [REDACTED] at REDACTION time -- strictly
    // safer -- so the raw run is gone from `r` and verify passes clean.
    //
    // Also asserts the property the whole design depends on: [REDACTED] is
    // NON-REVERSIBLE. If passResidualUnknowns() ever regressed to (incorrectly)
    // register "[REDACTED]" -> the raw value in the map, `r` would still lack
    // the raw digits and verify.pass would still be true -- neither of the
    // original two assertions would catch that regression. Checking the map
    // directly, and that reidentify() does NOT resurrect the raw digits, closes
    // that gap.
    input: "Reference value: 2125551234 recorded without context.",
    check: (r, map) => {
      const verify = verifyDeidentified(r, map);
      const notInMap = !("[REDACTED]" in map) && !Object.values(map).includes("2125551234");
      const roundTrip = reidentify(r, map);
      const staysNonReversible = roundTrip.includes("[REDACTED]") && !roundTrip.includes("2125551234");
      return {
        pass: !/2125551234/.test(r) && r.includes("[REDACTED]") && verify.pass && notInMap && staysNonReversible,
        detail: !notInMap ? "map illegitimately contains the raw digits" : !staysNonReversible ? "reidentify() resurrected the raw digits" : undefined,
      };
    },
  },
  {
    name: "verifier-catches-raw-bare-digit-run-directly",
    // Direct, deidentify()-bypassing check that verifyDeidentified()'s OWN
    // digit-run detectors (DIGIT_RUN_RE / RESIDUAL_DIGIT_RE) still fail closed
    // on their own -- feeds an unmasked bare digit run straight into the
    // verifier, the way the "planted-leak-controls" case does for other
    // categories, so this path doesn't silently go untested end-to-end.
    input: "n/a", // handled specially below
    check: () => ({ pass: true }),
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
  {
    name: "residual-name-beyond-bound",
    // RESIDUAL_WORD/RESIDUAL_NAME_RE in deid-verify.ts were changed from
    // unbounded `*` to bounded `{0,20}`/`{0,50}` repetition (ReDoS hardening).
    // This proves the bound doesn't create a fail-open gap: a raw unmasked
    // name chain far past every bound (25 hyphen-joined chunks inside a
    // 60-word space-joined run) must still be caught. matchAll resumes
    // scanning from where the previous match left off, so exceeding a bound
    // should split into multiple flagged matches rather than silently
    // passing -- this asserts that's actually true, not just assumed.
    input: "n/a", // handled specially below
    check: () => ({ pass: true }),
  },
  // ── Worker 2: HIPAA Safe Harbor gap sweep additions ────────────────────
  {
    name: "allcaps-city-relocation-context",
    // Gap 1 (candidate weak spot flagged in the brief): a bare city name
    // OUTSIDE the NYC-metro gazetteer, in ALL-CAPS, following a relocation
    // preposition. The fail-closed residual pass's word regex is
    // Titlecase-only ([A-Z][a-z]+), so it structurally cannot catch this --
    // only the new passLocationContextCities pass can.
    input: "The patient relocated from TULSA before her follow-up. Also moved to PHOENIX last year.",
    check: (r) => ({
      pass: excludesAll(r, ["TULSA", "PHOENIX"]) && (r.match(/\[CITY_\d+\]/g) ?? []).length >= 2,
    }),
  },
  {
    name: "titlecase-location-context-reversible-token",
    // Same gap class, Titlecase form: previously fell through to the
    // fail-closed residual pass's NON-reversible [REDACTED]. Now gets a
    // proper [CITY_n] token via passLocationContextCities that round-trips.
    input: "Patient moved to Denver after surgery.",
    check: (r, map) => {
      const rt = reidentify(r, map);
      return { pass: r.includes("[CITY_") && !/\bDenver\b/.test(r) && rt.includes("Denver") };
    },
  },
  {
    name: "location-context-negative-clinical-abbrev",
    // Negative test for the same new pass: "transferred from ICU to PACU"
    // shares the exact preposition phrasing a relocation city would use --
    // must NOT be swept up as a city, since ICU/PACU are core clinical
    // context, not PHI.
    input: "Patient transferred from ICU to PACU for recovery.",
    check: (r) => ({ pass: includesAll(r, ["transferred from ICU to PACU"]) }),
  },
  {
    name: "bare-alnum-multihyphen-id-redacted",
    // Gap 2 (candidate weak spot flagged in the brief): an unlabeled bare
    // alphanumeric identifier (member/account-ID-shaped) mentioned in free
    // prose with no "Member ID:" / "Account:" label for the existing labeled
    // passes to key off of. Maps to Safe Harbor category 18 ("any other
    // unique identifying number, characteristic, or code").
    input: "Her account is XJ4-889-21 on file without further context.",
    check: (r) => ({ pass: r.includes("[ACCOUNT_") && !/XJ4-889-21/.test(r) }),
  },
  {
    name: "bare-alnum-id-roundtrip-and-verify",
    input: "The patient's member reference AB-1234-56 was noted.",
    check: (r, map) => {
      const verify = verifyDeidentified(r, map);
      const rt = reidentify(r, map);
      return {
        pass: r.includes("[ACCOUNT_") && !/AB-1234-56/.test(r) && verify.pass && rt.includes("AB-1234-56"),
      };
    },
  },
  {
    name: "spine-level-and-hcpcs-survive-bare-id-pass",
    // Negative / must-survive test: the new bare-alnum-ID pass requires 3+
    // hyphen-joined segments specifically so it can never eat a spine level
    // (one hyphen) or an HCPCS code (zero hyphens) -- both are core clinical
    // content the letter model must see accurately (SOURCE LOCK).
    input: "Spine imaging shows disc herniation at L4-L5 and C5-C6 levels. HCPCS L1902 was billed for the orthotic.",
    check: (r) => ({ pass: includesAll(r, ["L4-L5", "C5-C6", "L1902"]) }),
  },
  {
    name: "icd-decimal-code-and-cpt-modifier-survive-bare-id-pass",
    // Negative / must-survive test: ICD-10 decimal-form codes are
    // dot-separated (never hyphenated) and a CPT-with-modifier uses only one
    // hyphen -- neither should ever be touched by the new pass.
    input: "ICD M75.121 and M17.11 documented. CPT 27447-59 was billed.",
    check: (r) => ({ pass: includesAll(r, ["M75.121", "M17.11", "27447-59"]) }),
  },
  {
    name: "ndc-allnumeric-multihyphen-survives",
    // Negative / must-survive test: an NDC drug-product code commonly uses
    // two hyphens (three segments) -- the same shape the new pass targets --
    // but is all-digit. The pass's explicit "must contain a letter" check
    // keeps it untouched, since an NDC identifies a drug product, not a
    // patient, and isn't a Safe Harbor identifier.
    input: "NDC 12345-6789-01 was documented.",
    check: (r) => ({ pass: r.includes("12345-6789-01") && !r.includes("[ACCOUNT_") }),
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
    if (c.name === "verifier-catches-raw-bare-digit-run-directly") {
      const verify = verifyDeidentified("Reference value: 2125551234 recorded without context.", {});
      const caught = !verify.pass && verify.leaks.some((l) => l.startsWith("unclassified_residue") || l.startsWith("digit_run"));
      safeReport(c.name, caught, caught ? [] : ["verifier did not flag a raw unmasked bare digit run"]);
      continue;
    }
    if (c.name === "residual-name-beyond-bound") {
      const chunks = Array.from({ length: 25 }, (_, i) => `Ab${i}cd`.replace(/\d/, "")).map(
        (_, i) => `Chunk${String.fromCharCode(65 + (i % 26))}`
      );
      const hyphenChain = chunks.slice(0, 25).join("-"); // 25 > the 20-chunk bound
      const words = Array.from({ length: 60 }, (_, i) => `Word${String.fromCharCode(65 + (i % 26))}`);
      const spaceChain = words.join(" "); // 60 > the 50-word bound
      const text = `Patient name on file: ${hyphenChain} ${spaceChain} end of note.`;
      const verify = verifyDeidentified(text, {});
      const caught = !verify.pass && verify.leaks.some((l) => l.startsWith("unclassified_residue"));
      safeReport(c.name, caught, caught ? [] : ["verifier failed to flag a raw name chain exceeding the new bounds -- possible fail-open"]);
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
