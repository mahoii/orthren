import { redirect } from "next/navigation";
import { getCurrentMembership, resolveNoMembershipDestination } from "@/lib/auth/org";
import { createSupabaseAuthServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import BuilderClient, { type BuilderSurgeon } from "./BuilderClient";

export default async function BuilderPage({
  searchParams
}: {
  searchParams: { demo?: string };
}) {
  // Demo/sandbox is intentionally unauthenticated (middleware.ts bypasses auth
  // for ?demo=true) — never resolve org membership on that path.
  if (searchParams.demo === "true") {
    return <BuilderClient surgeons={[]} />;
  }

  const current = await getCurrentMembership();
  if (!current) {
    const authClient = createSupabaseAuthServerClient();
    const {
      data: { user }
    } = await authClient.auth.getUser();
    const destination = user?.email ? await resolveNoMembershipDestination(user.id, user.email) : "/onboarding";
    redirect(destination ?? "/onboarding");
  }

  const db = createSupabaseServerClient();
  const { data: surgeons } = await db
    .from("surgeons")
    .select("id, full_name")
    .eq("org_id", current.organization.id)
    .eq("active", true)
    .order("full_name", { ascending: true });

  return <BuilderClient surgeons={(surgeons ?? []) as BuilderSurgeon[]} />;
}
