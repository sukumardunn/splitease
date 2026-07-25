# SplitEase Improvement — Design Spec

**Date:** 2026-07-18
**Status:** Draft for review
**Author:** brainstorming session

---

## 1. Goal

Turn the current in-memory demo into a durable, multi-user, self-hosted-friendly
Splitwise alternative that:

- Persists data securely with reversible deletes (soft-delete + undo).
- Keeps a real, append-only **activity/audit log**.
- Imports existing Splitwise history from a CSV export.
- Supports the full range of Splitwise split types plus notes and image
  attachments.
- Provides category- and person-level spend analytics.
- Is deployable for **free / low cost** and accessed by users with a **simple
  email + password** login.
- **Removes the free-tier expense cap** that is the user's core pain point with
  Splitwise (we own the DB, so there is no artificial limit).

Early phases run **on-device** (no backend) so the app is useful and safe before
any hosting work; later phases move to **Supabase free tier**.

---

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Backend / hosting | **Supabase free tier** (Postgres + Auth + Storage + RLS) | Already scaffolded; no server to run; encryption at rest + TLS included. |
| Frontend hosting | **Vercel or Netlify free tier** (static Vite build) | Zero-cost, git-push deploy. |
| Import | **Splitwise CSV export only** | CSV = near-perfect accuracy, zero AI cost. Screenshot/OCR import was **dropped on 2026-07-25** by user decision — they will always enter expenses by hand rather than scan receipts, so an OCR dependency buys nothing. |
| Rollback | **Soft-delete + undo** (no heavy per-field versioning) | Meets "rolled back" without over-engineering. |
| Audit log | **Append-only `activity_events` table** | "Must" requirement; also powers the real Activity feed. |
| Security | **Supabase platform (RLS + encryption at rest + TLS)**; anon key only in client | No custom crypto; correct RLS is the security surface. |
| Auth | **Email + password** (Supabase Auth) | Simplest credential model requested. |

---

## 3. Current state & gap analysis

**Stack:** Vite + React 18 + TypeScript + Tailwind + `lucide-react`. App root is
`jsapps/`.

**What works:** routing + page shell (Dashboard, Groups, GroupDetail, Expenses,
Friends, Activity, Settings); basic add-expense modal with equal/custom/percentage
splits; balance computation in `AppContext`.

**Key problems to fix:**

1. **No persistence.** All state is in `AppContext.tsx` from `demoData.ts`;
   refresh loses everything.
2. **Supabase scaffolded but unused.** `lib/supabase.ts`, `database.types.ts`,
   and one migration exist but the app never calls them — dead code.
3. **Activity page is 100% mock** — hardcoded settlements/events in `Activity.tsx`.
4. **Payer is hardcoded to current user.** `AddExpenseModal` always sets
   `paidBy: currentUser.id`; can't record that someone else paid.
5. **Hard deletes only**, no undo, no audit trail.
6. **"Friends" have no DB home.** App models friends, but the schema only has
   `users` + `group_members`; a contacts/friendship table is missing.
7. **No notes, no attachments, no analytics, no import.**

---

## 4. Target architecture

### 4.1 Data access layer (new)

Introduce a thin **repository layer** (`src/services/`) that all pages/components
call instead of touching state or Supabase directly:

- `expenseRepo`, `groupRepo`, `friendRepo`, `activityRepo`, `importRepo`.
- Each repo has **two interchangeable backends** behind one interface:
  - `LocalBackend` — persists to `localStorage`/IndexedDB (Phases 1–3).
  - `SupabaseBackend` — Postgres via `@supabase/supabase-js` (Phase 4+).
- `AppContext` becomes a thin consumer of repos, not the data owner. This keeps
  the UI stable while the storage backend swaps underneath — the whole point of
  the "on-device first, cloud later" phasing.

### 4.2 Data model (target Supabase schema)

Extends the existing migration. New/changed items in **bold**.

- `users(id, email, name, avatar_url, created_at)` — from Supabase Auth.
- **`friendships(user_id, friend_id, status, created_at)`** — contacts graph.
- `groups(id, name, avatar_url, created_at, created_by, **deleted_at**)`.
- `group_members(group_id, user_id, joined_at)`.
- `expenses(id, description, amount, paid_by, group_id, category, currency,
  created_at, **created_by, updated_at, deleted_at, split_mode, notes,
  import_batch_id**)`.
- **`expense_receipts(expense_id, owner_id, mime_type, byte_size, data_base64,
  created_at)`** — receipt bytes live in their own table, not as a `receipt_url`
  on `expenses`, because `expenses` is fetched in full on every app load and
  image bytes would ride along. See §5.3 for why Storage was rejected.
- `expense_splits(expense_id, user_id, amount, **share_weight, percentage**)` —
  store the *intent* (weight/percent) not just the resolved amount, so splits
  can be re-derived and edited.
- **`activity_events(id, actor_id, action, entity_type, entity_id, group_id,
  before jsonb, after jsonb, created_at)`** — append-only audit + feed.
- **`import_batches(id, source, created_by, created_at, row_count,
  status, undone_at)`** — makes a whole bulk import undoable as one unit.

### 4.3 Security model

- **RLS on every table** (extend existing policies to new tables + add
  `deleted_at IS NULL` filters to default reads).
- Client holds only the **anon key**; all authorization is enforced by RLS keyed
  on `auth.uid()`.
- `activity_events` is **insert-only** for users (no update/delete policy);
  writes happen via DB triggers or the repo layer on every mutation.
- Platform provides **encryption at rest + TLS in transit**; no app-level field
  encryption in scope.

### 4.4 Rollback & audit

- **Soft-delete:** `deleted_at` timestamp on `expenses`/`groups`. Deletes set the
  timestamp; default queries exclude soft-deleted rows.
- **Undo:** a `restore()` per repo clears `deleted_at` and logs an event. UI
  surfaces a toast with **Undo** immediately after any delete, plus a
  "Recently deleted" view for later restore.
- **Import undo:** restoring/removing an `import_batch_id` reverses an entire
  import in one action.
- **Audit:** every create/update/delete/settle/import writes an
  `activity_events` row with before/after snapshots. This table is the single
  source for both the Activity feed and audit review.

---

## 5. Feature specs

### 5.1 Full Splitwise-style split options

Replace the 3-mode modal with: **equal**, **exact amounts**, **percentages**,
**shares/weights**, **adjustment (+/- extra on top of equal)**, and
**itemized** (line items assigned to people). Add a **"paid by" selector** so any
member (or multiple payers) can be the payer. Live validation that splits sum to
the total. Support **settle-up** as a first-class action (not a fake expense) and
optional **debt simplification** within a group.

### 5.2 Import

- **CSV:** upload Splitwise CSV export → column mapping → **dry-run preview**
  (what will be created, duplicates flagged) → confirm → creates an
  `import_batch` so it can be undone wholesale.

CSV is the only import path. A screenshot/OCR variant was specified here as a
bonus phase and **dropped on 2026-07-25** — see the decisions table above. Don't
resurrect it without asking.

### 5.3 Attachments & notes

- **Notes:** free-text `notes` on expenses (already in schema above).
- **Attachments:** receipt images are stored **in Postgres**, not in Supabase
  Storage — user decision, 2026-07-25: "Storage bucket feels like adding more
  variables for a small app… For now, try to store in app/DB itself." A bucket
  brings its own RLS surface and egress bill for what is a personal-scale app.
  The bytes live in a dedicated child table (not a column on `expenses`, which is
  fetched whole on every app load), downscaled client-side with `<canvas>` and
  capped by a server-side `CHECK`. Revisit only if the app actually scales.

### 5.4 Analytics

- **Category trends** over time (stacked area / bar by month).
- **Person-wise split** (who owes whom, net balances, over time).
- **Group breakdowns** and top categories.
- Built with a small charting approach consistent with the dataviz guidance;
  computed from the same repo layer so it works on-device and on Supabase.

---

## 6. Phased plan

Each phase is independently shippable and ends in a working app. Phases 1–3 need
**no backend** (honoring "earlier phases on device").

### Phase 0 — Coordination & spec (this session)
- Add multi-agent coordination scaffolding: `CLAUDE.md`,
  `.coordination/PROTOCOL.md`, `.coordination/LEDGER.md`. *(Already drafted.)*
- Commit this spec.
- **Exit:** files committed; any agent can read the protocol and claim work.

### Phase 1 — On-device persistence + data-layer refactor
- Introduce the repository layer with `LocalBackend` (localStorage/IndexedDB).
- Move all state out of `demoData` into persisted storage; app survives refresh.
- Fix payer selection (`paid_by` = any member) and correct balance math.
- **Exit:** add/edit/delete expenses & groups persist across reloads; demo data
  becomes optional seed only.

### Phase 2 — Soft-delete, undo & real activity/audit log
- Add `deleted_at` semantics + Undo toast + "Recently deleted" view.
- Implement `activity_events` locally; **replace mocked `Activity.tsx`** with the
  real event feed.
- **Exit:** nothing is destroyed irreversibly; every mutation appears in a real,
  non-mock activity log.

### Phase 3 — Splitwise-parity split engine
- Implement all split modes (§5.1), multi-payer, settle-up as first-class,
  optional debt simplification, with sum-to-total validation.
- **Exit:** any Splitwise split can be reproduced; balances stay correct.

### Phase 4 — Backend cutover (Supabase) + auth
- Finalize schema migration (new tables/columns + RLS + soft-delete filters).
- Wire `SupabaseBackend`; add **email+password auth**; per-user data via RLS.
- One-time **migrate local data → cloud** for existing on-device users.
- **Exit:** two users on different devices share groups; data is server-persisted
  and secured by RLS. **No expense cap.**

### Phase 5 — Import (CSV)
- CSV import with mapping, dry-run preview, dedupe, batch-undo (§5.2).
- **Exit:** a user can reach a useful starting point by importing existing
  Splitwise history.

### Phase 6 — Attachments, notes & analytics
- Notes + receipt attachments stored in Postgres (§5.3).
- Category-trend and person-wise analytics dashboards (§5.4).
- **Exit:** expenses carry context; users see spend trends.

### Phase 7 — Hosting, hardening & polish
- Deploy frontend (Vercel/Netlify free) + Supabase project; env/secret hygiene.
- Backups/restore check, RLS audit, PWA/offline niceties, empty/error states.
- **Exit:** publicly accessible with simple credentials, low/zero cost.

---

## 7. Multi-agent coordination

This repo may host **multiple agents from separate sessions concurrently**.
Coordination is file-based and git-committed:

- `CLAUDE.md` — auto-loaded rules + TL;DR.
- `.coordination/PROTOCOL.md` — identity, ledger format, claim/heartbeat/release
  loop, stale-claim recovery, migration serialization.
- `.coordination/LEDGER.md` — live claim board.

Because phases and features here are largely independent (repo layer, split
engine, import, analytics), they map cleanly onto separate claims. **Migrations
are serialized** — only one agent may hold `supabase/migrations/**` at a time.

---

## 8. Risks & open questions

- **Local → cloud migration (Phase 4)** is the trickiest step (ID remapping,
  conflict handling). Mitigate with an explicit one-time migration tool + dry run.
- **CSV format drift:** Splitwise export columns may vary; mapping UI absorbs this.
- **Supabase free-tier limits:** attachments now consume the 500 MB *database*
  quota rather than Storage (§5.3), so the client-side downscale and the
  server-side size `CHECK` are the load-bearing controls. Keep image sizes small.
- **Multi-payer + debt simplification** interact; validate math with tests.

---

## 9. Out of scope (YAGNI for now)

- Native mobile apps (PWA covers "accessible anywhere").
- Real-time collaborative editing / presence.
- Currency FX conversion (store currency; no live rates yet).
- Per-field version history / point-in-time revert (soft-delete + undo is enough).
- App-level field encryption (platform encryption suffices).
