-- Phase 4b: make activity_events genuinely append-only.
--
-- Phase 4a shipped a single `for all` policy on activity_events, matching the
-- pattern used for friends/groups/expenses/settlements. Those are mutable user
-- data, so `for all` is right for them — but activity_events is the audit log
-- that records what happened to them. Granting UPDATE and DELETE there lets the
-- actor being audited rewrite or erase their own trail, which defeats the point
-- of keeping one, and it contradicted the table's own "(append-only audit log)"
-- comment in the 4a migration.
--
-- No client code is affected: supabaseStore only ever inserts into and selects
-- from this table (insertActivityEvent / fetchAll), never updates or deletes.
--
-- With RLS enabled, an operation with no matching policy is denied, so omitting
-- UPDATE and DELETE policies is what blocks them. Deleting an account still
-- clears its events through the `owner_id ... on delete cascade` FK, which is a
-- table-level action and not subject to RLS.

drop policy if exists "activity_events_own" on public.activity_events;

create policy "activity_events_select_own" on public.activity_events
  for select using (owner_id = auth.uid());

create policy "activity_events_insert_own" on public.activity_events
  for insert with check (owner_id = auth.uid());
