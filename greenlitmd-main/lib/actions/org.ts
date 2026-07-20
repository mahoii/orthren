"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseAuthServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentMembership, requireRole } from "@/lib/auth/org";

export async function createOrganization(formData: FormData): Promise<void> {
  const authClient = createSupabaseAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();
  if (!user) redirect("/login?redirect=/onboarding");

  const existing = await getCurrentMembership();
  if (existing) redirect("/builder");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const db = createSupabaseServerClient();
  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({ name, owner_user_id: user!.id })
    .select()
    .single();
  if (orgError || !org) return;

  await db.from("memberships").insert({ org_id: org.id, user_id: user!.id, role: "owner" });

  redirect("/team");
}

export async function acceptInvitation(formData: FormData): Promise<void> {
  const authClient = createSupabaseAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();
  if (!user || !user.email) redirect("/login?redirect=/invite/accept");

  const invitationId = String(formData.get("invitation_id") ?? "");
  if (!invitationId) return;

  const db = createSupabaseServerClient();

  // Re-fetch and re-check ownership/state server-side — the form only carries
  // an id, never trust the client for the email/accepted_at match.
  const { data: invitation } = await db
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("email", user!.email!)
    .is("accepted_at", null)
    .maybeSingle();
  if (!invitation) return;

  const { data: existingMembership } = await db.from("memberships").select("id").eq("user_id", user!.id).maybeSingle();
  if (existingMembership) return; // already in an org — invitations are single-org

  const { error: insertError } = await db.from("memberships").insert({
    org_id: invitation.org_id,
    user_id: user!.id,
    role: invitation.role
  });
  if (insertError) return;

  await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);

  redirect("/builder");
}

export async function inviteMember(formData: FormData): Promise<void> {
  const current = await requireRole(["owner", "coordinator"]);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!email || (role !== "coordinator" && role !== "front_desk")) return;

  const db = createSupabaseServerClient();
  await db.from("invitations").insert({ org_id: current.organization.id, email, role });

  revalidatePath("/team");
}

export async function addSurgeon(formData: FormData): Promise<void> {
  const current = await requireRole(["owner", "coordinator"]);

  const fullName = String(formData.get("full_name") ?? "").trim();
  const npi = String(formData.get("npi") ?? "").trim();
  if (!fullName) return;

  const db = createSupabaseServerClient();
  await db.from("surgeons").insert({
    org_id: current.organization.id,
    full_name: fullName,
    npi: npi || null
  });

  revalidatePath("/team");
}

export async function deactivateSurgeon(formData: FormData): Promise<void> {
  const current = await requireRole(["owner", "coordinator"]);

  const surgeonId = String(formData.get("surgeon_id") ?? "");
  if (!surgeonId) return;

  const db = createSupabaseServerClient();
  await db.from("surgeons").update({ active: false }).eq("id", surgeonId).eq("org_id", current.organization.id);

  revalidatePath("/team");
}

/**
 * There is no live Stripe subscription — the payment link is a static,
 * fixed-price URL that does not auto-adjust as surgeon headcount changes
 * (see docs/STATUS-ROADMAP.md "Team Tier"). This records that the owner has
 * seen and updated payment for the current active-surgeon count, so
 * app/billing/page.tsx can warn when the count drifts again instead of
 * letting the invoiced amount silently fall out of sync with usage.
 */
export async function acknowledgeBillingUpdate(formData: FormData): Promise<void> {
  const current = await requireRole(["owner"]);

  const activeSurgeonCount = Number(formData.get("active_surgeon_count") ?? NaN);
  if (!Number.isInteger(activeSurgeonCount) || activeSurgeonCount < 0) return;

  const db = createSupabaseServerClient();
  await db
    .from("organizations")
    .update({
      last_acknowledged_surgeon_count: activeSurgeonCount,
      last_acknowledged_at: new Date().toISOString()
    })
    .eq("id", current.organization.id);

  revalidatePath("/billing");
}
