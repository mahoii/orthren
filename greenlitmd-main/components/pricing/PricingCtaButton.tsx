"use client";

import { usePostHog } from "posthog-js/react";
import { CONTACT_FALLBACK_EMAIL, type PricingTierId } from "@/lib/pricing";

interface PricingCtaButtonProps {
  tierId: PricingTierId;
  tierName: string;
  paymentLinkUrl: string | null;
  className?: string;
}

export default function PricingCtaButton({
  tierId,
  tierName,
  paymentLinkUrl,
  className,
}: PricingCtaButtonProps) {
  const posthog = usePostHog();

  function handleClick() {
    posthog?.capture("pricing_cta_clicked", { tier_id: tierId });
  }

  if (!paymentLinkUrl) {
    return (
      <a
        href={`mailto:${CONTACT_FALLBACK_EMAIL}?subject=${encodeURIComponent(
          `${tierName} plan — Orthren`
        )}`}
        onClick={handleClick}
        className={className}
        title="Online checkout isn't set up yet — email us to get started"
      >
        Contact {CONTACT_FALLBACK_EMAIL}
      </a>
    );
  }

  return (
    <a
      href={paymentLinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      Get started
    </a>
  );
}
