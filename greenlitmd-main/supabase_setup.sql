CREATE TABLE public.waitlist_signups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text,
  phone text,
  practice_name text,
  email_stage integer DEFAULT 1,
  unsubscribed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (all API access is server-side)
CREATE POLICY "service_role_only" ON public.waitlist_signups
  USING (auth.role() = 'service_role');

-- public.waitlist (legacy/duplicate signup table, still live in prod — RLS was
-- enabled with only an anon INSERT policy and no service_role_only policy for
-- SELECT/UPDATE/DELETE). Adding the same defense-in-depth policy used on
-- waitlist_signups; this is additive and does not remove the existing
-- "Allow public inserts" policy anon relies on for the signup form.
CREATE POLICY "service_role_only" ON public.waitlist
  USING (auth.role() = 'service_role');
