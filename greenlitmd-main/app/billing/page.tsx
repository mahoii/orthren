import { redirect } from "next/navigation";
import { getCurrentMembership, resolveNoMembershipDestination } from "@/lib/auth/org";
import { createSupabaseAuthServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { currentBillingPeriod, summarizeUsage } from "@/lib/billing/usage";
import { getPaymentLinkUrl, PRICING_TIERS } from "@/lib/pricing";
import { acknowledgeBillingUpdate } from "@/lib/actions/org";

export default async function BillingPage() {
  const current = await getCurrentMembership();
  if (!current) {
    const authClient = createSupabaseAuthServerClient();
    const {
      data: { user }
    } = await authClient.auth.getUser();
    const destination = user?.email ? await resolveNoMembershipDestination(user.id, user.email) : "/onboarding";
    redirect(destination ?? "/onboarding");
  }
  // Billing is owner-only — coordinators/front desk manage staff and PAs, not spend.
  if (current.membership.role !== "owner") redirect("/team");

  const db = createSupabaseServerClient();
  const { start, end } = currentBillingPeriod();

  const [{ data: surgeons }, { data: cases }] = await Promise.all([
    db.from("surgeons").select("id, full_name, active").eq("org_id", current.organization.id),
    db
      .from("pa_cases")
      .select("surgeon_id")
      .eq("org_id", current.organization.id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
  ]);

  const summary = summarizeUsage(surgeons ?? [], cases ?? [], { start, end });
  const groupTier = PRICING_TIERS.find((t) => t.id === "group")!;
  const paymentLink = getPaymentLinkUrl(groupTier);

  const periodLabel = summary.periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  // There is no live Stripe subscription — the payment link above is a
  // static, fixed-price URL that does not auto-adjust as surgeon headcount
  // changes. Surface drift explicitly rather than letting it happen silently.
  const lastAcknowledged = current.organization.last_acknowledged_surgeon_count;
  const hasDrift = lastAcknowledged !== summary.activeSurgeonCount;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold text-[#0F2A4A]">Billing — {current.organization.name}</h1>
      <p className="mt-1 text-sm text-slate-500">{periodLabel}</p>

      {hasDrift ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Payment link may be out of date</p>
          <p className="mt-1">
            Your Stripe Payment Link was last confirmed for {lastAcknowledged} surgeon{lastAcknowledged === 1 ? "" : "s"}, but
            {" "}{summary.activeSurgeonCount} {summary.activeSurgeonCount === 1 ? "is" : "are"} active now. Update the payment
            link amount, then confirm below.
          </p>
          <form action={acknowledgeBillingUpdate} className="mt-3">
            <input type="hidden" name="active_surgeon_count" value={summary.activeSurgeonCount} />
            <button
              type="submit"
              className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              I&apos;ve updated the payment link — mark as current
            </button>
          </form>
        </div>
      ) : null}

      <section className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consolidated bill</p>
            <p className="mt-1 text-3xl font-bold text-[#0F2A4A]">
              ${(summary.amountCents / 100).toFixed(2)}<span className="text-base font-medium text-slate-400">/mo</span>
            </p>
          </div>
          <p className="text-sm text-slate-500">
            {summary.activeSurgeonCount} active surgeon{summary.activeSurgeonCount === 1 ? "" : "s"} · {summary.totalCases} PA
            {summary.totalCases === 1 ? "" : "s"} this period
          </p>
        </div>
        {paymentLink ? (
          <a
            href={paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-blue"
          >
            Manage payment →
          </a>
        ) : null}
      </section>

      <section className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Usage by surgeon</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {summary.perSurgeon.length === 0 ? (
            <li className="py-3 text-sm text-slate-400">
              No surgeons yet — add one on the <a href="/team" className="text-clinical-blue underline">Team</a> page.
            </li>
          ) : (
            summary.perSurgeon.map((s) => (
              <li key={s.surgeonId} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">
                  {s.surgeonName}
                  {!s.active ? <span className="ml-2 text-xs text-slate-400">(inactive)</span> : null}
                </span>
                <span className="font-medium text-slate-500">{s.caseCount} PA{s.caseCount === 1 ? "" : "s"}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
