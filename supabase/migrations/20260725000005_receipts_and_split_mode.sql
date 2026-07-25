-- Wave 3: two user-decided features.
--
--   1. Receipt attachments stored in Postgres (no Storage bucket).
--   2. `expenses.split_mode` — recording the *intent* behind a split, not just
--      the resolved per-person amounts.
--
-- Both land in one migration because both have to touch
-- `update_expense_with_children` (feature 2 adds a column it writes; feature 1
-- deliberately does not, see below), and migrations are append-only.


-- =====================================================================
-- 1. expense_receipts — image bytes in the database
-- =====================================================================
--
-- Why a separate table and not a column on `expenses`: the client fetches
-- *every* expense row on startup (`fetchAll`), so bytes living on the expense
-- row would be dragged into every page load. A child table is fetched lazily —
-- only `expense_id, mime_type, byte_size, created_at` come down with the initial
-- load (a few bytes a row, enough to know a receipt exists), and `data_base64`
-- is read one row at a time when the user actually opens a receipt.
--
-- Why base64 text and not `bytea`: PostgREST renders `bytea` as `\x`-prefixed
-- hex, which is 2x inflation over the wire and needs client-side decoding.
-- Base64 is 1.33x and drops straight into `<img src="data:image/jpeg;base64,…">`.
-- The stored value carries NO `data:` prefix — the client builds it from
-- `mime_type` at render time, so the column stays pure payload.
--
-- One receipt per expense (`expense_id` is the primary key): the UI replaces
-- rather than appends. `on delete cascade` means purging an expense — including
-- the wholesale hard-delete an import undo performs — takes its receipt with it.
create table public.expense_receipts (
  expense_id  uuid primary key references public.expenses(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  mime_type   text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  -- 512 KB. A real server-side guard, not a mirror of the client's own limit:
  -- the free tier is 500 MB, so a client bug looping on uploads could otherwise
  -- fill the database. The client downscales to fit this before it ever asks.
  byte_size   integer not null check (byte_size > 0 and byte_size <= 524288),
  data_base64 text not null,
  created_at  timestamptz not null default now(),
  -- `byte_size` is a number the *client* sends, so on its own it guards nothing
  -- against a hostile caller: they could claim 1024 and post 10 MB of base64.
  -- This second check constrains the payload actually stored. 699052 =
  -- ceil(524288 / 3) * 4, the base64 length of a 512 KB image.
  constraint expense_receipts_payload_size_chk
    check (octet_length(data_base64) > 0 and octet_length(data_base64) <= 699052)
);

create index expense_receipts_owner_idx on public.expense_receipts (owner_id);

-- RLS, spelled the way 20260719000001 spells it: one `for all` policy anchored to
-- `auth.uid()`, with `with check` written out even though `using` alone would be
-- applied to new rows as well (see docs/RLS_AUDIT.md — explicit is cheaper to
-- audit than a semantics lookup).
--
-- The parent-ownership `exists` is defence in depth on top of `owner_id`, and it
-- is not redundant: foreign keys are validated by the system, *not* through RLS,
-- so without it a user who learned another owner's expense id could park a row
-- of their own bytes against it (unreadable to either party, but wasted space
-- and a confusing orphan). This is the same shape `expense_splits_via_parent`
-- and `expense_payers_via_parent` already use one table over.
alter table public.expense_receipts enable row level security;
create policy "expense_receipts_own" on public.expense_receipts
  for all
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()
    )
  );


-- =====================================================================
-- 2. expenses.split_mode — the intent behind the amounts
-- =====================================================================
--
-- An expense stores resolved per-person amounts only, so reopening one for edit
-- had to *guess* the mode that produced them (`inferSplitMode`): a 60/40
-- percentage split came back as `exact` with the right numbers and no intent.
--
-- The CHECK mirrors the `SplitMode` union in jsapps/src/services/splitEngine.ts.
--
-- ---------- nullable, rather than `default 'exact'` ----------
--
-- Backfilling existing rows with 'exact' would be lossless for the *amounts* but
-- it would destroy the one thing today's fallback still gets right: a genuinely
-- equal split is recovered as `equal`, which keeps the form rebalancing when the
-- total is edited. A defaulted 'exact' is indistinguishable from a recorded
-- 'exact', so the client could no longer tell "no intent recorded" from "exact
-- was chosen", and every pre-migration equal split would seed as exact.
--
-- NULL says exactly what is true: intent unknown. The client falls back to
-- `inferSplitMode` for those rows, which is also the right answer for 5A CSV
-- imports (they insert into `expenses` directly and record no mode). Inferring
-- the mode in SQL for the backfill was considered and rejected: percentages and
-- shares are not recoverable from resolved cents at all (60/40 and exact-24/16
-- are the same rows), so the SQL would only ever have reproduced the `equal`
-- check the client already does — cost with no new information.
alter table public.expenses
  add column split_mode text
  constraint expenses_split_mode_chk
    check (split_mode is null or split_mode in ('equal','exact','percentage','shares','adjustment'));

comment on column public.expenses.split_mode is
  'Split intent recorded at write time. NULL = unknown (row predates this column, or came from a CSV import); the client then infers a mode from the resolved amounts.';


-- =====================================================================
-- 3. update_expense_with_children — teach it the new column
-- =====================================================================
--
-- Both `insertExpense` and `updateExpense` go through this one function, so
-- `split_mode` would be silently dropped on every write if it were not added
-- here. Body is otherwise byte-for-byte the 20260725000002 version.
--
-- `security invoker` is LOAD-BEARING — never definer. The expense id is chosen
-- by the caller, so a definer version (which bypasses RLS) would be a
-- cross-tenant write primitive: anyone could rewrite anyone's splits. Atomicity
-- needs a single transaction, not elevated privileges. A permission error from
-- this function means RLS is doing its job; do not "fix" it with definer.
-- The full argument is in 20260725000002.
--
-- On the conflict path `split_mode` is coalesced onto the stored value rather
-- than overwritten blindly: every UI write sends the mode, but a caller that
-- omits the key (an older client, a script) should not erase intent that was
-- already recorded. Sending a mode always wins; omitting it preserves.
create or replace function public.update_expense_with_children(
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
    category, currency, group_id, notes, deleted_at, import_batch_id, split_mode
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
    (p_expense->>'import_batch_id')::uuid,
    p_expense->>'split_mode'
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
    import_batch_id = excluded.import_batch_id,
    split_mode      = coalesce(excluded.split_mode, t.split_mode)
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

-- `create or replace` keeps the existing ACL, but re-stating it costs nothing and
-- means this file describes the end state on its own. Note (from
-- 20260725000004) that `revoke … from public` does NOT remove `anon`'s grant:
-- Supabase's default privileges grant EXECUTE to `anon` *by name*, so it has to
-- be revoked by name too.
revoke all on function public.update_expense_with_children(jsonb, jsonb, jsonb) from public;
revoke execute on function public.update_expense_with_children(jsonb, jsonb, jsonb) from anon;
grant execute on function public.update_expense_with_children(jsonb, jsonb, jsonb)
  to authenticated, service_role;
