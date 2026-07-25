-- P4 fix: make editing a group atomic.
--
-- Same bug as the expense edit fixed in 20260725000002, one table over. Editing a
-- group means *replacing* its member rows, and the client could only do that as
-- three separate REST calls: upsert the group, delete `group_members`, re-insert
-- them. Each call is its own transaction, so a failure landing after the delete
-- (dropped connection, RLS hiccup, tab closed) left the group alive with ZERO
-- members — every balance computed from that group silently emptied out on the
-- next fetch, while the client had already rolled its in-memory snapshot back and
-- told the user the change "was undone". It was not undone; it was half applied.
--
-- A function body is one transaction, which the REST API cannot give us, so the
-- replace either lands whole or not at all.
--
-- ---------- why `security invoker` (and never definer) ----------
--
-- Identical reasoning to `update_expense_with_children`, and the RLS shape it
-- relies on is identical too — worth stating because it is not obvious that the
-- group tables mirror the expense ones. From the 4a migration: `groups_own` is
-- `for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())`, and
-- `group_members_via_parent` gates the child table on the *parent* group's
-- `owner_id` via an `exists` subquery — exactly how `expense_splits_via_parent`
-- gates splits. So `security invoker` (the default, spelled out because it is
-- load-bearing) keeps `auth.uid()` as the calling user and every statement below
-- stays filtered by those policies: this function grants no authority the caller
-- did not already have, it only makes their own write atomic.
--
-- `security definer` would run the body as the function owner and bypass RLS.
-- Since the group id comes from the caller, that would be a direct cross-tenant
-- write primitive: anyone could rewrite anyone's membership. Atomicity needs a
-- single transaction, not elevated privileges. Do not "fix" a permission error
-- here by switching to definer — a permission error means RLS is working.

create function public.update_group_with_members(
  p_group jsonb,
  p_members jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Upsert the parent. `owner_id` is only supplied on the insert path and is
  -- deliberately absent from the DO UPDATE list: an existing group can never be
  -- re-owned through this function. On the insert path RLS's `with check` rejects
  -- any owner_id other than auth.uid(); on the conflict path Postgres applies the
  -- UPDATE policy's `using` clause to the existing row and *raises* rather than
  -- silently skipping it, so someone else's group id fails loudly.
  insert into public.groups as t (id, owner_id, name, avatar, deleted_at)
  values (
    (p_group->>'id')::uuid,
    (p_group->>'owner_id')::uuid,
    coalesce(p_group->>'name', ''),
    coalesce(p_group->>'avatar', ''),
    (p_group->>'deleted_at')::timestamptz
  )
  on conflict (id) do update set
    name       = excluded.name,
    avatar     = excluded.avatar,
    deleted_at = excluded.deleted_at
  returning t.id into v_id;

  -- Belt and braces: a write that touched nothing must not read as success.
  -- The caller treats a null return the same way it treats a zero-row REST
  -- write — as a thrown error to roll back and surface.
  if v_id is null then
    return null;
  end if;

  -- Full replace, not a merge: members removed in the editor must disappear.
  -- Zero rows deleted is legitimate (a group with no members recorded yet).
  delete from public.group_members where group_id = v_id;

  -- `v_id` is used for group_id rather than whatever the child payload says, so a
  -- crafted request cannot attach members to a *different* group.
  --
  -- No `on conflict` clause, on purpose: `group_members`'s primary key is
  -- (group_id, person_id), so a payload repeating the same person raises 23505 —
  -- exactly what the REST insert this replaces did. Swallowing it here would hide
  -- a client-side bug rather than fix one.
  insert into public.group_members (group_id, person_id)
  select v_id, (x->>'person_id')::uuid
  from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as x;

  return v_id;
end;
$$;

-- Signed-in users only. `anon` could not get past RLS anyway, but there is no
-- reason to expose the entry point to it. `service_role` keeps access because
-- the default PUBLIC grant is revoked below.
revoke all on function public.update_group_with_members(jsonb, jsonb) from public;
grant execute on function public.update_group_with_members(jsonb, jsonb)
  to authenticated, service_role;
