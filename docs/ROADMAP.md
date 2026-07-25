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

| 6B | **Receipt attachments stored in Postgres** (no Storage bucket — user decision) + **`split_mode` persisted**, migration `20260725000005`. Bytes live in `expense_receipts`, a child table fetched only when a receipt is opened, base64 `text`, downscaled client-side with `<canvas>` (no new dependency) and capped by a server-side `CHECK`. | merge (this wave) |
| — | **Atomic `importState`** (`20260725000006`, `…0007` adds `split_mode`) — the last multi-table writer that could half-apply. Plus two retry holes it did not cover on its own. | merge `eec3853`, `6826707` |
| — | **Scoped rollback + reconcile** — `mutate()` undoes only the row it touched and refetches after a failure, replacing the whole-state snapshot that discarded concurrent writes. | `6f6f3a2` |

**Gate as of this wave:** **507 tests**, green on Node 20 **and** 26; typecheck,
build and lint clean (0 errors, the same 3 pre-existing `react-refresh` warnings).

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

### ~~P1 — Phase 6B: Receipt attachments~~ — DONE 2026-07-25

Shipped as described below, plus two corrections the implementing agent made to
the plan, both right:

- **A second `CHECK` on `octet_length(data_base64) <= 699052`.** `byte_size` is a
  *client-supplied number*, so on its own it guards nothing — a caller can claim
  1 KB and post 10 MB. Proved live: a lied-about `byte_size` is rejected.
- **The RLS policy also checks the parent expense's owner**, not just
  `auth.uid() = owner_id`. Not redundant: FK validation bypasses RLS, so without
  it user B could park bytes against user A's expense id. Rejection verified live.
- `split_mode` was added **nullable with no default**, contrary to the brief's
  suggested `'exact'`: a defaulted `'exact'` is indistinguishable from a *recorded*
  `'exact'`, which would destroy the one thing `inferSplitMode` gets right on old
  rows. NULL means "intent unknown" → infer. `inferSplitMode` stays as the fallback.
- Storing only the mode is not enough to reopen a form — the *numbers* typed into
  it are not stored either. `deriveSplitValues` rebuilds them (percentages
  back-computed with the rounding residual pushed onto the largest share so they
  sum to exactly 100; shares reuse amounts as weights; adjustment as deltas from
  an equal share), with tests proving all three round-trip through `resolveSplit`
  to identical cents.

Verified live, 33/33 backend checks with real user JWTs and 25/25 in a real
browser: a 3.6 MB 3840×2160 JPEG stored as 184730 bytes at 1600×900, base64 with
no `data:` prefix, bytes queried **only on open**, surviving a hard reload;
replace and remove both leave exactly the right rows; a 60/40 percentage split
reopens as **percentage**; deleting an expense cascades its receipt away.

**Known gaps** (from the implementing agent, worth keeping): the
"still-too-big-at-quality-0.5" rejection path is covered by unit tests only, not
by a real stubborn photo; and the Safari `createImageBitmap` fallback is written
but never exercised, since Chrome always takes the primary branch.

Original decision and design, kept for the record:

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
- ~~**`importState` is the last non-atomic multi-table write.**~~ **Fixed** on the
  user's instruction (*"make it atomic as well. i dont want any midway failures to
  leave me hunting for expenses"*). It used to write friends → groups → members →
  expenses → payers → splits → settlements → events as **eight sequential REST
  inserts, each its own transaction**, with no `try/catch` and no cleanup — seven
  half-applied stopping points, and afterwards nothing distinguished an imported
  row from a hand-entered one. Migration `20260725000006` adds
  `public.import_state`, a `security invoker` plpgsql function whose body is one
  transaction, called over a single `supabase.rpc`.

  A compensating-cleanup fix of the `importCsvBatch` kind was *structurally
  impossible* here: `activity_events` has only SELECT and INSERT policies as of
  `20260724000001` (append-only by design), so the client can never delete step 8.
  One transaction was the only construction that covers all eight.

  Verified live with real user JWTs: a forced failure at step 6 **and** at step 8
  each left all eight tables at zero, while the old REST sequence under the same
  step-6 failure committed 2 friends, 2 groups, 3 members, 2 expenses and 2 payers.
  Cross-tenant `owner_id` spoofing → `42501`; attaching children to another owner's
  parent, or filing an expense under their group, → `23503` *before any write is
  attempted* (the join drops foreign parents, so the count assertion fires and RLS
  never gets asked — stronger than a policy rejection, but a different SQLSTATE
  than the sibling RPCs return). `anon` has no EXECUTE. Also driven end-to-end in a
  real browser, including the failure path and an in-session retry.
  **`security invoker` is load-bearing — never switch it to `definer`;** every id
  in the payload is caller-chosen and eight tables are in reach, so definer would
  be an unrestricted cross-tenant write primitive, forged audit-log rows included.

  **Two retry holes atomicity alone did not close, also fixed:** the import is now
  retired the instant it commits rather than after `fetchAll` (a blip there used to
  leave the prompt live with the data already in Postgres, and since
  `remapLocalState` mints fresh uuids per attempt, pressing Import again inserted a
  second full copy), and `IMPORT_HANDLED_KEY` is re-read on click so a second tab
  cannot import again. The toast now distinguishes "your local data is untouched"
  (write failed) from "Imported — but couldn't refresh" (write committed).

  **Still open, both narrow:** (i) a *truly concurrent* double-press across two
  tabs, both clicking before either write returns, still yields two copies — the
  import is all-or-nothing but not *idempotent*, since each attempt mints fresh
  uuids and there is no natural key to dedupe on. Closing it needs a DB-side
  marker, e.g. an `imports` row unique on `owner_id` written inside the same
  transaction. (ii) The `remoteEmpty` guard checks friends/groups/expenses/
  settlements but **not `activityEvents`**, so local state containing only activity
  events keeps the guard true forever and a different browser holding its own copy
  would be re-offered the import.
- **⚠️ `import_state` needs `split_mode` added.** It names 12 `expenses` columns
  explicitly (deliberately — so a column added by a sibling migration cannot break
  it), which means once `split_mode` exists an imported expense silently takes the
  column *default* instead of the mode the user chose. Fix is a `create or replace`
  adding it to that list — the signature is unchanged, so the grants survive —
  paired with the client payload change. Decide at the same time whether receipts
  should participate in an import at all.
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
- ~~**Whole-state rollback granularity**~~ (4b item 5) — **Fixed 2026-07-25**
  (user chose per-entity snapshots + refetch-on-failure; a mutation queue only
  if/when offline support is wanted).

  `mutate()` now takes a `MutationTarget` (`collection`, `id`, `before`, `index`)
  and undoes **just that row against current state**, dropping the optimistic
  activity event by id so a sibling's event survives. On failure it also
  **refetches** — scoped rollback fixes *what* is undone, the refetch fixes *how
  long* a divergence can last, and they are independent. The refetch is held while
  any other write is in flight (`inFlightRef`), because that write's row is not in
  the database yet and refetching would make it blink out and back.

  The two bugs this closed: a write that had already committed could vanish from
  the screen while its row sat in Postgres, and because each rollback restored a
  different point in history the **last** failure won and could *resurrect* a
  change that had already been undone.

  **⚠️ The narrowing lives INSIDE `mutate()` on purpose — keep it there.** All 12
  mutators funnel through that one function, so a mutation queue later is a swap
  of its internals; twelve bespoke `catch` handlers would make it a twelve-site
  unwind. This was an explicit condition of the user's decision, who asked how
  much of this work is wasted when a queue lands: only the splice body, ~30–50
  lines. The refetch is not wasted at all — a queue's replay model needs the same
  "last known server state" notion.

  **Still last-write-wins on the same row.** Two mutations racing on one entity
  still resolve in arbitrary DB order, and rolling back the first would clobber
  the second's value. Only serialising writes fixes that; scoping cannot.

  Rejected: the queue variant that applies the optimistic update only when the
  write *starts*, so just one is ever outstanding and whole-state snapshots become
  safe again. It makes a second edit invisible until the first write returns, which
  throws away the instant feel that justifies optimistic UI at all.

  **Verified, not assumed.** Reverting `mutate`'s catch to `applyState(prev)` makes
  **3 of the 5 new tests fail** — both historical bugs plus the missing reconcile;
  the other two pass either way and are guards on the new logic, which the test
  file says explicitly. The pre-existing rollback tests pass either way, because
  they only ever have one write in flight — which is exactly why they never caught
  this. Also driven in a real browser against the hosted DB, 11/11: a committed
  friend survived an unrelated expense failure whose RPC was aborted at the network
  layer, the toast fired, the reconcile GET fired, no expense row was created, and
  the throwaway account was deleted (0 users, 0 rows afterwards).

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
- **All migrations through `20260725000007` are applied to the hosted project**,
  each verified with real user JWTs: `…0005` (receipts + `split_mode`) 33/33 checks,
  `…0006` (atomic `import_state`) including both forced-failure cases and four
  cross-tenant rejections, `…0007` (adds `split_mode` to the import) 13/13.
  `…0007` is a `create or replace` with an unchanged signature, so `…0006`'s ACL
  survived — confirmed afterwards: `prosecdef = false`, exactly one overload, and
  `anon` still has no EXECUTE.
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
