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

Deploy frontend + env/secret hygiene, backup/restore check, RLS audit, PWA and
offline niceties, empty/error states.

**Note for whoever does the RLS audit:** 4b tightened `activity_events` only.
The other tables still use broad `for all` policies, which is correct for mutable
user data but has not been audited as a whole.

### P4 — Deferred / needs a decision, not code

- **`updateExpense` replaces child rows non-transactionally, and a partial
  failure loses splits while the toast claims otherwise.**
  `supabaseStore.updateExpense` is four separate requests: upsert the parent,
  delete `expense_payers`, delete `expense_splits`, re-insert both. If the
  deletes land and the insert fails, the expense is left with **zero** split
  rows, while `AppContext.mutate` rolls back only the in-memory snapshot and
  toasts "Couldn't save your change — it was undone." That is untrue: the local
  state is restored, the database is not, and the debt silently disappears on the
  next fetch. This has existed in the store since 4a, but the edit-expense UI is
  the first thing that can trigger it, which is why it is logged now. Fixing it
  means choosing a shape — a Postgres function doing the replace in one
  statement, or insert-first-then-delete-stragglers instead of delete-then-insert
  — so it is a design call, not a patch. Related to the rollback-granularity item
  below; both come from the same optimistic-write model.
- **`useFocusTrap` never returns focus to the element that opened the dialog.**
  On Escape or Cancel, focus drops to `<body>`, so a keyboard user loses their
  place. Pre-existing and shared by all four modals that use the hook, but newly
  noticeable now that the trigger is a per-row edit button in a long list —
  closing the dialog dumps you back at the top of the page. Fix belongs in the
  hook, so it touches every modal at once.
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
- **Four leftover test accounts are still in the hosted project.** Three were
  found while verifying 5A, which reads the DB as superuser and so sees every
  owner: `accepta_178491703417526@`, `acceptb_178491703417526@` (both empty, from
  the 4a acceptance script) and `smoke_1784917666@` / "Smoke Tester A" (1 expense,
  2 friends, from the 4b smoke). Earlier notes claim the smoke user was deleted;
  it was not, or not fully. The fourth is
  **`smoke6a_1784952000@example.com` / "Smoke Six A"** from the 6A browser
  verification (2 friends "Alice"/"Bob", 5 expenses, 2 of them carrying notes).
  Harmless but they are real `auth.users` rows in a live project. Deleting them is
  a one-liner (`delete from auth.users where email = …` cascades, via
  `SUPABASE_DB_URL` as superuser). 6A deliberately did **not** run it: the sandbox
  blocked writing the throwaway script, and routing around a denial to run
  `DELETE` against a live auth table is not the right call unattended. Cleaning up
  all four together is a good one-off task for whoever has the dashboard open.

---

## Environment gotchas worth knowing

- `npm test` runs on Node 20 and 26 alike as of 4b. If `localStorage` is ever
  `undefined` in tests again, read the comment in `src/test/setup.ts` — the cause
  is Node's inert Web Storage global shadowing jsdom's, not jsdom itself.
- `jsapps/.env.local` is gitignored by design and must be recreated per
  environment. It holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, the
  unprefixed `SUPABASE_SECRET_KEY`, and `SUPABASE_DB_URL` (direct Postgres URI,
  usable for applying migrations — there is no `supabase` CLI or `psql` on this
  machine).
- Migrations are append-only. Never edit an applied file; add a new one.
- **All migrations through `20260725000001` are applied to the hosted project.**
  There is still no `supabase` CLI or `psql` here, but `SUPABASE_DB_URL` connects
  as the `postgres` superuser and can run DDL — `npm i pg` in a scratch directory
  outside the repo, then a ~20-line script (wrap the migration in
  `begin`/`commit` so a partial failure rolls back). Don't add `pg` to
  `jsapps/package.json`; the app never needs it.
