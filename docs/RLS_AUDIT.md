# RLS Audit

Phase 7 (P3) item: *"4b tightened `activity_events` only. The other tables still
use broad `for all` policies, which is correct for mutable user data but has not
been audited as a whole."* This is that audit.

**Scope:** every table created by `supabase/migrations/**`, read in filename
order, cross-checked against what the client actually issues
(`jsapps/src/services/supabaseStore.ts`, `jsapps/src/context/AppContext.tsx`).
Source analysis only — no database was contacted, so see
[What I could not determine](#what-i-could-not-determine-without-database-access)
before treating any of this as a statement about production.

---

## Verdict

**No. Nothing in `supabase/migrations/**` is exploitable right now.** All ten
tables have RLS enabled, every policy is anchored to `auth.uid()`, and there is
no policy under which an authenticated user can read or write another user's
row. I could not construct a working cross-tenant request against the live
policy set.

Two things are worth the reader's time anyway:

1. **The specific hole this audit was told to look for does not exist here, and
   could not have** — see [the `with check` question](#the-with-check-question).
   That premise is worth correcting so nobody re-audits on it.
2. ~~**The real risk is not a policy, it is a file.**~~ **Fixed on 2026-07-25** —
   `jsapps/supabase/migrations/` held the Bolt-era schema from upstream
   `a8266c6`: a *different, conflicting* `public` schema whose policies were
   materially weaker than the live ones, which the README's own local-setup
   command would apply if run from the directory the README told you to `cd` into.
   The directory is deleted and `supabase/config.toml` now pins the migrations
   path at the repo root, so cwd no longer decides. Finding 1, and it was the only
   finding above low severity.

Findings: **0 exploitable now**, ~~1 repo hazard (medium)~~ **fixed**, **4 defence
in depth (low)**, **3 informational**.

---

## The `with check` question

The roadmap note and the usual advice about `for all` policies both point at the
same suspected hole: a `using`-only policy lets a row be *written* into a state
the policy would have refused, e.g. `update ... set owner_id = <someone else>`.

**In PostgreSQL that is not true.** From the `CREATE POLICY` reference, on
`WITH CHECK`:

> For policies that can have both `USING` and `WITH CHECK` expressions (`ALL` and
> `UPDATE`), if no `WITH CHECK` expression is defined, then the `USING`
> expression will be used both to determine which rows are visible (normal
> `USING` case) and which new rows will be allowed to be added (`WITH CHECK`
> case).

So on `for all` and `for update`, omitting `with check` does not open a write
path — the `using` expression is applied to the new row too. Omitting it is a
readability and intent problem, not a vulnerability. The genuine `with check`
trap is narrower: a policy written `for insert` cannot have `using` at all, and a
table whose *only* policy is `for select using (...)` grants no write path
whatever.

This matters twice over. It is why the Bolt-era policies in Finding 1 are bad for
other reasons rather than this one; and it means **every writable table here is
doubly covered** — 4a spells out `with check` explicitly on all seven mutable
tables even though `using` alone would have sufficed. That is the right call:
explicit is cheaper to audit than a semantics lookup.

---

## Per-table

`ea` = `owner_id = auth.uid()`. "Parent-owned" = `exists (select 1 from <parent> p
where p.id = <child fk> and p.owner_id = auth.uid())`.

| Table | RLS enabled | Policies | `using` | `with check` | Verdict |
|---|---|---|---|---|---|
| `profiles` | yes (4a:128) | `profiles_select_own` (select), `profiles_update_own` (update) | `id = auth.uid()` | `id = auth.uid()` (update) | Correct. No insert policy — rows come from the `handle_new_user` trigger, which is `security definer` and so bypasses RLS. No delete policy, so delete is denied; account removal is `auth.users` cascade. |
| `friends` | yes (4a:134) | `friends_own` (all) | `ea` | `ea` | Correct. |
| `groups` | yes (4a:138) | `groups_own` (all) | `ea` | `ea` | Correct. |
| `group_members` | yes (4a:142) | `group_members_via_parent` (all) | parent-owned via `groups` | same | Correct; cannot be orphaned or re-parented. See [child tables](#child-tables-are-genuinely-constrained). |
| `expenses` | yes (4a:148) | `expenses_own` (all) | `ea` | `ea` | Correct for `owner_id`. `group_id` / `import_batch_id` are not ownership-checked — Finding 3. |
| `expense_payers` | yes (4a:152) | `expense_payers_via_parent` (all) | parent-owned via `expenses` | same | Correct. |
| `expense_splits` | yes (4a:158) | `expense_splits_via_parent` (all) | parent-owned via `expenses` | same | Correct. |
| `settlements` | yes (4a:164) | `settlements_own` (all) | `ea` | `ea` | Correct for `owner_id`; `group_id` as per Finding 3. |
| `activity_events` | yes (4a:168) | 4a's `activity_events_own` dropped by 4b; now `activity_events_select_own` (select) + `activity_events_insert_own` (insert) | `ea` (select) | `ea` (insert) | Append-only as intended: no update/delete policy, and with RLS on, an operation with no matching policy is denied. Contents are still client-authored — Finding 4. |
| `import_batches` | yes (5a:40) | `import_batches_own` (all) | `ea` | `ea` | Correct. `for all` is right here: undo stamps `undone_at`, so the table needs update. |

No table has policies without RLS enabled, and no table has RLS enabled with no
policy at all. No views, no `security definer` functions other than
`handle_new_user`, no RPCs (`Database['public']['Functions']` is `never`).

### Child tables are genuinely constrained

`group_members`, `expense_payers` and `expense_splits` carry no `owner_id`; they
inherit isolation entirely from the parent lookup. That lookup holds up:

- **Insert naming another owner's parent** — the `with check` `exists(...)` finds
  no row the caller owns and the insert fails with 42501. Not just the FK: the FK
  would happily accept a parent you cannot read.
- **Orphaning** — impossible from either direction. The `exists(...)` requires a
  live parent, and both columns are `references ... on delete cascade`.
- **Re-parenting by update** — blocked on both sides. `using` evaluates the old
  row, `with check` the new one, and both demand caller ownership of the
  referenced parent.

The one thing to be careful of: the cascade delete of children runs as the table
owner and is *not* subject to RLS. That is fine because the parent delete was
already ownership-checked, but it is the reason a future policy must never rely
on a child row's continued existence as evidence of anything.

---

## Findings, ranked

### 1. ~~Repo hazard (medium)~~ — FIXED 2026-07-25: a second, weaker schema was on disk and the README would apply it

> **Resolved.** `git rm -r jsapps/supabase` was run and `supabase/config.toml`
> added at the repo root (`major_version = 17`, matching the hosted project's
> reported `server_version 17.6`). The CLI walks up from cwd looking for
> `supabase/config.toml`, so the root is now the only answer and running
> `supabase db reset` from `jsapps/` can no longer apply the wrong schema. The
> README's local-setup step and its warning block were rewritten to match. The
> finding is kept below as the record of what was removed and why.

`jsapps/supabase/migrations/20250522164059_round_mouse.sql` (from upstream
`a8266c6`; its sibling `20250521173343_proud_mud.sql` is empty) defines an
entirely different `public` schema: `users`, `groups`, `group_members`,
`expenses`, `expense_splits`. Nothing in `jsapps/src` references it —
`database.types.ts` describes only the ten 4a/5a tables — and README line 8 names
`supabase/migrations/` as the schema. So it is dead code.

It is a hazard because **there is no `supabase/config.toml` anywhere in the
repo**, so which migration directory the CLI sees is decided by cwd, and README
§2 says `cd jsapps` while §3 offers `supabase start && supabase db reset` as the
local path. Run from that cwd, `db reset` applies the Bolt-era file, not the real
schema. What you would get:

- `users`: `for update using (auth.uid() = id)` and **no insert policy at all**,
  so no user can ever create their own row.
- `group_members`: `for all using (exists (select 1 from groups where id =
  group_members.group_id and created_by = auth.uid()))` — plus a *second* select
  policy on `group_members` whose `using` subquery selects from
  `group_members` itself. A policy that queries its own table under RLS raises
  `infinite recursion detected in policy for relation "group_members"`.
- `expenses` and `expense_splits`: select + insert policies only, no update or
  delete path.
- Reads keyed on `paid_by = auth.uid()` and group membership — i.e. the
  *multi-account* model the app does not implement. SplitEase friends are
  contacts, not accounts (4a header comment), so these policies do not describe
  this product at all.

None of that is exploitable today because these tables almost certainly do not
exist: `create table public.groups` in 4a would have failed outright if they did,
and 4b is recorded as applied and verified against the hosted project
(`docs/PHASE4B_BACKLOG.md` item 6).

**Fix — delete it, and pin the path so cwd stops mattering.** All three parts are
now done:

```bash
git rm -r jsapps/supabase   # 20250521173343_proud_mud.sql is empty; the other is dead
```

`supabase/config.toml` exists at the repo root, so `supabase db reset` / `db push`
resolve to `supabase/migrations/` regardless of cwd, and README §3 no longer
undercounts the tables or names only the 4a file.

### 2. Defence in depth (low) — person-ref columns have no FK, so identity is unconstrained

`expenses.paid_by`, `expense_payers.person_id`, `expense_splits.person_id`,
`group_members.person_id`, `settlements.from_person_id` / `to_person_id`,
`activity_events.actor_id` and `activity_events.group_id` are plain `uuid` with
no FK. This is deliberate and documented (4a header: the app has a flat person-id
namespace spanning the profile and contacts, and hard person FKs are Phase 4c's
`expense_participants`).

**Attack today:** from the console, an authenticated user can post
`{"expense_id": "<own>", "person_id": "<any uuid at all>", "amount": 1}` to
`/rest/v1/expense_splits`. It succeeds — the policy only checks the parent.

**Impact today: none cross-tenant.** Every read is owner-scoped, and the client
resolves person ids against its own `friends` list, so a foreign or invented
`person_id` only ever corrupts the attacker's own view. The real cost is
integrity, and the app already pays it in application code: `undoImportBatch`
scans four tables by hand before deleting a friend precisely because "`person_id`
has no FK ... so Postgres would not stop us"
(`jsapps/src/services/supabaseStore.ts:568-571`).

**Why it is still worth fixing before Phase 4c:** these columns are
attacker-controlled free-text today. The moment any policy is keyed on them —
"you can read an expense you are a participant in", which is exactly the
direction the Bolt-era policies in Finding 1 point — a value the attacker writes
becomes an access-control decision. Constrain the columns *before* a policy reads
them, not after.

```sql
-- Is this uuid a person the caller legitimately knows: themselves, or one of
-- their own contacts? security invoker, so the friends read is itself RLS-scoped.
-- Deliberately does NOT filter deleted_at: contacts are soft-deleted and their
-- historical splits must stay editable.
create or replace function public.is_own_person(p uuid)
returns boolean language sql stable security invoker
set search_path = public as $$
  select p = auth.uid()
      or exists (select 1 from public.friends f where f.id = p and f.owner_id = auth.uid());
$$;

drop policy "expense_splits_via_parent" on public.expense_splits;
create policy "expense_splits_via_parent" on public.expense_splits
  for all to authenticated
  using (exists (select 1 from public.expenses e
                 where e.id = expense_splits.expense_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.expenses e
                      where e.id = expense_splits.expense_id and e.owner_id = auth.uid())
              and public.is_own_person(expense_splits.person_id));
-- likewise expense_payers.person_id, group_members.person_id,
-- expenses.paid_by, settlements.from_person_id / to_person_id.
```

Safe against both import paths as written: `importCsvBatch` and `importState`
both insert friends *before* the expenses that reference them, so the contact row
exists by the time the check runs. Verify that ordering still holds before
applying.

### 3. Defence in depth (low) — `group_id` and `import_batch_id` are not ownership-checked

`expenses.group_id`, `settlements.group_id`, `expenses.import_batch_id` and
`friends.import_batch_id` have real FKs, but **FK validation runs as the table
owner and ignores RLS**. The policies only check `owner_id`, so nothing stops a
user pointing their own row at another user's group or import batch.

**Attack:** post to `/rest/v1/expenses` with `owner_id` = self and `group_id` =
a uuid belonging to another user's group. It succeeds.

**Impact: low, and it is worth being clear why.** The attacker learns nothing —
they still cannot read the group. The victim sees nothing — their reads filter on
their own `owner_id`. Two residual effects: the FK check is an existence oracle
for `groups` / `import_batches` ids (negligible, since guessing a v4 uuid is
not a thing), and the victim purging that group silently fires
`on delete set null` against the attacker's row. Both harmless. Fix it because
the policy should say what it means, and because a group-scoped read policy later
would turn a planted `group_id` into visibility.

```sql
drop policy "expenses_own" on public.expenses;
create policy "expenses_own" on public.expenses
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (group_id is null or exists (
      select 1 from public.groups g where g.id = expenses.group_id and g.owner_id = auth.uid()))
    and (import_batch_id is null or exists (
      select 1 from public.import_batches b where b.id = expenses.import_batch_id and b.owner_id = auth.uid()))
  );
-- likewise settlements.group_id and friends.import_batch_id.
```

### 4. Defence in depth (low) — the append-only log is entirely client-authored

4b correctly removed update and delete from `activity_events`, so the trail
cannot be rewritten or erased. But `activityEventToRow`
(`jsapps/src/services/supabaseStore.ts:182-195`) supplies `id`, `actor_id` **and
`created_at`** from the client, and the insert policy checks only `owner_id`. An
authenticated user can therefore append events that never happened, attribute
them to any `actor_id`, and stamp them with any timestamp — including one
interleaved among genuine rows.

The honest framing: this is a *per-owner* log of the owner's own actions, so the
audited party controls it by construction and there is no third party to deceive.
It is not a cross-tenant issue. It is worth closing because it is cheap and
because it is the difference between "append-only" and "tamper-evident".

```sql
drop policy "activity_events_insert_own" on public.activity_events;
create policy "activity_events_insert_own" on public.activity_events
  for insert to authenticated
  with check (owner_id = auth.uid() and actor_id = auth.uid());

-- created_at cannot be constrained by a policy alone; take it out of the
-- client's hands instead.
create or replace function public.stamp_activity_event()
returns trigger language plpgsql as $$
begin new.created_at := now(); return new; end $$;
create trigger activity_events_stamp before insert on public.activity_events
  for each row execute function public.stamp_activity_event();
```

`actor_id = auth.uid()` is compatible with both writers: `AppContext` always
builds events with `currentUser.id`, and the one-time local import remaps the old
local user id onto the profile id (`importRemapper.ts:26,68`). The trigger means
`activityEventToRow` may keep sending `created_at`; it will simply be ignored.

### 5. Informational — no policy is scoped `to authenticated`

Every policy in `supabase/migrations/**` omits a `to` clause, so it applies to
`public` — `anon` included. `anon` is denied in practice because `auth.uid()` is
`NULL` for it, every policy compares against `auth.uid()`, and `NULL = x` is
`NULL`, which is not `true`. So: **nothing is reachable by `anon`**, but only as
a consequence of three-valued logic rather than by statement. Add
`to authenticated` (as the SQL above does) so the intent is on the page and any
future policy with a non-`auth.uid()` term cannot accidentally inherit `anon`.

### 6. Informational — `profiles.email` is freely writable and can diverge from `auth.users.email`

`profiles_update_own` permits any column but `id`. A user can set
`profiles.email` to an address they do not control. Nothing reads it today, and
`profiles_select_own` means no other user can see it — so there is no impersonation
surface yet. It becomes one the day a "find a friend by email" feature reads
`profiles` across owners. Whoever adds that lookup must key it on
`auth.users.email`, or add `with check (email = auth.email())`.

### 7. Informational — unqualified column references inside policy subqueries

The three child-table policies read
`where g.id = group_id` / `where e.id = expense_id`. Today `group_id` and
`expense_id` resolve to the outer child table, because neither `groups` nor
`expenses` has a column by that name. Postgres resolves the innermost scope
first, so if `groups` ever gained a `group_id` column (or `expenses` an
`expense_id`), these would silently become `g.id = g.group_id` and the policy's
meaning would change with no error anywhere. Qualify them —
`group_members.group_id`, `expense_splits.expense_id` — as the SQL above does.

### 8. Informational — constraint violations leak the existence of unreadable rows

PK and FK checks run ahead of, and independently of, RLS visibility. Inserting a
row whose client-generated `id` collides with another user's gives 23505 rather
than the 42501 you would get for a policy refusal, which distinguishes "that
uuid exists and is someone else's" from "not permitted". Same for the FK probes in
Finding 3. Unfixable without changing the constraints, and irrelevant in
practice: all ids are `crypto.randomUUID()`, so there is nothing to enumerate.
Recorded so it is not mistaken for a finding later.

---

## Correct as designed — do not re-audit these

- **`for all` on `friends`, `groups`, `expenses`, `settlements`, `import_batches`.**
  These are mutable user data owned outright by one account; select, insert,
  update and delete are all legitimate, and splitting one `for all` into four
  identical policies would add nothing but four places to drift. The roadmap's
  instinct that `for all` is "broad" was right to check and right to conclude no.
- **`with check` on all seven mutable tables.** Present, and identical to
  `using`. Redundant per the semantics above, and correct to keep.
- **`activity_events` having only select + insert.** With RLS on, an unmatched
  operation is denied, so the *absence* of update/delete policies is the control.
- **`profiles` having no insert policy.** The `handle_new_user` trigger is
  `security definer` with `set search_path = public`, so it inserts outside RLS.
  A client-facing insert policy on `profiles` would be strictly worse.
- **The parent-lookup pattern on all three child tables.** See
  [above](#child-tables-are-genuinely-constrained).
- **Soft-delete columns are not an RLS concern.** `deleted_at` filtering happens
  in `fetchAll` and `AppContext`, and deliberately so — Recently Deleted needs to
  read the rows. Nothing about it crosses an owner boundary.

---

## What I could not determine without database access

This audit read source. Every statement above is about
`supabase/migrations/**` as committed, which is **not** the same claim as a
statement about the running database.

1. **Whether the deployed schema matches these files.** README §3 says to *paste
   the migration into the dashboard SQL editor*. There is no migration-state
   table in that workflow, no `config.toml`, and no CI step that diffs schema
   against disk — so nothing in the repo can tell you whether 4b and 5a were both
   applied, applied in order, or applied at all. `docs/PHASE4B_BACKLOG.md` item 6
   is the only evidence any migration reached the hosted project, and it covers
   4b only.
2. **Whether any policy was edited by hand in the dashboard.** This is the one
   that matters most and is completely invisible from here. A policy dropped,
   loosened, or added through the UI leaves no trace in git. The whole verdict
   above is void if that happened. `select * from pg_policies where schemaname =
   'public'` is the check, and its output should be diffed against these files.
3. **Whether RLS is actually enabled on the live tables.** The `alter table ...
   enable row level security` statements are all present in the files; I cannot
   confirm they took, or that none was later disabled. `select relname,
   relrowsecurity, relforcerowsecurity from pg_class where relnamespace =
   'public'::regnamespace` settles it. Note also that a table owner bypasses its
   own RLS unless `force row level security` is set — not a client-key concern,
   but relevant to anything running as `postgres`.
4. **The actual grants.** Supabase's defaults hand `anon` and `authenticated`
   table-level DML on new `public` tables, which is what makes Finding 5's
   reasoning necessary; I could not verify this project's grants, nor whether
   `authenticated` holds `CREATE` on `public` (Supabase's default template does
   grant it, which would in principle make `handle_new_user`'s `search_path =
   public` shadowable — not reachable over PostgREST, which issues no DDL, but
   worth confirming). `information_schema.role_table_grants` has the answer.
5. **Whether the Bolt-era tables from Finding 1 exist anywhere.** They cannot
   coexist with 4a in one database, but they may exist in an older or a second
   Supabase project that is still reachable with a still-valid anon key. Only an
   inventory of the org's projects can rule that out.
6. **Storage.** Phase 6B (`receipt_url`) will add a Storage bucket, and bucket
   policies live in `storage.objects`, not in these files. There is nothing to
   audit yet — and that is exactly why it needs auditing when it lands, since
   `storage.objects` policies are a separate policy set that this document does
   not cover.
