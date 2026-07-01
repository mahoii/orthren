/**
 * payer-rules-status.ts
 *
 * Prints the validation status of every rule in lib/payer-rules.ts, split into
 * validated rules and the two distinct "blocked" categories, so it's clear at a
 * glance which rules are done vs. why the remaining ones can't be closed out.
 *   npx tsx scripts/payer-rules-status.ts
 */

import { PAYER_RULES, type PayerRule } from "../lib/payer-rules";

// A rule is "blocked" for one of two structurally different reasons — surfaced
// by payer_id + cpt_code rather than a new data field, since both reasons are
// already fully explained in each rule's guideline_source prose.
const NO_PRIMARY_SOURCE = new Set(["aetna:29827"]); // Aetna RCR — no dedicated CPB exists
const LICENSED_SOURCE_REQUIRED = new Set(["uhc:27447", "uhc:27130", "uhc:29827"]); // UHC — defers to licensed InterQual

function key(rule: PayerRule): string {
  return `${rule.payer_id}:${rule.cpt_code}`;
}

const validated = PAYER_RULES.filter((r) => r.validation_status === "validated");
const noPrimarySource = PAYER_RULES.filter((r) => NO_PRIMARY_SOURCE.has(key(r)));
const licensedSourceRequired = PAYER_RULES.filter((r) => LICENSED_SOURCE_REQUIRED.has(key(r)));

const accountedFor = validated.length + noPrimarySource.length + licensedSourceRequired.length;
if (accountedFor !== PAYER_RULES.length) {
  throw new Error(
    `payer-rules-status: ${PAYER_RULES.length - accountedFor} rule(s) are neither validated nor in a known blocked category. ` +
      `Update NO_PRIMARY_SOURCE / LICENSED_SOURCE_REQUIRED in this script to account for every rule.`
  );
}

console.log(`\n=== VALIDATED (${validated.length}) ===`);
console.log("Confirmed by directly fetching and quoting the primary payer source.\n");
for (const rule of validated) {
  console.log(`  ✓ ${rule.payer_name} — CPT ${rule.cpt_code} (${rule.procedure_name})`);
  console.log(`      source: ${rule.source_url}`);
  console.log(`      last_verified: ${rule.last_verified_date}\n`);
}

console.log(`=== BLOCKED — no accessible primary source (${noPrimarySource.length}) ===`);
console.log(
  "No dedicated payer policy document covers this procedure at all — there is nothing to fetch\n" +
    "and confirm against. This is not a research gap that more searching will close; the source\n" +
    "does not exist in accessible form.\n"
);
for (const rule of noPrimarySource) {
  console.log(`  ✗ ${rule.payer_name} — CPT ${rule.cpt_code} (${rule.procedure_name})`);
  console.log(`      why: ${rule.guideline_source}\n`);
}

console.log(`=== BLOCKED — licensed/paywalled source required (${licensedSourceRequired.length}) ===`);
console.log(
  "The payer's own policy document exists and is accessible, but it defers the specific duration\n" +
    "thresholds (PT weeks, NSAID trial length, etc.) to InterQual® criteria — a licensed, proprietary\n" +
    "product we do not have access to. The policy text itself cannot be used to confirm those numbers.\n"
);
for (const rule of licensedSourceRequired) {
  console.log(`  ✗ ${rule.payer_name} — CPT ${rule.cpt_code} (${rule.procedure_name})`);
  console.log(`      why: ${rule.guideline_source}\n`);
}

console.log(
  `${validated.length} of ${PAYER_RULES.length} rules validated. ` +
    `${noPrimarySource.length + licensedSourceRequired.length} blocked (closed for now — not paused; ` +
    `see comments above each blocked rule object in lib/payer-rules.ts before re-attempting).\n`
);
