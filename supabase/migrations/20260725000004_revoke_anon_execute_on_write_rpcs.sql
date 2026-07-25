-- Take EXECUTE on the two write RPCs away from `anon`.
--
-- `20260725000002` and `20260725000003` both end with
-- `revoke all on function … from public` followed by a grant to
-- `authenticated, service_role`, intending "signed-in callers only". Verified
-- against the hosted project after applying them, the ACL was actually:
--
--   postgres=X/postgres anon=X/postgres authenticated=X/postgres service_role=X/postgres
--
-- `anon` still held EXECUTE. Revoking PUBLIC does not remove a grant held by a
-- *named* role, and Supabase ships `alter default privileges … grant execute on
-- functions to anon, authenticated` for the public schema, so every new function
-- is granted to `anon` explicitly at creation time. The revoke never applied to it.
--
-- This was **not** exploitable: `security invoker` means the body runs as the
-- caller, `auth.uid()` is null for `anon`, and every policy involved compares
-- against it, so an anonymous call is rejected by RLS before it can write
-- anything (confirmed live — an anon call returned 42501 and created no row).
-- The point of this migration is that the granted privilege contradicted the
-- documented intent, and defence in depth should not rest on the argument above
-- staying true: any later policy that admits `anon` for some legitimate read
-- would silently hand it these write entry points too.
--
-- Revoke from `anon` by name. PUBLIC and the other roles are left as the earlier
-- migrations set them.

revoke execute on function public.update_expense_with_children(jsonb, jsonb, jsonb) from anon;
revoke execute on function public.update_group_with_members(jsonb, jsonb) from anon;
