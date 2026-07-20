import { redirect } from "next/navigation";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server";
import { getCurrentMembership, getPendingInvitation } from "@/lib/auth/org";
import { createOrganization } from "@/lib/actions/org";

export default async function OnboardingPage() {
  const authClient = createSupabaseAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();
  if (!user || !user.email) redirect("/login?redirect=/onboarding");

  const current = await getCurrentMembership();
  if (current) redirect("/builder");

  // A user with a pending invite accepts it explicitly rather than landing
  // here — creating a fresh org would strand their invite unaccepted.
  const invitation = await getPendingInvitation(user.email);
  if (invitation) redirect("/invite/accept");

  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-[#F8F9FB] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#0F2A4A]">Set up your practice</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a practice organization to start generating PA packets and invite staff.
          </p>
        </div>
        <form action={createOrganization} className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-slate-700" htmlFor="name">
            Practice name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Westbrook Orthopedic Surgery Center"
            className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-[#0F2A4A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2563EB]"
          >
            Create practice
          </button>
        </form>
      </div>
    </main>
  );
}
