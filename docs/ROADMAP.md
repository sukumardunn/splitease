# SplitEase — Status & Remaining Work

**Durable, resumable task roundup.** Updated 2026-07-24 by agent7.

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
| — | **Add Friend flow** (P0, found during the 4b smoke): the two buttons had no handler and no `addFriend`/`insertFriend` existed, so a new user could not add anyone to split with. Gave `friend.add` its first producer. Also fixed broken `<img>` avatars — `profiles.avatar`/`friends.avatar` default to `''`, now backfilled with a generated initials SVG at the mapper boundary. Extracted `useFocusTrap` and shared it with `ImportPrompt`. | `a5c198b` |

**Gate as of the Add Friend merge:** 200 tests, green on Node 20 **and** 26;
typecheck, build, and lint clean (3 pre-existing `react-refresh` warnings,
0 errors). The Add Friend flow was also driven end-to-end in a real browser on a
fresh signup: add friend → split a $50 expense → $25 owed, reflected in the
sidebar, debt simplification, and Friends page, and persisted across reloads.

---

## Remaining — in priority order

### P1 — Phase 5: Import (CSV → screenshot)

Spec: [`design §5.2`](superpowers/specs/2026-07-18-splitease-improvement-design.md).
- **5A CSV:** upload Splitwise CSV → column mapping UI → dry-run preview
  (what will be created, duplicates flagged) → confirm → records an
  `import_batch` so the whole import can be undone.
- **5B Screenshot (bonus):** image → OCR → same preview/confirm/undo pipeline.

Needs a new migration for `import_batch` (+ a batch id on imported rows).
Migrations are serialized — hold `supabase/migrations/**` alone.

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
