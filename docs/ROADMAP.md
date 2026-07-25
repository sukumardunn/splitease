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
| — | **Add Friend flow** (P0, found during the 4b smoke): the two buttons had no handler and no `addFriend`/`insertFriend` existed, so a new user could not add anyone to split with. Gave `friend.add` its first producer. Also fixed broken `<img>` avatars — `profiles.avatar`/`friends.avatar` default to `''`, now backfilled with a generated initials SVG at the mapper boundary. Extracted `useFocusTrap` and shared it with `ImportPrompt`. | `a5c198b` |

**Gate as of the Phase 5A merge:** 281 tests, green on Node 20 **and** 26;
typecheck, build, and lint clean (3 pre-existing `react-refresh` warnings,
0 errors). Both flows were also driven end-to-end in a real browser against the
hosted DB on fresh signups — see the notes below each phase.

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

### P2 — Phase 6: Attachments, notes & analytics

- `notes` already exists on `expenses` in the schema and on the `Expense` type,
  but no UI writes it.
- Receipt attachments via Supabase Storage (`receipt_url`); mind free-tier egress.
- Category-trend and person-wise analytics; follow the `dataviz` skill guidance.

### P3 — Phase 7: Hosting, hardening & polish

Deploy frontend + env/secret hygiene, backup/restore check, RLS audit, PWA and
offline niceties, empty/error states.

**Note for whoever does the RLS audit:** 4b tightened `activity_events` only.
The other tables still use broad `for all` policies, which is correct for mutable
user data but has not been audited as a whole.

### P4 — Deferred / needs a decision, not code

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
- **Three leftover test accounts are still in the hosted project** — found while
  verifying 5A, which reads the DB as superuser and so sees every owner:
  `accepta_178491703417526@`, `acceptb_178491703417526@` (both empty, from the 4a
  acceptance script) and `smoke_1784917666@` / "Smoke Tester A" (1 expense, 2
  friends, from the 4b smoke). Earlier notes claim the smoke user was deleted; it
  was not, or not fully. Harmless but they are real `auth.users` rows in a live
  project. Deleting them is a one-liner (`delete from auth.users where email = …`
  cascades) but it is someone else's data, so it was left alone.

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
