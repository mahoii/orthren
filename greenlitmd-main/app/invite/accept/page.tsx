import { redirect } from "next/navigation";
import { createSupabaseAuthServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMembership, getPendingInvitation } from "@/lib/auth/org";
import { acceptInvitation } from "@/lib/actions/org";

const roleLabels: Record<string, string> = {
  owner: "Owner",
  coordinator: "PA Coordinator",
  front_desk: "Front Desk"
};

export default async function AcceptInvitePage() {
  const authClient = createSupabaseAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();
  if (!user || !user.email) redirect("/login?redirect=/invite/accept");

  const current = await getCurrentMembership();
  if (current) redirect("/builder");

  const invitation = await getPendingInvitation(user.email);
  if (!invitation) redirect("/onboarding");

  const db = createSupabaseServerClient();
  const { data: organization } = await db
    .from("organizations")
    .select("name")
    .eq("id", invitation!.org_id)
    .maybeSingle();

  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-[#F8F9FB] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#0F2A4A]">You&apos;ve been invited</h1>
          <p className="mt-1 text-sm text-slate-500">
            {organization?.name ?? "A practice"} invited you to join as{" "}
            <span className="font-medium text-slate-700">{roleLabels[invitation!.role] ?? invitation!.role}</span>.
          </p>
        </div>
        <form action={acceptInvitation} className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <input type="hidden" name="invitation_id" value={invitation!.id} />
          <p className="text-xs text-slate-500">
            Accepting will add {user.email} to this practice&apos;s account.
          </p>
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-[#0F2A4A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2563EB]"
          >
            Accept invitation
          </button>
        </form>
      </div>
    </main>
  );
}
