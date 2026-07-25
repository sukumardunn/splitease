# SplitEase — Status & Remaining Work

**Durable, resumable task roundup.** Updated 2026-07-25 by agent8.

This is the single place to answer "what's done, what's left, where do I pick up."
It is tracked in git deliberately: `.superpowers/sdd/progress.md` is git-excluded
and machine-local, so it does not survive a clone or a crash.

Working line is **`claude-driven-changes`**; `master` is frozen. See
[`CLAUDE.md`](../CLAUDE.md) and [`.coordination/PROTOCOL.md`](../.coordination/PROTOCOL.md)
before claiming anything.

---

## Done

| Phase | What shipped | Where |
|-------|--------------|-------|
| 0 | Coordination scaffolding + design spec | `.coordination/`, `docs/superpowers/specs/` |
| 1 | On-device persistence, payer fix, balance math | `services/localStore.ts` |
| 2 | Soft-delete + undo + real activity/audit log | `services/activityLog.ts` |
| 3 | Splitwise-parity split engine, multi-payer, settle-up, debt simplification | `services/splitEngine.ts` |
| 4a | Supabase cutover: schema + RLS, auth, optimistic-online context, one-time local→cloud import | `services/supabaseStore.ts`, `context/`, `supabase/migrations/20260719000001_*` |
| 4b | 11 of 12 backlog items (see [`PHASE4B_BACKLOG.md`](PHASE4B_BACKLOG.md)) | merge `855b282` |
| 5A | **CSV import**: Splitwise export → column mapping → dry-run preview with duplicates flagged → confirm, recorded as an undoable `import_batch`. Pure pipeline in `services/csvImport.ts`; migration `20260725000001` applied and verified. | merge `6e6729a` |
| 6A | **Expense notes + Analytics.** `notes` had existed on the schema, the `Expense` type and both row mappers since 4a with nothing writing it — now a textarea on the add-expense form and a truncated line on the expense row. New `/analytics` page: KPI tiles, spend-by-category ranked bars, a 12-month trend, and a diverging per-person balance chart, each with a table view and an empty state. Aggregation is pure in `services/analytics.ts`; charts are hand-rolled HTML, no charting dep. | merge (this phase) |
| — | **Add Friend flow** (P0, found during the 4b smoke): the two buttons had no handler and no `addFriend`/`insertFriend` existed, so a new user could not add anyone to split with. Gave `friend.add` its first producer. Also fixed broken `<img>` avatars — `profiles.avatar`/`friends.avatar` default to `''`, now backfilled with a generated initials SVG at the mapper boundary. Extracted `useFocusTrap` and shared it with `ImportPrompt`. | `a5c198b` |
| — | **Hardening wave** (no user decision needed): all three non-atomic child-write paths now go through `security invoker` RPCs — `insertExpense`/`updateExpense` share `update_expense_with_children` (`…0002`), `insertGroup`/`updateGroup` share `update_group_with_members` (`…0003`), and `…0004` revokes `anon` EXECUTE on both. `useFocusTrap` returns focus to the trigger. Dynamic Tailwind classes replaced with typed static maps in `ExpenseItem` and `Activity` — those chips had been emitting **no CSS at all**. The category card derives its own denominator instead of trusting a second aggregate. Plus [`RLS_AUDIT.md`](RLS_AUDIT.md). 370 → 414 tests. | merges `a79e992`…`4455fa8` |
| — | **Edit expense** (6A follow-up): `updateExpense` had existed in both `AppContext` and `supabaseStore` since 4a with **zero UI callers**, so nothing in the app could change an expense after creation — including 6A's notes. `AddExpenseModal` now takes an optional `expense` and patches instead of inserting; `ExpenseItem` grew an edit button, so all three render sites get it. Split mode is *inferred* on open (see below). Also gave the modal the focus trap, Escape, and `role="dialog"` it was missing, and largest-remaindered the category percentages that could sum to 101%. | merge (this change) |

**Gate as of the Phase 6A merge:** 327 tests, green on Node 20 **and** 26;
typecheck, build, and lint clean (3 pre-existing `react-refresh` warnings,
0 errors). Every flow was also driven end-to-end in a real browser against the
hosted DB on a fresh signup — see the notes below each phase.

---

## Remaining — in priority order

### P1 — Phase 5B: Screenshot import (bonus)

Spec: [`design §5.2`](superpowers/specs/2026-07-18-splitease-improvement-design.md).
**5A (CSV) is done** — see the table above. 5B is image → OCR → structured rows,
reusing 5A's preview/confirm/undo pipeline unchanged.

The seam is already in place: `import_batches.source` defaults to `'csv'` but is
a free text column, and `AppContext.importCsv` takes a `source` override. An OCR
front-end only has to produce `string[][]` rows and hand them to
`buildImportPlan` — no migration, no store changes.

**Worth knowing before starting 5B:** OCR output is far less trustworthy than a
CSV, and `buildImportPlan` currently *rejects* rows whose person columns don't
sum to zero rather than trying to repair them. That is right for a CSV (a
mismatch means we misread the format) but will likely reject a lot of otherwise
good OCR rows, so 5B probably wants a repair/nudge step ahead of the planner
rather than a change to the planner itself.

### P2 — Phase 6B: Receipt attachments

**6A (notes + analytics) is done** — see the table above. What's left of Phase 6
is attachments only:

- Receipt attachments via Supabase Storage (`receipt_url`); mind free-tier egress.
- **This one does need a migration and infra**, which is why it was split out:
  `receipt_url` does not exist on `expenses` yet (only `notes` did), and a Storage
  bucket plus its own RLS policies have to be created. Claim
  `supabase/migrations/**` alone for it.

**Worth knowing before starting 6B:** analytics deliberately reports the
*current user's share* of each expense rather than its face value — see the
header comment in `services/analytics.ts`. If you add figures anywhere, match
that convention or say plainly which one you're using; a total that silently
means the other thing is the easiest way to make this page lie.

Both follow-ups 6A left open are now **done** — see the edit-expense row in the
table above. What that work leaves behind, for whoever touches expenses next:

- **Split mode is inferred, not stored.** An expense records its resolved
  per-person amounts, never the mode that produced them. `inferSplitMode` in
  `AddExpenseModal.tsx` claims `equal` only when the stored splits match
  `resolveSplit`'s equal output cent-for-cent, and otherwise seeds `exact`,
  which round-trips any split losslessly. So a percentage/shares expense reopens
  as `exact` with the right numbers, but the reader can no longer tell it was
  *entered* as 60/40. Storing the mode would need a migration; it was not worth
  one on its own, but it is the natural thing to add whenever `expenses` is
  altered next (e.g. 6B's `receipt_url`).
- **Editing an expense the current user has no share in adds them at $0.** The
  form hardcodes the current user into the split list, so such an expense (a
  Phase 5A import can produce one) comes back with a $0 split row for them.
  Numerically harmless — $0 changes no balance — but it is a row that was not
  there before.

### P3 — Phase 7: Hosting, hardening & polish

Deploy frontend + env/secret hygiene, backup/restore check, ~~RLS audit~~, PWA and
offline niceties, empty/error states.

**The RLS audit is done** — see [`RLS_AUDIT.md`](RLS_AUDIT.md). Verdict: **nothing
in `supabase/migrations/**` is exploitable.** All ten tables have RLS enabled,
every policy is anchored to `auth.uid()`, and no cross-tenant read or write could
be constructed; the child tables really are constrained through their parent.

**The old note here had its premise backwards, so don't re-audit on it.** It said
the other tables "still use broad `for all` policies" as though that were a gap.
Per the Postgres `CREATE POLICY` docs, on `ALL` and `UPDATE` a policy with no
`WITH CHECK` uses its `USING` expression for new rows *as well*, so a `using`-only
`for all` policy cannot permit `update … set owner_id = <someone else>`. 4a
spells out `with check` on all seven mutable tables anyway.

What the audit *did* surface is one repo hazard (the dead
`jsapps/supabase/migrations/` schema — see the decision list below), four
low-severity defence-in-depth items, and three informational notes, each with SQL.
It is also explicit about what it could not check without database access: whether
the deployed schema still matches the files on disk, and whether any policy was
hand-edited in the dashboard (which leaves no trace in git). Both would void the
verdict; the doc names the queries that settle them.

### P4 — Deferred / needs a decision, not code

- **Delete `jsapps/supabase/`?** It holds two Bolt-era migrations describing an
  abandoned multi-account schema that conflicts with the real one, that nothing in
  `jsapps/src` references, and one of whose policies would raise
  `infinite recursion detected in policy`. With no `config.toml` anywhere, the
  Supabase CLI picks its migrations directory from the current working directory,
  so `supabase db reset` run from `jsapps/` applies the **wrong schema**. The
  README now warns about this, which defuses the trap but does not remove it.
  Deleting the directory (plus adding a root `config.toml`) is the real fix —
  left as a decision only because the files are inherited from the frozen upstream
  commit `a8266c6` rather than written here.
- **`importState` is the last non-atomic multi-table write.** It writes friends →
  groups → members → expenses → payers → splits as six-plus separate requests with
  no cleanup path, so a mid-way failure leaves a partially imported account.
  (`importCsvBatch` has the same shape but mitigates it with batch-tagged
  best-effort cleanup.) It is only reachable from the one-time localStorage→cloud
  import, which most accounts will never run — hence not swept up with the other
  three. Fixing it well probably means one function taking the whole payload, which
  is a bigger piece of SQL than the two added here.
- **`insertExpense`/`insertGroup` are now upserts, not inserts.** A repeat of the
  *same* client-generated id updates instead of raising `23505`, which makes a
  retry idempotent — a net gain, and a collision with another owner's id still
  raises. Flagged because it is a real behaviour change rather than a refactor. It
  also means `updateGroup`/`updateExpense` on a stale id can *resurrect* a row
  someone else's session hard-deleted; the pre-RPC `.upsert()` had the same
  property, so nothing regressed, but nobody has decided whether that is wanted.

- ~~**`updateExpense` replaces child rows non-transactionally.**~~ **Fixed** —
  migration `20260725000002` adds `update_expense_with_children`, a
  `security invoker` plpgsql function whose body is one transaction, and the store
  calls it over a single `supabase.rpc`. Verified against the hosted project with
  real user JWTs, 8/8 checks: a re-insert forced to fail mid-body left both
  original split rows and the unmodified parent intact (the whole point), a second
  user targeting the first user's expense got `42501` with nothing changed, and
  `owner_id` spoofing on insert was rejected. **`security invoker` is load-bearing
  — never switch it to `definer`;** the expense id is caller-chosen, so definer
  would be a cross-tenant write primitive. The migration says so in a comment.
- ~~**`useFocusTrap` never returns focus to the trigger.**~~ **Fixed** — the hook
  now records `document.activeElement` when the trap engages and hands focus back
  on close, guarded against a trigger that has been removed, disabled, or
  superseded by focus moving elsewhere. Keyed on the container attaching/detaching
  rather than mount/unmount, because `AddFriendModal` and `CsvImportModal` stay
  permanently mounted and merely render `null` — a mount-based restore would have
  silently done nothing for half the modals. That also fixed a latent bug: those
  two never took *initial* focus either, invisible because their tests only ever
  render them already open.
- **Whole-state rollback granularity** (4b item 5): a failed write restores the
  entire state snapshot, discarding any concurrent in-flight optimistic update.
  A spec'd 4a tradeoff, commented in `AppContext.tsx`. Fixing it means choosing a
  concurrency model (per-entity snapshots, or a mutation queue) — a design call,
  so it was deliberately left open rather than patched.
- **React Router v7 future-flag warnings** on every app load, from
  `BrowserRouter` in `App.tsx`. Opting in changes runtime behaviour
  (`v7_startTransition`), so it is not a drive-by. The test-side `MemoryRouter`
  already opts in.
- **`SUPABASE_SECRET_KEY` was printed in cleartext** in an agent transcript on
  2026-07-24 (a redaction regex in a status command failed to match). It should be
  rotated in Project Settings → API if that has not already happened.
- ~~**Four leftover test accounts in the hosted project.**~~ **Done** —
  `accepta_178491703417526@`, `acceptb_178491703417526@`, `smoke_1784917666@` and
  `smoke6a_1784952000@` were deleted on 2026-07-25 on the user's explicit
  instruction, via `SUPABASE_DB_URL` as superuser in a transaction guarded by an
  email allow-list and a row-count assertion. The cascade was verified: **every
  table is now empty (0 users, 0 profiles, 0 expenses, 0 friends, 0 settlements,
  0 activity_events, 0 import_batches) with 0 orphaned split/payer/profile
  rows.** The hosted project is a clean slate, so the next agent to verify a flow
  in the browser starts from a fresh signup and should delete it afterwards —
  the script pattern is in the note above.

---

## Environment gotchas worth knowing

- **`npx tsc --noEmit` in `jsapps/` typechecks NOTHING. Use `npm run typecheck`.**
  The root `tsconfig.json` is solution-style (`"files": []` plus `references`), and
  `tsc` without `--build` checks no files at all, so it exits 0 on code that does
  not compile. Proved by adding `const x: number = "a string"` to a real file:
  bare `npx tsc --noEmit` exited 0 while `tsc --noEmit -p tsconfig.app.json`
  reported the error. Several agents (including the one writing this) reported
  "typecheck clean" from the bare form for whole sessions. `npm run typecheck` and
  `npm run build` both use the `-p` form, so a build was really checking it —
  but do not trust the bare command as a gate.
- **Tailwind's extractor reads comments too.** Naming a class in prose — even to
  say "don't use `bg-foo-500`" — makes it emit that rule. Noted in
  `utils/categoryColors.ts`.
- `npm test` runs on Node 20 and 26 alike as of 4b. If `localStorage` is ever
  `undefined` in tests again, read the comment in `src/test/setup.ts` — the cause
  is Node's inert Web Storage global shadowing jsdom's, not jsdom itself.
- `jsapps/.env.local` is gitignored by design and must be recreated per
  environment. It holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, the
  unprefixed `SUPABASE_SECRET_KEY`, and `SUPABASE_DB_URL` (direct Postgres URI,
  usable for applying migrations — there is no `supabase` CLI or `psql` on this
  machine).
- Migrations are append-only. Never edit an applied file; add a new one.
- **All migrations through `20260725000004` are applied to the hosted project**
(`…0002` atomic expense write, `…0003` atomic group write, `…0004` revoking
`anon` EXECUTE on both). Each was applied in a transaction and verified
afterwards; `…0002`/`…0003` were additionally exercised end-to-end with real user
JWTs, including the cross-tenant and atomicity cases. Note that
`revoke … from public` does **not** remove `anon`'s grant — Supabase's default
privileges grant EXECUTE to `anon` by name on every new function in `public`, so
a new function needs an explicit `revoke execute … from anon`.
  There is still no `supabase` CLI or `psql` here, but `SUPABASE_DB_URL` connects
  as the `postgres` superuser and can run DDL — `npm i pg` in a scratch directory
  outside the repo, then a ~20-line script (wrap the migration in
  `begin`/`commit` so a partial failure rolls back). Don't add `pg` to
  `jsapps/package.json`; the app never needs it.
