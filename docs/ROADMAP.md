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

### ~~Phase 5B: Screenshot import~~ — CANCELLED 2026-07-25

**Dropped by user decision. Do not build it, and do not re-propose it.** The
user's words: *"I'd say remove the OCR feature completely! I'll always add
manually instead of scanning receipts."* An OCR engine (`tesseract.js` is
~2–10 MB of WASM) would have been runtime dependency #6 against a deliberate
5-dep budget, and it needed a row-repair step ahead of `buildImportPlan` on top.
Removed from [`design §5.2`](superpowers/specs/2026-07-18-splitease-improvement-design.md)
as well; that section now records the cancellation rather than the plan.

CSV import (5A, shipped) is the only import path.

**What stayed behind on purpose:** `import_batches.source` is still a free-text
column defaulting to `'csv'`. It is applied to the hosted DB and it honestly
records provenance, so it was not worth a migration to drop — but it no longer
means "screenshot support is coming".

### P1 — Phase 6B: Receipt attachments (in progress)

**6A (notes + analytics) is done** — see the table above. What's left of Phase 6
is attachments only.

**Storage bucket rejected; receipts go in Postgres.** User decision, 2026-07-25:
*"Storage bucket feels like adding more variables for a small app - we can add
this later if it scales. For now, try to store in app/DB itself."* So:

- Bytes live in a dedicated **`expense_receipts` child table**, not as a
  `receipt_url` (or a blob column) on `expenses`. This is the load-bearing part:
  the app fetches every expense on startup, so image bytes on the `expenses` row
  would be dragged into every page load. The receipt is fetched lazily, only when
  someone opens it.
- **base64 `text`, not `bytea`** — PostgREST serialises `bytea` as `\x` hex (2x
  over the wire plus a client-side decode); base64 is 1.33x and drops straight
  into an `<img src="data:…">`.
- **Downscaled client-side with the built-in `<canvas>` API** — no image
  dependency, the 5-dep budget stays intact — and capped by a server-side
  `CHECK` so a client bug cannot fill the 500 MB free-tier database.
- Attachments now consume the **database** quota, not the Storage/egress quota.
  That is the tradeoff the user accepted; revisit only if the app actually scales.
- Bundled with the stored split mode (below) into one `expenses` migration, since
  both alter the same table.

**Worth knowing before touching this:** analytics deliberately reports the
*current user's share* of each expense rather than its face value — see the
header comment in `services/analytics.ts`. If you add figures anywhere, match
that convention or say plainly which one you're using; a total that silently
means the other thing is the easiest way to make this page lie.

Both follow-ups 6A left open are now **done** — see the edit-expense row in the
table above. What that work leaves behind, for whoever touches expenses next:

- **Split mode is now being stored** (user decision 2026-07-25: *"Yes store
  it"*), bundled into 6B's migration since both alter `expenses`. Until then, and
  for every row created before it, the mode is *inferred*: an expense records only
  its resolved per-person amounts, so `inferSplitMode` in `AddExpenseModal.tsx`
  claims `equal` only when the stored splits match `resolveSplit`'s equal output
  cent-for-cent and otherwise seeds `exact`, which round-trips any split
  losslessly. A percentage/shares expense therefore reopens as `exact` with the
  right numbers but no record that it was *entered* as 60/40. **`inferSplitMode`
  stays as the fallback after the migration** — pre-migration rows and 5A CSV
  imports have no recorded intent.
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

The one repo hazard the audit surfaced — the dead `jsapps/supabase/migrations/`
schema — is **fixed** (see the decision list below). What remains is four
low-severity defence-in-depth items and three informational notes, each with SQL.
It is also explicit about what it could not check without database access: whether
the deployed schema still matches the files on disk, and whether any policy was
hand-edited in the dashboard (which leaves no trace in git). Both would void the
verdict; the doc names the queries that settle them.

### P4 — Deferred / needs a decision, not code

- ~~**Delete `jsapps/supabase/`?**~~ **Done 2026-07-25** on the user's
  instruction ("delete it and proceed with your recommendations"). The two
  Bolt-era migrations described an abandoned multi-account schema that conflicted
  with the real one, that nothing in `jsapps/src` referenced, and one of whose
  `group_members` policies queried its own table and so would raise
  `infinite recursion detected in policy`. `git rm -r jsapps/supabase` plus a new
  root **`supabase/config.toml`** (`major_version = 17`, matching the hosted
  project's reported `server_version 17.6`). The CLI walks up from cwd looking for
  `supabase/config.toml`, so the repo root is now the only answer and
  `supabase db reset` from `jsapps/` can no longer apply the wrong schema. README
  §3 and [`RLS_AUDIT.md`](RLS_AUDIT.md) finding 1 both updated.
- **`importState` — being made atomic now** (user decision 2026-07-25: *"make it
  atomic as well. i dont want any midway failures to leave me hunting for
  expenses"*). It writes friends → groups → members → expenses → payers → splits →
  settlements → events as **eight sequential REST inserts, each its own
  transaction**, with no `try/catch` and no cleanup, so there are seven half-applied
  stopping points. Note a compensating-cleanup fix of the `importCsvBatch` kind is
  *structurally impossible* here: `activity_events` has only SELECT and INSERT
  policies as of `20260724000001` (append-only by design), so the client cannot
  delete step 8. One `security invoker` function taking the whole payload is the
  only path that covers it.
  **Related bug, found while mapping this:** on failure `handleImport` leaves
  `IMPORT_HANDLED_KEY` unset and `importCandidate` non-null, so the prompt stays
  open and Import can be pressed again — and because `remapLocalState` runs inside
  the promise chain and mints fresh uuids per attempt, a retry after a partial
  failure inserts a **second copy** of everything that already landed. The toast's
  "your local data is untouched" is true of localStorage but not of the cloud.
  Atomicity should make the retry safe by construction.
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
- **Whole-state rollback granularity** (4b item 5) — **still open, awaiting the
  user's choice of concurrency model.** A failed write restores the entire state
  snapshot, discarding any concurrent in-flight optimistic update. A spec'd 4a
  tradeoff, commented in `AppContext.tsx:163-172`.

  The concrete shape, so nobody has to re-derive it: all domain data is a single
  `useState` (`AppState` = 1 scalar + 6 arrays) mirrored by a synchronous
  `stateRef`, and **12 `mutate()` call sites** are fire-and-forget with nothing
  serialising them. `mutate` captures `prev = stateRef.current` — the whole world —
  applies the optimistic update, and on rejection calls `applyState(prev)`. Two
  real failure modes follow: (i) a later successful write is silently reverted on
  screen while its DB row and activity event persist, and (ii) because each
  rollback restores a *different* point in history, the **last** rollback wins and
  can *resurrect* an earlier write that already failed and was undone. There is no
  refetch after a rollback, so the divergence lasts until remount. The single-slot
  toast compounds it: two near-simultaneous failures show one message, so the user
  cannot tell which change was lost.

  Because all domain data sits behind one `setState`, per-entity rollback needs no
  state-splitting work — only a narrower updater in the `catch`. Note neither
  option fixes last-write-wins on the *same* entity.
- **React Router v7 future-flag warnings** — **accepted, not fixing** (user
  decision 2026-07-25: *"the console warnings are fine for now"*, unless they cause
  a usability issue). They do not: on `react-router-dom` 6.30.0 the warnings are
  console-only, and `App.tsx` declares **no splat (`*`) routes at all**, so
  `v7_relativeSplatPath` cannot change any resolved path in this app.
  `v7_startTransition` only changes *how* router state updates are scheduled, not
  what renders. The test-side `MemoryRouter` already opts in, which is why tests
  are quiet. Revisit on the actual v7 upgrade.
- **`SUPABASE_SECRET_KEY` was printed in cleartext** in an agent transcript on
  2026-07-24 (a redaction regex in a status command failed to match). **Rotation
  deliberately deferred** by the user on 2026-07-25 until the app is
  feature-complete — *"I'll rotate it after we've built the entire app… but remind
  me when we move the app to version 1.0."* So: **do not treat this as an open
  finding, and do raise it unprompted at v1.0 / first public hosting.** Rotate in
  Project Settings → API, then update `jsapps/.env.local`.
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
