import { createSupabaseAuthServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { Invitation, Membership, MembershipRole, Organization } from "@/lib/supabase/types";

export interface CurrentMembership {
  userId: string;
  userEmail: string;
  membership: Membership;
  organization: Organization;
}

/**
 * Resolves the signed-in user's org membership. A user can belong to at most
 * one org (single-practice model) — returns null if unauthenticated or the
 * user hasn't created/joined an org yet (send them to /onboarding).
 */
export async function getCurrentMembership(): Promise<CurrentMembership | null> {
  const authClient = createSupabaseAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user || !user.email) return null;

  const db = createSupabaseServerClient();
  const { data: membership } = await db
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return null;

  const { data: organization } = await db
    .from("organizations")
    .select("*")
    .eq("id", membership.org_id)
    .maybeSingle();

  if (!organization) return null;

  return { userId: user.id, userEmail: user.email, membership, organization };
}

/**
 * Looks up the oldest pending invitation matching this email. Membership is
 * NOT granted here — invite acceptance requires an explicit click on
 * /invite/accept (see lib/actions/org.ts acceptInvitation). Auto-joining
 * purely on an email match is a known access-control failure class (a
 * departed employee's forwarded/catch-all inbox, or a wrong email typed by
 * the inviter, would otherwise silently grant org membership).
 */
export async function getPendingInvitation(email: string): Promise<Invitation | null> {
  const db = createSupabaseServerClient();
  const { data: invitation } = await db
    .from("invitations")
    .select("*")
    .eq("email", email)
    .is("accepted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return invitation ?? null;
}

/**
 * Where an authenticated user with no org membership should land: an explicit
 * accept screen if they have a pending invite, otherwise onboarding to create
 * a new org. Returns null if the user is already a member of an org.
 */
export async function resolveNoMembershipDestination(
  userId: string,
  email: string
): Promise<"/invite/accept" | "/onboarding" | null> {
  const db = createSupabaseServerClient();
  const { data: existing } = await db.from("memberships").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return null;

  const invitation = await getPendingInvitation(email);
  return invitation ? "/invite/accept" : "/onboarding";
}

export class RoleError extends Error {
  constructor(message = "Insufficient permissions for this action") {
    super(message);
    this.name = "RoleError";
  }
}

/** Throws RoleError unless the current user's role is in `allowed`. Use in Server Actions/routes gating owner/coordinator-only mutations. */
export async function requireRole(allowed: MembershipRole[]): Promise<CurrentMembership> {
  const current = await getCurrentMembership();
  if (!current) throw new RoleError("Not a member of any organization");
  if (!allowed.includes(current.membership.role)) {
    throw new RoleError(`Role '${current.membership.role}' cannot perform this action`);
  }
  return current;
}
