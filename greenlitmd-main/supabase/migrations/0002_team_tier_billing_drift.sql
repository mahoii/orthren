-- Roast finding: the /billing dashboard computes the correct consolidated
-- amount live, but nothing keeps the static Stripe Payment Link in sync as
-- surgeon headcount changes. Rather than build full Stripe subscription
-- billing (out of scope for this pass — needs live keys + webhooks to
-- verify), track the surgeon count the owner last acknowledged/updated
-- payment for, so the dashboard can surface drift instead of silently
-- letting the invoiced amount and actual usage diverge.
ALTER TABLE public.organizations
  ADD COLUMN last_acknowledged_surgeon_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_acknowledged_at timestamptz;
