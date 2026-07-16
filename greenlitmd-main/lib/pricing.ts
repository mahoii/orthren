export type PricingTierId = "solo" | "group";

export interface PricingTier {
  id: PricingTierId;
  name: string;
  priceLabel: string;
  priceSubLabel: string;
  features: string[];
  paymentLinkEnvVar: "NEXT_PUBLIC_STRIPE_LINK_SOLO" | "NEXT_PUBLIC_STRIPE_LINK_GROUP";
}

export const SOLO_PRICE = 299;
export const GROUP_BASE_PRICE = 199;
export const GROUP_PRICE_PER_SURGEON = 80;

export function groupPriceForSurgeons(surgeonCount: number): number {
  return GROUP_BASE_PRICE + GROUP_PRICE_PER_SURGEON * surgeonCount;
}

export const GROUP_WORKED_EXAMPLES = [5, 10, 15].map((surgeonCount) => ({
  surgeonCount,
  price: groupPriceForSurgeons(surgeonCount),
}));

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "solo",
    name: "Solo",
    priceLabel: `$${SOLO_PRICE}/mo`,
    priceSubLabel: "Flat rate, one surgeon",
    features: [
      "AI-assisted Letter of Medical Necessity",
      "PA Strength Score with inline fix suggestions",
      "Denial risk flagging before submission",
      "20+ orthopedic CPT codes (TKA, THA, rotator cuff, spine, shoulder)",
      "All major payers supported",
      "Sub-60-second turnaround",
      "Submission-ready DOCX download",
    ],
    paymentLinkEnvVar: "NEXT_PUBLIC_STRIPE_LINK_SOLO",
  },
  {
    id: "group",
    name: "Group",
    priceLabel: `$${GROUP_BASE_PRICE}/mo + $${GROUP_PRICE_PER_SURGEON}/mo per surgeon`,
    priceSubLabel: "Scales with your practice",
    features: [
      "Everything in Solo",
      "Multiple staff logins (PA coordinators + front desk)",
      "Per-surgeon usage, one consolidated bill",
      "Dedicated onboarding call + setup support",
      "Priority email support",
    ],
    paymentLinkEnvVar: "NEXT_PUBLIC_STRIPE_LINK_GROUP",
  },
];

export const CONTACT_FALLBACK_EMAIL = "kamari@orthren.com";

export function getPaymentLinkUrl(tier: PricingTier): string | null {
  const url = process.env[tier.paymentLinkEnvVar];
  return url && url.trim().length > 0 ? url : null;
}
