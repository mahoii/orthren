-- Team-tier stack: organizations, roles, surgeons, invitations, PA usage metering.
-- No PHI is stored — pa_cases holds metadata only (hashed patient name, never raw).

CREATE TABLE public.organizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  stripe_customer_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.memberships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'coordinator', 'front_desk')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE public.surgeons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  npi text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'coordinator', 'front_desk')),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Usage metering: one row per successful non-demo generation. Metadata only —
-- never the letter text, chart text, or raw patient name.
CREATE TABLE public.pa_cases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  surgeon_id uuid NOT NULL REFERENCES public.surgeons(id),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  cpt_code text NOT NULL,
  payer text,
  pa_strength numeric,
  patient_name_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX idx_surgeons_org_id ON public.surgeons(org_id);
CREATE INDEX idx_invitations_email ON public.invitations(email) WHERE accepted_at IS NULL;
CREATE INDEX idx_pa_cases_org_surgeon ON public.pa_cases(org_id, surgeon_id, created_at);

-- SECURITY DEFINER helpers avoid infinite-recursion when memberships references
-- itself in its own RLS policy.
CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = target_org_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(target_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = target_org_id AND m.user_id = auth.uid() AND m.role = 'owner'
  );
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pa_cases ENABLE ROW LEVEL SECURITY;

-- All application access goes through the service-role server client
-- (bypasses RLS) except the browser-side OTP session exchange, per
-- .claude/CLAUDE.md conventions. These policies are defense-in-depth so a
-- leaked anon-key/authenticated request can never cross an org boundary.

CREATE POLICY "service_role_only" ON public.organizations
  USING (auth.role() = 'service_role');
CREATE POLICY "members_read_own_org" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id));

CREATE POLICY "service_role_only" ON public.memberships
  USING (auth.role() = 'service_role');
CREATE POLICY "members_read_own_org_memberships" ON public.memberships
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE POLICY "service_role_only" ON public.surgeons
  USING (auth.role() = 'service_role');
CREATE POLICY "members_read_own_org_surgeons" ON public.surgeons
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

CREATE POLICY "service_role_only" ON public.invitations
  USING (auth.role() = 'service_role');
CREATE POLICY "owners_read_own_org_invitations" ON public.invitations
  FOR SELECT TO authenticated USING (public.is_org_owner(org_id));

CREATE POLICY "service_role_only" ON public.pa_cases
  USING (auth.role() = 'service_role');
CREATE POLICY "members_read_own_org_pa_cases" ON public.pa_cases
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- anon has no legitimate use for these helpers (all app access is service-role
-- or authenticated); revoke to keep the RPC surface minimal.
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid) FROM anon;
