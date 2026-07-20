import { groupPriceForSurgeons } from "@/lib/pricing";
import type { PaCase, Surgeon } from "@/lib/supabase/types";

export interface SurgeonUsage {
  surgeonId: string;
  surgeonName: string;
  active: boolean;
  caseCount: number;
}

export interface BillingSummary {
  periodStart: Date;
  periodEnd: Date;
  activeSurgeonCount: number;
  totalCases: number;
  perSurgeon: SurgeonUsage[];
  amountCents: number;
}

/** Current billing period: calendar month, UTC. */
export function currentBillingPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Pure aggregation — takes already-fetched rows so it's unit-testable without a DB. */
export function summarizeUsage(
  surgeons: Pick<Surgeon, "id" | "full_name" | "active">[],
  casesInPeriod: Pick<PaCase, "surgeon_id">[],
  period: { start: Date; end: Date }
): BillingSummary {
  const countsBySurgeon = new Map<string, number>();
  for (const c of casesInPeriod) {
    countsBySurgeon.set(c.surgeon_id, (countsBySurgeon.get(c.surgeon_id) ?? 0) + 1);
  }

  const perSurgeon: SurgeonUsage[] = surgeons.map((s) => ({
    surgeonId: s.id,
    surgeonName: s.full_name,
    active: Boolean(s.active),
    caseCount: countsBySurgeon.get(s.id) ?? 0
  }));

  const activeSurgeonCount = surgeons.filter((s) => s.active).length;
  const totalCases = perSurgeon.reduce((sum, s) => sum + s.caseCount, 0);

  return {
    periodStart: period.start,
    periodEnd: period.end,
    activeSurgeonCount,
    totalCases,
    perSurgeon,
    amountCents: groupPriceForSurgeons(activeSurgeonCount) * 100
  };
}
