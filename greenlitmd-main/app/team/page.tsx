import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMembership, resolveNoMembershipDestination } from "@/lib/auth/org";
import { createSupabaseAuthServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { inviteMember, addSurgeon, deactivateSurgeon } from "@/lib/actions/org";

const roleLabels: Record<string, string> = {
  owner: "Owner",
  coordinator: "PA Coordinator",
  front_desk: "Front Desk"
};

export default async function TeamPage() {
  const current = await getCurrentMembership();
  if (!current) {
    const authClient = createSupabaseAuthServerClient();
    const {
      data: { user }
    } = await authClient.auth.getUser();
    const destination = user?.email ? await resolveNoMembershipDestination(user.id, user.email) : "/onboarding";
    redirect(destination ?? "/onboarding");
  }
  // Front desk staff generate PAs but don't manage team/billing.
  if (current.membership.role === "front_desk") redirect("/builder");

  const db = createSupabaseServerClient();
  const [{ data: memberships }, { data: invitations }, { data: surgeons }] = await Promise.all([
    db.from("memberships").select("*").eq("org_id", current.organization.id).order("created_at", { ascending: true }),
    db
      .from("invitations")
      .select("*")
      .eq("org_id", current.organization.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: true }),
    db.from("surgeons").select("*").eq("org_id", current.organization.id).order("full_name", { ascending: true })
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2A4A]">{current.organization.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Manage staff logins and surgeons.</p>
        </div>
        {current.membership.role === "owner" ? (
          <Link href="/billing" className="text-sm font-semibold text-clinical-blue hover:underline">
            View billing →
          </Link>
        ) : null}
      </div>

      <section className="mb-8 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Staff</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {(memberships ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">{m.user_id}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {roleLabels[m.role] ?? m.role}
              </span>
            </li>
          ))}
        </ul>
        {(invitations ?? []).length > 0 ? (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Pending invitations</h3>
            <ul className="mt-2 divide-y divide-slate-100">
              {(invitations ?? []).map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-600">{i.email}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {roleLabels[i.role] ?? i.role} — pending
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <form action={inviteMember} className="mt-5 flex gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="staff@practice.com"
            className="flex-1 rounded-md border border-clinical-line px-3 py-2 text-sm outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
          />
          <select
            name="role"
            required
            className="rounded-md border border-clinical-line px-3 py-2 text-sm outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
          >
            <option value="coordinator">PA Coordinator</option>
            <option value="front_desk">Front Desk</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-blue"
          >
            Invite
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Surgeons</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {(surgeons ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">
                {s.full_name}
                {!s.active ? <span className="ml-2 text-xs text-slate-400">(inactive)</span> : null}
              </span>
              {s.active ? (
                <form action={deactivateSurgeon}>
                  <input type="hidden" name="surgeon_id" value={s.id} />
                  <button type="submit" className="text-xs font-medium text-slate-400 hover:text-red-600">
                    Deactivate
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>

        <form action={addSurgeon} className="mt-5 flex gap-2">
          <input
            name="full_name"
            type="text"
            required
            placeholder="Dr. Jane Smith, MD"
            className="flex-1 rounded-md border border-clinical-line px-3 py-2 text-sm outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
          />
          <input
            name="npi"
            type="text"
            placeholder="NPI (optional)"
            className="w-40 rounded-md border border-clinical-line px-3 py-2 text-sm outline-none focus:border-clinical-blue focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            className="rounded-md bg-clinical-navy px-4 py-2 text-sm font-semibold text-white hover:bg-clinical-blue"
          >
            Add surgeon
          </button>
        </form>
      </section>
    </main>
  );
}
