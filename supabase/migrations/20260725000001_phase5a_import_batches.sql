-- Phase 5a: CSV import batches.
--
-- An import creates many rows at once from a file the user did not hand-enter,
-- so it needs to be undoable *wholesale* rather than row by row. Every row an
-- import creates carries the batch id; undo works off that tag.
--
-- The batch row is never deleted on undo, only stamped `undone_at`: it is the
-- audit record of what was imported and when. `activity_events` is append-only
-- (see the 4b migration), so an undo appends an `import.undo` event rather than
-- retracting the original `import.create`.

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- 'csv' today; 'screenshot' when §5.2 phase B lands on this same pipeline.
  source text not null default 'csv',
  filename text not null default '',
  expense_count integer not null default 0,
  friend_count integer not null default 0,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index import_batches_owner_idx on public.import_batches (owner_id, created_at desc);

-- `on delete set null`, not cascade: dropping a batch record must never take the
-- user's expenses with it. Undo deletes the rows explicitly and deliberately.
alter table public.expenses
  add column import_batch_id uuid references public.import_batches(id) on delete set null;
alter table public.friends
  add column import_batch_id uuid references public.import_batches(id) on delete set null;

-- Partial indexes: only imported rows carry a batch id, and undo is the only
-- reader, so indexing the (large) hand-entered majority would be dead weight.
create index expenses_import_batch_idx on public.expenses (import_batch_id)
  where import_batch_id is not null;
create index friends_import_batch_idx on public.friends (import_batch_id)
  where import_batch_id is not null;

-- ---------- RLS ----------
alter table public.import_batches enable row level security;
create policy "import_batches_own" on public.import_batches
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
