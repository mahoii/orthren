// Known-CPT allowlist for the cpt_code_valid PA Strength factor. This is a
// pragmatic, non-exhaustive list of common orthopedic CPT codes — not a
// billing database — seeded from the codes already backed by a payer rule
// plus a small set of other common orthopedic procedure codes. Extend as
// new procedure types are supported.
import { PAYER_RULES } from "@/lib/payer-rules";

const OTHER_COMMON_ORTHOPEDIC_CPT_CODES = [
  "29826", // Arthroscopic subacromial decompression
  "29807", // Arthroscopic labral repair (SLAP)
  "29881", // Knee arthroscopy w/ meniscectomy, single compartment
  "29880", // Knee arthroscopy w/ meniscectomy, medial AND lateral
  "23472", // Total shoulder arthroplasty
  "27486", // Revision TKA, 1 component
  "27487", // Revision TKA, femoral and tibial components
  "22630", // Lumbar posterior interbody arthrodesis, single interspace
  "22633", // Lumbar posterior interbody arthrodesis + posterolateral, single interspace
  "22558", // Lumbar anterior interbody arthrodesis
  "63030", // Lumbar laminotomy/discectomy, single interspace
  "20610", // Arthrocentesis/injection, major joint
];

export const KNOWN_ORTHOPEDIC_CPT_CODES = new Set<string>([
  ...PAYER_RULES.map((rule) => rule.cpt_code),
  ...OTHER_COMMON_ORTHOPEDIC_CPT_CODES,
]);

export function isKnownCptCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return KNOWN_ORTHOPEDIC_CPT_CODES.has(code.trim());
}
