-- Follow-up to 20260725000005: teach the atomic import about `split_mode`.
--
-- `import_state` (20260725000006) names every `expenses` column explicitly, on
-- purpose — that is what stops a column added by a sibling migration from
-- breaking it. The cost is that a genuinely new column is not imported until it
-- is named, and `split_mode` landed in 20260725000005, one migration after the
-- import function was written. Without this, a localStorage import would store
-- NULL for every expense's split mode: not corruption (NULL is the column's
-- honest "intent not recorded" value, and the client falls back to
-- `inferSplitMode`), but it would silently discard intent the local data had.
--
-- `expenseToRow` already sends `split_mode` for every write path including this
-- one, so only the SQL needed changing.
--
-- This is a `create or replace` with an UNCHANGED signature, so the ACL set up in
-- 20260725000006 survives — including the explicit `revoke execute … from anon`.
-- Re-asserting the grants at the bottom anyway, because a signature change would
-- silently create a *second* overload with default Supabase privileges (EXECUTE
-- to anon), and a future editor of this file should see the grants next to the
-- function rather than have to know they were inherited.
--
-- Everything else — `security invoker` (LOAD-BEARING, never definer: every id in
-- the payload is caller-chosen and eight tables are in reach), deriving child
-- parent-ids from the rows this call inserted, the group-FK pre-check, and the
-- per-table count assertion that aborts a partial import — is unchanged from
-- 20260725000006, where the full rationale lives. Read that file first.

create or replace function public.import_state(
  p_friends         jsonb default '[]'::jsonb,
  p_groups          jsonb default '[]'::jsonb,
  p_group_members   jsonb default '[]'::jsonb,
  p_expenses        jsonb default '[]'::jsonb,
  p_expense_payers  jsonb default '[]'::jsonb,
  p_expense_splits  jsonb default '[]'::jsonb,
  p_settlements     jsonb default '[]'::jsonb,
  p_activity_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- Ids of the parent rows this call actually inserted. Child rows are attached
  -- to these and to nothing else (see below), which is the whole reason they are
  -- collected rather than trusted from the payload.
  v_group_ids   uuid[];
  v_expense_ids uuid[];

  v_n_friends        integer := 0;
  v_n_groups         integer := 0;
  v_n_group_members  integer := 0;
  v_n_expenses       integer := 0;
  v_n_payers         integer := 0;
  v_n_splits         integer := 0;
  v_n_settlements    integer := 0;
  v_n_events         integer := 0;

  v_counts jsonb;
  v_wanted jsonb;
  v_key    text;
begin
  -- Normalise once: a client that omits a bundle sends SQL NULL, and
  -- `jsonb_array_elements(NULL)` yields no rows silently while
  -- `jsonb_array_length(NULL)` yields NULL — coalescing keeps the two agreeing.
  p_friends         := coalesce(p_friends,         '[]'::jsonb);
  p_groups          := coalesce(p_groups,          '[]'::jsonb);
  p_group_members   := coalesce(p_group_members,   '[]'::jsonb);
  p_expenses        := coalesce(p_expenses,        '[]'::jsonb);
  p_expense_payers  := coalesce(p_expense_payers,  '[]'::jsonb);
  p_expense_splits  := coalesce(p_expense_splits,  '[]'::jsonb);
  p_settlements     := coalesce(p_settlements,     '[]'::jsonb);
  p_activity_events := coalesce(p_activity_events, '[]'::jsonb);

  -- ---------- 1. friends ----------
  -- `owner_id` is taken from the payload, NOT forced to auth.uid(): a payload
  -- claiming someone else's owner_id must be *rejected* by `friends_own`'s
  -- `with check` (42501), not silently rewritten into the caller's account.
  with ins as (
    insert into public.friends (id, owner_id, name, email, avatar, deleted_at, import_batch_id)
    select
      (x->>'id')::uuid,
      (x->>'owner_id')::uuid,
      coalesce(x->>'name', ''),
      coalesce(x->>'email', ''),
      coalesce(x->>'avatar', ''),
      (x->>'deleted_at')::timestamptz,
      (x->>'import_batch_id')::uuid
    from jsonb_array_elements(p_friends) as x
    returning id
  )
  select count(*) into v_n_friends from ins;

  -- ---------- 2. groups ----------
  with ins as (
    insert into public.groups (id, owner_id, name, avatar, deleted_at)
    select
      (x->>'id')::uuid,
      (x->>'owner_id')::uuid,
      coalesce(x->>'name', ''),
      coalesce(x->>'avatar', ''),
      (x->>'deleted_at')::timestamptz
    from jsonb_array_elements(p_groups) as x
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_group_ids from ins;
  v_n_groups := coalesce(array_length(v_group_ids, 1), 0);

  -- Group refs on `expenses` and `settlements` are real FKs, and an FK is not
  -- subject to RLS — so without this check a caller could file their own expense
  -- under *another* owner's group id and have it accepted. Both columns are
  -- resolved against `v_group_ids` below; raising first makes the rejection loud
  -- instead of quietly nulling the reference.
  --
  -- `activity_events.group_id` is deliberately NOT checked: it is a plain uuid
  -- with no FK, purely descriptive in the audit log, and `remapLocalState` maps it
  -- with `mapNullable` (not `mapGroupRef`), so an event about a group that is no
  -- longer in local state legitimately carries an id nothing else references.
  if exists (
    select 1
    from (
      select x->>'group_id' as gid from jsonb_array_elements(p_expenses) as x
      union all
      select x->>'group_id' as gid from jsonb_array_elements(p_settlements) as x
    ) r
    where r.gid is not null
      and not (r.gid::uuid = any(v_group_ids))
  ) then
    raise exception
      'import_state: a row references a group this import did not create — refusing to file it under a group that is not ours'
      using errcode = '23503';
  end if;

  -- ---------- 3. group_members ----------
  -- The group_id written is `g.id`, taken from the rows inserted in step 2, never
  -- the payload's own value: a crafted request cannot attach members to a group it
  -- did not just create (its rows fall out of the join, the count check below
  -- fires, and the whole transaction aborts).
  --
  -- No `on conflict`: the PK is (group_id, person_id), so a payload repeating a
  -- person raises 23505 exactly as the REST insert this replaces did. Swallowing
  -- that would hide a client bug rather than fix one.
  insert into public.group_members (group_id, person_id)
  select g.id, (x->>'person_id')::uuid
  from jsonb_array_elements(p_group_members) as x
  join unnest(v_group_ids) as g(id) on g.id = (x->>'group_id')::uuid;
  get diagnostics v_n_group_members = row_count;

  -- ---------- 4. expenses ----------
  -- Columns are named explicitly. `split_mode` is in the list as of this
  -- migration; anything added to `expenses` later must be added here too, or an
  -- imported expense silently takes the column default instead of the user's
  -- value. That is the standing cost of naming columns rather than relying on
  -- column order, and it is the right trade: the alternative breaks outright.
  with ins as (
    insert into public.expenses (
      id, owner_id, description, amount, paid_by, date,
      category, currency, group_id, notes, deleted_at, import_batch_id, split_mode
    )
    select
      (x->>'id')::uuid,
      (x->>'owner_id')::uuid,
      coalesce(x->>'description', ''),
      (x->>'amount')::numeric,
      (x->>'paid_by')::uuid,
      coalesce((x->>'date')::timestamptz, now()),
      coalesce(x->>'category', 'other'),
      coalesce(x->>'currency', 'USD'),
      -- Resolved through step 2's ids, so the stored value provably belongs to a
      -- group this transaction created. The check above already guaranteed a hit.
      (select g.id from unnest(v_group_ids) as g(id) where g.id = (x->>'group_id')::uuid),
      x->>'notes',
      (x->>'deleted_at')::timestamptz,
      (x->>'import_batch_id')::uuid,
      -- NULL when the key is absent or JSON null, which is exactly the "intent
      -- not recorded" value the column is designed around. The CHECK on the
      -- column permits NULL, so an import that carries no mode is legal.
      x->>'split_mode'
    from jsonb_array_elements(p_expenses) as x
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_expense_ids from ins;
  v_n_expenses := coalesce(array_length(v_expense_ids, 1), 0);

  -- ---------- 5/6. expense children ----------
  -- Same derivation as group_members: `e.id` comes from step 4, not the payload.
  insert into public.expense_payers (expense_id, person_id, amount)
  select e.id, (x->>'person_id')::uuid, (x->>'amount')::numeric
  from jsonb_array_elements(p_expense_payers) as x
  join unnest(v_expense_ids) as e(id) on e.id = (x->>'expense_id')::uuid;
  get diagnostics v_n_payers = row_count;

  insert into public.expense_splits (expense_id, person_id, amount)
  select e.id, (x->>'person_id')::uuid, (x->>'amount')::numeric
  from jsonb_array_elements(p_expense_splits) as x
  join unnest(v_expense_ids) as e(id) on e.id = (x->>'expense_id')::uuid;
  get diagnostics v_n_splits = row_count;

  -- ---------- 7. settlements ----------
  insert into public.settlements (
    id, owner_id, from_person_id, to_person_id, amount, currency, date, group_id, deleted_at
  )
  select
    (x->>'id')::uuid,
    (x->>'owner_id')::uuid,
    (x->>'from_person_id')::uuid,
    (x->>'to_person_id')::uuid,
    (x->>'amount')::numeric,
    coalesce(x->>'currency', 'USD'),
    coalesce((x->>'date')::timestamptz, now()),
    (select g.id from unnest(v_group_ids) as g(id) where g.id = (x->>'group_id')::uuid),
    (x->>'deleted_at')::timestamptz
  from jsonb_array_elements(p_settlements) as x;
  get diagnostics v_n_settlements = row_count;

  -- ---------- 8. activity_events ----------
  -- The step no compensating delete could ever undo: `activity_events` is
  -- append-only (20260724000001 dropped its UPDATE/DELETE policies), which is why
  -- this whole function exists rather than a batch-tag-and-clean-up.
  --
  -- `nullif(…, 'null'::jsonb)` because the client serialises an absent before/after
  -- as JSON null, and a jsonb column would otherwise store the JSON null *value*
  -- where the REST insert stored SQL NULL.
  insert into public.activity_events (
    id, owner_id, actor_id, action, entity_type, entity_id, group_id, before, after, created_at
  )
  select
    (x->>'id')::uuid,
    (x->>'owner_id')::uuid,
    (x->>'actor_id')::uuid,
    x->>'action',
    x->>'entity_type',
    (x->>'entity_id')::uuid,
    (x->>'group_id')::uuid,
    nullif(x->'before', 'null'::jsonb),
    nullif(x->'after', 'null'::jsonb),
    coalesce((x->>'created_at')::timestamptz, now())
  from jsonb_array_elements(p_activity_events) as x;
  get diagnostics v_n_events = row_count;

  -- ---------- all-or-nothing check ----------
  -- The RPC equivalent of `expectRowsAffected`, for eight tables at once: what we
  -- inserted must equal what we were given, table by table. The three child
  -- inserts above can legitimately produce fewer rows than the payload (a row
  -- whose parent is not ours falls out of the join), and this is what turns that
  -- into an abort rather than a quietly-shorter import. The parent inserts cannot
  -- drop rows silently — RLS raises 42501 and a duplicate id raises 23505 — but
  -- they are checked too, so no table is trusted to be the exception.
  --
  -- Raising here rolls the entire transaction back, which is the point: the client
  -- also compares these counts against what it sent, but a client-side check can
  -- only ever fire *after* a commit, and by then the rows would be in the account.
  v_counts := jsonb_build_object(
    'friends',        v_n_friends,
    'groups',         v_n_groups,
    'group_members',  v_n_group_members,
    'expenses',       v_n_expenses,
    'expense_payers', v_n_payers,
    'expense_splits', v_n_splits,
    'settlements',    v_n_settlements,
    'activity_events', v_n_events
  );
  v_wanted := jsonb_build_object(
    'friends',        jsonb_array_length(p_friends),
    'groups',         jsonb_array_length(p_groups),
    'group_members',  jsonb_array_length(p_group_members),
    'expenses',       jsonb_array_length(p_expenses),
    'expense_payers', jsonb_array_length(p_expense_payers),
    'expense_splits', jsonb_array_length(p_expense_splits),
    'settlements',    jsonb_array_length(p_settlements),
    'activity_events', jsonb_array_length(p_activity_events)
  );

  for v_key in select jsonb_object_keys(v_wanted) loop
    if (v_counts->>v_key)::integer <> (v_wanted->>v_key)::integer then
      raise exception
        'import_state: inserted % of % % row(s) — refusing to commit a partial import',
        v_counts->>v_key, v_wanted->>v_key, v_key
        using errcode = '23503';
    end if;
  end loop;

  return v_counts;
end;
$$;

-- Signed-in users only. Note the third statement: `revoke … from public` does NOT
-- remove a grant held by a *named* role, and Supabase ships
-- `alter default privileges … grant execute on functions to anon, authenticated`
-- for the public schema, so `anon` is granted EXECUTE by name the moment the
-- function is created. That is what 20260725000004 had to go back and fix for the
-- two earlier RPCs; do it inline here.
revoke all on function public.import_state(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.import_state(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated, service_role;
revoke execute on function public.import_state(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from anon;
