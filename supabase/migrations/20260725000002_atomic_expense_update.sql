-- P4 fix: make editing an expense atomic.
--
-- Editing an expense means *replacing* its payer and split rows, and the client
-- could only do that as four separate REST calls: upsert parent, delete payers,
-- delete splits, re-insert both. Each call is its own transaction, so a failure
-- after the deletes (dropped connection, RLS hiccup, tab closed) left the
-- expense alive with ZERO splits — the debt silently disappeared on the next
-- fetch, while the client had already rolled its in-memory snapshot back and
-- told the user the change "was undone". It was not undone; it was half applied.
--
-- Postgres transactions are not reachable over the REST API, but a function body
-- is one: every statement below runs in a single transaction, so the replace
-- either lands whole or not at all. No amount of client-side reordering can
-- give that guarantee.
--
-- ---------- why `security invoker` (and never definer) ----------
--
-- The tables this touches are RLS-gated on the caller's identity: `expenses_own`
-- checks `owner_id = auth.uid()`, and `expense_payers_via_parent` /
-- `expense_splits_via_parent` check the *parent* expense's `owner_id` (see the
-- 4a migration). `security invoker` (the default, spelled out here because it is
-- load-bearing) keeps `auth.uid()` equal to the calling user, so every statement
-- inside the body is filtered by those same policies — this function grants no
-- authority the caller did not already have; it only makes their own write
-- atomic.
--
-- `security definer` would run the body as the function owner, which bypasses
-- RLS, and since the target expense id is chosen by the caller that would be a
-- direct cross-tenant write primitive: anyone could rewrite anyone's splits.
-- Atomicity needs a single transaction, not elevated privileges, so definer
-- would buy nothing and cost the tenant boundary. Do not "fix" a permission
-- error here by switching to definer — a permission error means RLS is working.

create function public.update_expense_with_children(
  p_expense jsonb,
  p_payers jsonb default '[]'::jsonb,
  p_splits jsonb default '[]'::jsonb
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
  -- deliberately absent from the DO UPDATE list: an existing expense can never
  -- be re-owned through this function. On the insert path RLS's `with check`
  -- rejects any owner_id other than auth.uid(); on the conflict path Postgres
  -- applies the UPDATE policy's `using` clause to the existing row and *raises*
  -- rather than silently skipping it, so someone else's expense id fails loudly.
  insert into public.expenses as t (
    id, owner_id, description, amount, paid_by, date,
    category, currency, group_id, notes, deleted_at, import_batch_id
  )
  values (
    (p_expense->>'id')::uuid,
    (p_expense->>'owner_id')::uuid,
    coalesce(p_expense->>'description', ''),
    (p_expense->>'amount')::numeric,
    (p_expense->>'paid_by')::uuid,
    coalesce((p_expense->>'date')::timestamptz, now()),
    coalesce(p_expense->>'category', 'other'),
    coalesce(p_expense->>'currency', 'USD'),
    (p_expense->>'group_id')::uuid,
    p_expense->>'notes',
    (p_expense->>'deleted_at')::timestamptz,
    (p_expense->>'import_batch_id')::uuid
  )
  on conflict (id) do update set
    description     = excluded.description,
    amount          = excluded.amount,
    paid_by         = excluded.paid_by,
    date            = excluded.date,
    category        = excluded.category,
    currency        = excluded.currency,
    group_id        = excluded.group_id,
    notes           = excluded.notes,
    deleted_at      = excluded.deleted_at,
    import_batch_id = excluded.import_batch_id
  returning t.id into v_id;

  -- Belt and braces: a write that touched nothing must not read as success.
  -- The caller treats a null return the same way it treats a zero-row REST
  -- write — as a thrown error to roll back and surface.
  if v_id is null then
    return null;
  end if;

  -- Full replace, not a merge: shares removed in the editor must disappear.
  -- Zero rows deleted is legitimate (an expense with no recorded payers).
  delete from public.expense_payers where expense_id = v_id;
  delete from public.expense_splits where expense_id = v_id;

  -- `v_id` is used for expense_id rather than whatever the child payload says,
  -- so a crafted request cannot attach children to a *different* expense.
  insert into public.expense_payers (expense_id, person_id, amount)
  select v_id, (x->>'person_id')::uuid, (x->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_payers, '[]'::jsonb)) as x;

  insert into public.expense_splits (expense_id, person_id, amount)
  select v_id, (x->>'person_id')::uuid, (x->>'amount')::numeric
  from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) as x;

  return v_id;
end;
$$;

-- Signed-in users only. `anon` could not get past RLS anyway, but there is no
-- reason to expose the entry point to it. `service_role` keeps access because
-- the default PUBLIC grant is revoked below.
revoke all on function public.update_expense_with_children(jsonb, jsonb, jsonb) from public;
grant execute on function public.update_expense_with_children(jsonb, jsonb, jsonb)
  to authenticated, service_role;
