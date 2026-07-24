# Phase 4a — Auth + Core Persistence (Local Supabase): Design Brief / Handoff

> **⚠️ BRANCHING UPDATE (2026-07-25):** `claude-driven-changes` is the working
> line; **`master` is frozen** at upstream `a8266c6`. The "base 4a work on
> `master`" note below is historical — read every `master` as
> `claude-driven-changes`. See `CLAUDE.md` and `.coordination/PROTOCOL.md` §0.

**Status:** Design approved (brainstorm complete). This document is a **handoff brief
for authoring the detailed implementation spec** — it captures every decision, the
approved design shape, and the repo-specific facts needed to write an accurate spec.
It is intentionally at "design" altitude; the downstream spec should expand each
section into concrete DDL, file-by-file changes, and step-by-step tasks.

- **Date:** 2026-07-19
- **Author of brief:** brainstorm session (agent)
- **Intended next author:** high-powered model writing the impl spec
- **Repo:** SplitEase (`jsapps/` = Vite + React 18 + TS + Tailwind + lucide-react)

---

## 0. Context: where the project is now

Phases 0–3 are **merged to `master`** (fast-forward, commit `428ea25`). Current app:

- **State lives entirely in `jsapps/src/context/AppContext.tsx`** — in-memory React
  state, persisted to **localStorage** via `services/localStore.ts`. Seeded from
  `src/data/demoData.ts` on a fresh device.
- Pure, tested engines already exist and must stay untouched:
  `services/splitEngine.ts`, `services/splitCalculator.ts`, `services/activityLog.ts`.
- **65 tests pass**, `tsc --noEmit` clean, `vite build` clean.

**End goal (multi-phase):** full multi-user *shared* Splitwise-parity backend.
This is decomposed into:

- **Phase 4a (THIS spec)** — Auth + core persistence, **owner-scoped** (single-user
  isolation). Foundation for everything else.
- **Phase 4b** — Friends & groups as real account links: `friendships`,
  invite-by-email, **claim-on-signup**.
- **Phase 4c** — Shared visibility + realtime: `expense_participants`,
  participant-based RLS via **security-definer** function, realtime subscriptions.

4a must be built so 4b/4c are **additive, not a rewrite** (see §2 person-ref note).

---

## 1. Locked decisions (do not re-litigate)

| Decision | Choice | Rationale |
|---|---|---|
| Backend env | **Local Supabase stack** (Docker + `supabase` CLI). User will install both. | True local-first; no cloud account. |
| Sharing model (end goal) | **Full multi-user shared** | Splitwise-true. Sliced; 4a is owner-scoped. |
| Auth method | **Email + password**, email confirmation **OFF** for local dev | Works out-of-the-box locally; simplest test loop. |
| Data-layer behavior | **Optimistic online** — Postgres = source of truth; optimistic local apply + async write + rollback-on-error; one loading gate at mount | Minimal churn to existing synchronous `AppContextType`. |
| Demo / existing data | **One-time localStorage → Postgres import** on first login; new accounts otherwise empty | User wants their current local data carried over once. |
| Code structure | **Approach A** — `services/supabaseStore.ts` behind the existing context seam; **no new deps** | Mirrors `localStore.ts` seam; respects `.bolt/prompt` (only lucide-react + Tailwind). Pages unchanged. |

Rejected code-structure alternatives: **B** React Query hooks (adds dep, rewrites all
consumers), **C** inline supabase calls in AppContext (bloats/couples the context).

---

## 2. Repo-specific facts the spec MUST account for (discovered, non-obvious)

1. **`jsapps/src/lib/supabase.ts` is dead AND broken.** It imports
   `./database.types` which **does not exist**, so it would fail to compile if
   referenced. Nothing imports it today (build only passes because it's unreferenced).
   → Spec must: fix this file, generate `database.types.ts`
   (`supabase gen types typescript --local > src/lib/database.types.ts`).
2. **No `supabase/` dir, no migrations, no `.sql` anywhere.** The CLAUDE.md claim that
   schema/migrations "exist" is **stale/false**. Everything is greenfield.
3. **Docker and `supabase` CLI are NOT installed** on the machine. Spec's setup
   section must include installing both. (Docker Desktop = multi-GB, may need admin.)
4. **Flat person-id namespace (critical modeling gotcha).** In current types,
   `Friend = User` (alias) — the current user and friends share ONE id space.
   `Expense.paidBy`, `Expense.payers[].userId`, `Expense.splitWith[].userId`,
   `Settlement.fromUserId/toUserId`, and `Group.members[]` all reference ids in this
   flat space (mix of currentUser id + friend ids). Existing ids are **strings** like
   `user_1721...` — NOT uuids.
   → 4a stores person refs as plain `uuid` (owner's profile id OR a friend id),
   validated app-side, **no hard FK** on those columns. 4c is where these normalize
   into `expense_participants` with real FKs to `profiles`. Do not add strict person
   FKs in 4a — it would fight the flat namespace and the import mapping.
5. **The `AppContextType` interface is the seam.** Full current interface (keep it
   IDENTICAL so pages don't change):
   ```ts
   interface AppContextType {
     currentUser: User;
     friends: Friend[];
     groups: Group[];            // active (deletedAt == null)
     expenses: Expense[];        // active
     settlements: Settlement[];  // active
     activityEvents: ActivityEvent[];  // newest first
     deletedExpenses: Expense[]; // soft-deleted, most-recent first
     deletedGroups: Group[];
     addExpense: (e: Omit<Expense,'id'|'date'>) => void;
     updateExpense: (id: string, e: Partial<Expense>) => void;
     deleteExpense: (id: string) => void;   // soft
     restoreExpense: (id: string) => void;
     purgeExpense: (id: string) => void;    // permanent
     addGroup: (g: Omit<Group,'id'>) => void;
     updateGroup: (id: string, g: Partial<Group>) => void;
     deleteGroup: (id: string) => void;
     restoreGroup: (id: string) => void;
     purgeGroup: (id: string) => void;
     settleDebt: (fromId, toId, amount, groupId?) => void;
     getBalances: () => { friend: Friend; balance: number }[];
     getSuggestedSettlements: (participantIds?: string[]) => Transfer[];
     getGroupById: (id: string) => Group | undefined;
   }
   ```
   Functions are **void-returning** (fire-and-forget from the UI's view). Optimistic
   online keeps them void: apply → async persist internally → rollback+toast on error.
6. **Domain types** (from `src/types.ts`) the schema must faithfully persist:
   `User{id,name,email,avatar}`, `Friend = User`, `Split{userId,amount}`,
   `Payer{userId,amount}`,
   `Expense{id,description,amount,paidBy,payers?,splitWith,date,category,currency,groupId,deletedAt?,notes?}`,
   `Group{id,name,members[],avatar,deletedAt?}`,
   `Settlement{id,fromUserId,toUserId,amount,currency,date,groupId?,deletedAt?}`,
   `ExpenseCategory` (enum incl. `'settlement'`), `ActivityEvent` (from
   `services/activityLog.ts` — inspect for its shape before writing DDL).
7. **Env quirk:** vitest/vite must run under **Node 20** (`nvm use 20`); the machine's
   default Node 16 crashes them.
8. **Multi-agent coordination is mandatory.** Before editing, the implementer must
   claim scope in `.coordination/LEDGER.md` per `.coordination/PROTOCOL.md`, on a
   branch `agent/<task>-<agentid>`, heartbeat ~15 min, mark DONE when finished.
9. **`master` is 10 commits ahead of `origin/master`** (not pushed). Base 4a work on
   `master`.
10. **Reusable UI:** a `Toast` component exists (`src/components/ui/Toast.tsx`, Phase 2)
    — reuse it for rollback/error notifications.

---

## 3. Approved design (expand each into the impl spec)

### Section 1 — Local environment
- Install Docker Desktop + `supabase` CLI (`brew install supabase/tap/supabase`).
- `supabase init`; set `config.toml` auth `enable_confirmations = false` for dev.
- `supabase start` → Postgres + GoTrue (auth) + Studio on localhost.
- `jsapps/.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (from
  `supabase status`).
- Fix `src/lib/supabase.ts`; generate `src/lib/database.types.ts`.

### Section 2 — Schema & migrations (owner-scoped, forward-compatible)
All tables carry `owner_id uuid not null` (except `profiles`) and `deleted_at
timestamptz null` where soft-delete applies. Person refs = plain `uuid`, no hard FK
(see §2.4).
- `profiles` (id = `auth.users.id` PK, name, email, avatar, created_at) — populated by
  a `handle_new_user()` trigger on `auth.users` insert.
- `friends` — contacts owned by user (name, email, avatar, deleted_at). NOT accounts.
- `groups` (name, avatar, deleted_at) + `group_members(group_id, friend_id)`.
- `expenses` (description, amount, paid_by uuid, date, category, currency, group_id,
  notes, deleted_at) + normalized child tables:
  - `expense_payers(expense_id, person_id uuid, amount)`
  - `expense_splits(expense_id, person_id uuid, amount)`
- `settlements` (from_person_id, to_person_id, amount, currency, date, group_id,
  deleted_at).
- `activity_events` (shape per `activityLog.ts`; append-only).

Write as ordered migration files under `supabase/migrations/`.

### Section 3 — RLS
- Enable RLS on every table.
- Base rule: `owner_id = auth.uid()` for select/insert/update/delete.
- `profiles`: read/update own row only.
- Child tables (`expense_payers`, `expense_splits`, `group_members`): scope through the
  parent row's `owner_id` (join/subquery in policy).
- Owner-scoped ⇒ no recursion risk. (Security-definer participant fn is a 4c concern.)

### Section 4 — Auth flow (app)
- New `AuthProvider` (context) exposing `session`, `signUp`, `signIn`, `signOut` over
  `supabase.auth`; subscribe to `onAuthStateChange`.
- Login + Signup screen when no session; app gated behind it. Logout in sidebar.
- `currentUser` derived from the session user's `profiles` row (replaces
  `demoData.currentUser`).

### Section 5 — Data layer (optimistic online)
- `services/supabaseStore.ts`: typed async CRUD per entity —
  `fetchAll(userId)`, `insert*`, `update*`, `softDelete*`, `restore*`, `purge*`.
  Maps between DB rows (snake_case) and domain types (camelCase).
- `AppContext` refactor:
  - On session ready → `fetchAll` → `<Loading/>` gate until first load resolves.
  - Each mutation: optimistic `setState` → async persist → on error rollback prior
    state + show error `Toast`.
  - **Keep `AppContextType` identical** (void fns) → pages unchanged.
  - Retire `localStore.ts` from the live path; `demoData.ts` used only by import/seed.

### Section 6 — localStorage → Postgres import (first login)
- On first login to an empty account with localStorage state present → prompt
  "Import your existing data?".
- Pure **id-remapper**: old string ids → new uuids (currentUser → profile id; each
  friend → new uuid); rewrite ALL references across expenses/splits/payers/
  settlements/groups; batch insert.
- Clear the local flag on success. Remapper is a pure fn → unit-tested.

### Section 7 — Testing
- Keep existing **65 tests green** (pure engines untouched).
- New pure-logic unit tests (mocked supabase client, no Docker in CI):
  - the id-remapper (Section 6),
  - the optimistic-apply / rollback reducer logic.
- Store CRUD verified manually vs local stack (optional smoke script).
- Manual acceptance: two accounts see only their own data; import works; refresh
  persists; rollback fires a toast on simulated failure.

### Section 8 — Non-goals (explicitly deferred)
Real friend accounts, invites, claim-on-signup (→4b); shared expense visibility,
participant RLS, realtime (→4c); OAuth / magic-link.

---

## 4. Suggested spec deliverables (what the impl spec should produce)
1. Exact migration SQL (tables + RLS + `handle_new_user` trigger).
2. File-by-file change list: new (`AuthProvider`, `supabaseStore.ts`, auth screens,
   import prompt, id-remapper, `database.types.ts`), modified (`AppContext.tsx`,
   `App.tsx`, `lib/supabase.ts`, sidebar for logout), retired (`localStore.ts` path).
3. Ordered, verifiable task breakdown (setup → schema/RLS → auth → data layer →
   import → tests), each task independently checkable.
4. Acceptance criteria + manual test script.
5. Coordination note: ledger claim scope + branch name.
