-- Enforce single-org-per-user at the DB level.
--
-- acceptInvitation (lib/actions/org.ts) does a check-then-insert (look up any
-- existing membership, then insert if none found) with no DB-level backstop.
-- Two concurrent accept calls for the same user against different orgs both
-- pass the check and both insert under the old UNIQUE (org_id, user_id)
-- constraint, leaving the user with 2+ memberships. getCurrentMembership()
-- (lib/auth/org.ts) does .maybeSingle() on user_id, which errors on multiple
-- rows -- so a double-accept silently locks the user out of the app.
--
-- Replacing the constraint with UNIQUE (user_id) makes the second concurrent
-- insert fail cleanly (a Postgres unique-violation the caller can surface as
-- "invitation already accepted") instead of succeeding twice.

ALTER TABLE public.memberships DROP CONSTRAINT memberships_org_id_user_id_key;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_key UNIQUE (user_id);
