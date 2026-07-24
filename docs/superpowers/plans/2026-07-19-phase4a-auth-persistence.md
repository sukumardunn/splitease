# Phase 4a — Auth + Core Persistence Implementation Plan

> **⚠️ BRANCHING UPDATE (2026-07-25):** `claude-driven-changes` is now the
> working line; **`master` is frozen** at upstream `a8266c6` and takes no
> commits. This plan's COORDINATION section below (branch from `master`, commit
> claims/board/ledger "on master", merge `feature/phase4a` → `master`) describes
> how Phase 4a *was* executed and is kept for the historical record. **For any new
> work, read every `master` in this document as `claude-driven-changes`.** The
> authoritative rules are `CLAUDE.md` and `.coordination/PROTOCOL.md` §0.

> **⚠️ T8 UPDATE (2026-07-24, agent5):** T8 is now executed via a **Docker-free
> hosted-cloud path** (the machine's Docker install kept failing). The active,
> authoritative T8 plan is `~/.claude/plans/composed-zooming-alpaca.md` — it
> supersedes the local-Docker "Node 20 + `supabase start`" T8 checklist below.
> Migration is applied via the hosted project's SQL editor; §9 acceptance runs
> against the cloud DB. Node v26 is used (Node 20 fallback only).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email+password auth and owner-scoped Postgres persistence (local Supabase) behind the unchanged `AppContextType` seam, with optimistic-online mutations and one-time localStorage import.

**Architecture:** New `AuthProvider` gates the app; `services/supabaseStore.ts` does all typed CRUD + snake↔camel mapping; `AppContext` keeps its exact public interface but applies mutations optimistically, persists async, and rolls back + toasts on failure; a pure id-remapper imports pre-4a localStorage data on first login. See spec: `docs/superpowers/specs/2026-07-19-phase4a-auth-persistence-spec.md` (READ IT FIRST — its DDL and contracts are authoritative).

**Tech Stack:** Vite + React 18 + TS + Tailwind + lucide-react, `@supabase/supabase-js@^2.39` (already a dep), local Supabase stack (Docker + supabase CLI), vitest + @testing-library/react.

## Global Constraints

- **No new npm dependencies.** UI: only Tailwind + `lucide-react` (`jsapps/.bolt/prompt`).
- **Node 20 required** for vite/vitest/tsc: run `source ~/.nvm/nvm.sh && nvm use 20` (or `export PATH="$HOME/.nvm/versions/node/v20."*"/bin:$PATH"`) before any npm script. Node 16 (default) crashes them.
- **`AppContextType` must stay byte-identical** — pages must not change.
- **Pure engines untouched:** `splitEngine.ts`, `splitCalculator.ts`, `activityLog.ts`.
- **All 65 pre-existing tests must stay green**; `npm run typecheck`, `npm run test`, `npm run lint` from `jsapps/` must pass before any merge.
- All work under repo root `/…/splitease`; app code in `jsapps/`.
- New entity ids: `crypto.randomUUID()`. Person-ref DB columns are plain `uuid`, **no FK** (flat person namespace — see spec §1).
- Commit style: concise, imperative.

---

## COORDINATION — multiple agents, multiple unrelated sessions (MANDATORY)

Agents executing this plan may run **in parallel from sessions that share nothing but the filesystem + git**. The protocol in `.coordination/PROTOCOL.md` applies, extended for this phase:

**Shared state surfaces**
1. `.coordination/LEDGER.md` — session-level claims (protocol §2). One row per session/agent-id.
2. `.coordination/PHASE4A_BOARD.md` — **authoritative per-TASK claim/status board for this plan.** Claim tasks here, not in the plan file.
3. Branch `feature/phase4a` — integration branch (base `master`). All task work merges here. **Never rebase or force-push it.**

**The loop each executing session follows, per task:**
1. `git checkout master && git pull 2>/dev/null; true` (no-op if no remote), re-read `PHASE4A_BOARD.md` **from disk**.
2. Pick the lowest-numbered task whose `status` is `UNCLAIMED` **and** whose `depends_on` tasks are all `DONE`. If none: stop (or wait).
3. Claim it: set that row `status=CLAIMED`, `agent=<your id>`, `branch=agent/4a-t<N>-<agentid>`, `updated_at=<ISO now>`; also ensure you have an ACTIVE row in `LEDGER.md` (scope = the task's Files list). Commit **on master** immediately: `coord: <agentid> claim 4a-T<N>`. If the commit conflicts (someone claimed simultaneously), re-read the board and go back to step 2.
4. Work in an **isolated worktree** so parallel sessions never fight over the checked-out branch: `git worktree add .worktrees/4a-t<N> -b agent/4a-t<N>-<agentid> feature/phase4a`. Do the task there. (Remove the worktree after merge: `git worktree remove .worktrees/4a-t<N>`.)
5. Heartbeat: every ~15 min touch your LEDGER row `last_heartbeat` (commit on master).
6. Verify (Node 20): `npm run test && npm run typecheck && npm run lint` in `jsapps/` — all green, or do not merge.
7. Merge: `git checkout feature/phase4a && git merge --no-ff agent/4a-t<N>-<agentid>`. If the merge conflicts, resolve favoring the other agent's committed work in files outside your task's Files list.
8. Release: on master, set board row `status=DONE` + `updated_at`, commit `coord: <agentid> done 4a-T<N>`. Then loop to step 2.

**Hard rules**
- **Exclusive files** (one live claimant, keep claims short): `jsapps/src/context/AppContext.tsx`, `jsapps/src/App.tsx`, `jsapps/src/lib/database.types.ts`, `supabase/migrations/**`. The task boundaries below already serialize these — do not improvise extra edits to them from another task.
- A `CLAIMED` row with ledger heartbeat > 30 min old is stale → reclaimable (protocol §5): set old row note `reclaimed`, inspect its branch for partial work, re-claim.
- Task numbering = dependency truth. Never start a task whose `depends_on` isn't all `DONE` on the board.
- Board/ledger commits go on `master` (protocol §7); code commits only on your `agent/4a-t*` branch; integration only on `feature/phase4a`.
- If BLOCKED (e.g. T8 needs Docker install by the user), set board row `status=BLOCKED` + note, release your other claims, move on.

**Dependency graph / parallel waves**

```
Wave 1 (parallel): T1 (migration SQL)   T2 (database.types + client)   T3 (import remapper)
Wave 2 (parallel): T4 (supabaseStore)   T5 (auth provider/screen/gate)      [both need T2]
Wave 3:            T6 (AppContext optimistic refactor)                      [needs T4+T5]
Wave 4:            T7 (import prompt & wiring)                              [needs T3+T6]
Wave 5:            T8 (env bring-up + live verification)                    [needs T1–T7; Docker install can start anytime]
```

---

### Task T1: Postgres migration (schema + RLS + trigger)

**Files:**
- Create: `supabase/migrations/20260719000001_phase4a_auth_persistence.sql`

**Interfaces:**
- Consumes: spec §2 DDL (authoritative).
- Produces: the 9 tables (`profiles`, `friends`, `groups`, `group_members`, `expenses`, `expense_payers`, `expense_splits`, `settlements`, `activity_events`), RLS policies, `handle_new_user()` trigger — the contract T2's types and T4's store are written against.

- [ ] **Step 1: Create the migration file** — open `docs/superpowers/specs/2026-07-19-phase4a-auth-persistence-spec.md` §2 and copy the entire ```sql block VERBATIM (from `-- Phase 4a:` comment through the final `activity_events_own` policy) into `supabase/migrations/20260719000001_phase4a_auth_persistence.sql`. No edits, no reformatting.
- [ ] **Step 2: Sanity-check** — `grep -c "create table" supabase/migrations/20260719000001_phase4a_auth_persistence.sql` → expected `9`; `grep -c "create policy" …` → expected `10`; `grep -c "enable row level security" …` → expected `9`.
- [ ] **Step 3: Commit** — `git add supabase/migrations && git commit -m "feat(4a): schema + RLS + handle_new_user migration"`.

*(No runnable DB yet — SQL executes in T8 via `supabase db reset`. The greps + reviewer eyes are the gate here.)*

---

### Task T2: `database.types.ts` (hand-authored) + compiling supabase client

**Files:**
- Create: `jsapps/src/lib/database.types.ts`
- Verify (no edits expected): `jsapps/src/lib/supabase.ts`

**Interfaces:**
- Consumes: spec §2 DDL column list.
- Produces: `export type Json`, `export type Database` with `Database['public']['Tables'][<table>]['Row'|'Insert'|'Update']` for all 9 tables — imported by `lib/supabase.ts` (already: `createClient<Database>`) and by T4's store.

- [ ] **Step 1: Write `jsapps/src/lib/database.types.ts`** with exactly this content:

```ts
// Hand-authored to match supabase/migrations/20260719000001_phase4a_auth_persistence.sql.
// T8 reconciles this against `supabase gen types typescript --local` (generator wins).
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; name: string; email: string; avatar: string; created_at: string };
        Insert: { id: string; name?: string; email?: string; avatar?: string; created_at?: string };
        Update: { id?: string; name?: string; email?: string; avatar?: string; created_at?: string };
        Relationships: [];
      };
      friends: {
        Row: { id: string; owner_id: string; name: string; email: string; avatar: string; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; name: string; email?: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; name?: string; email?: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      groups: {
        Row: { id: string; owner_id: string; name: string; avatar: string; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; name: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; name?: string; avatar?: string; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      group_members: {
        Row: { group_id: string; person_id: string };
        Insert: { group_id: string; person_id: string };
        Update: { group_id?: string; person_id?: string };
        Relationships: [];
      };
      expenses: {
        Row: { id: string; owner_id: string; description: string; amount: number; paid_by: string; date: string; category: string; currency: string; group_id: string | null; notes: string | null; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; description: string; amount: number; paid_by: string; date?: string; category?: string; currency?: string; group_id?: string | null; notes?: string | null; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; description?: string; amount?: number; paid_by?: string; date?: string; category?: string; currency?: string; group_id?: string | null; notes?: string | null; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      expense_payers: {
        Row: { expense_id: string; person_id: string; amount: number };
        Insert: { expense_id: string; person_id: string; amount: number };
        Update: { expense_id?: string; person_id?: string; amount?: number };
        Relationships: [];
      };
      expense_splits: {
        Row: { expense_id: string; person_id: string; amount: number };
        Insert: { expense_id: string; person_id: string; amount: number };
        Update: { expense_id?: string; person_id?: string; amount?: number };
        Relationships: [];
      };
      settlements: {
        Row: { id: string; owner_id: string; from_person_id: string; to_person_id: string; amount: number; currency: string; date: string; group_id: string | null; deleted_at: string | null; created_at: string };
        Insert: { id?: string; owner_id: string; from_person_id: string; to_person_id: string; amount: number; currency?: string; date?: string; group_id?: string | null; deleted_at?: string | null; created_at?: string };
        Update: { id?: string; owner_id?: string; from_person_id?: string; to_person_id?: string; amount?: number; currency?: string; date?: string; group_id?: string | null; deleted_at?: string | null; created_at?: string };
        Relationships: [];
      };
      activity_events: {
        Row: { id: string; owner_id: string; actor_id: string; action: string; entity_type: string; entity_id: string; group_id: string | null; before: Json | null; after: Json | null; created_at: string };
        Insert: { id?: string; owner_id: string; actor_id: string; action: string; entity_type: string; entity_id: string; group_id?: string | null; before?: Json | null; after?: Json | null; created_at?: string };
        Update: { id?: string; owner_id?: string; actor_id?: string; action?: string; entity_type?: string; entity_id?: string; group_id?: string | null; before?: Json | null; after?: Json | null; created_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
```

- [ ] **Step 2: Verify it compiles** — from `jsapps/` (Node 20): `npm run typecheck`. Expected: exit 0. (`lib/supabase.ts` imports `./database.types` and now resolves. Note: `supabase.ts` reads env at import time but nothing imports it yet — typecheck only.)
- [ ] **Step 3: Run full suite** — `npm run test` → 65 passing, `npm run lint` → clean.
- [ ] **Step 4: Commit** — `git add src/lib/database.types.ts && git commit -m "feat(4a): hand-authored Database types; lib/supabase.ts now compiles"`.

---

### Task T3: Pure import id-remapper (TDD)

**Files:**
- Create: `jsapps/src/services/importRemapper.ts`
- Test: `jsapps/src/services/importRemapper.test.ts`

**Interfaces:**
- Consumes: `AppState`, domain types from `src/types.ts`; `ActivityEvent` from `services/activityLog`.
- Produces: `export const IMPORT_HANDLED_KEY = 'splitease.importHandled'`; `export interface RemappedState { friends: Friend[]; groups: Group[]; expenses: Expense[]; settlements: Settlement[]; activityEvents: ActivityEvent[] }`; `export function remapLocalState(state: AppState, profileId: string, genId?: () => string): RemappedState`. Used by T7.

- [ ] **Step 1: Write the failing tests** — `jsapps/src/services/importRemapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { remapLocalState } from './importRemapper';
import { AppState } from '../types';

const PROFILE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function seqGen(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

function baseState(): AppState {
  return {
    currentUser: { id: 'user_1', name: 'Me', email: 'me@x.com', avatar: '' },
    friends: [
      { id: 'user_2', name: 'Ana', email: 'a@x.com', avatar: '' },
      { id: 'user_3', name: 'Bo', email: 'b@x.com', avatar: '' },
    ],
    groups: [
      { id: 'grp_1', name: 'Trip', members: ['user_1', 'user_2'], avatar: '', deletedAt: null },
    ],
    expenses: [
      {
        id: 'exp_1', description: 'Dinner', amount: 30, paidBy: 'user_1',
        payers: [{ userId: 'user_1', amount: 30 }],
        splitWith: [{ userId: 'user_1', amount: 15 }, { userId: 'user_2', amount: 15 }],
        date: '2026-01-01T00:00:00.000Z', category: 'dining', currency: 'USD',
        groupId: 'grp_1', deletedAt: null, notes: 'yum',
      },
    ],
    settlements: [
      { id: 'set_1', fromUserId: 'user_2', toUserId: 'user_1', amount: 15, currency: 'USD', date: '2026-01-02T00:00:00.000Z', groupId: 'grp_1', deletedAt: null },
    ],
    activityEvents: [
      { id: 'evt_1', actorId: 'user_1', action: 'expense.create', entityType: 'expense', entityId: 'exp_1', groupId: 'grp_1', before: null, after: { description: 'Dinner' }, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
  };
}

describe('remapLocalState', () => {
  it('maps currentUser id to the profile id everywhere it appears', () => {
    const out = remapLocalState(baseState(), PROFILE_ID, seqGen());
    expect(out.expenses[0].paidBy).toBe(PROFILE_ID);
    expect(out.expenses[0].payers![0].userId).toBe(PROFILE_ID);
    expect(out.expenses[0].splitWith[0].userId).toBe(PROFILE_ID);
    expect(out.settlements[0].toUserId).toBe(PROFILE_ID);
    expect(out.groups[0].members).toContain(PROFILE_ID);
    expect(out.activityEvents[0].actorId).toBe(PROFILE_ID);
  });

  it('maps each old id to one stable new uuid across all references', () => {
    const out = remapLocalState(baseState(), PROFILE_ID, seqGen());
    const ana = out.friends[0].id;
    expect(out.expenses[0].splitWith[1].userId).toBe(ana);
    expect(out.settlements[0].fromUserId).toBe(ana);
    expect(out.groups[0].members).toContain(ana);
    const grp = out.groups[0].id;
    expect(out.expenses[0].groupId).toBe(grp);
    expect(out.settlements[0].groupId).toBe(grp);
    expect(out.activityEvents[0].groupId).toBe(grp);
    expect(out.activityEvents[0].entityId).toBe(out.expenses[0].id);
  });

  it('nulls group refs pointing at groups absent from the imported state (FK safety)', () => {
    const s = baseState();
    s.expenses[0].groupId = 'grp_missing';
    s.settlements[0].groupId = 'grp_missing';
    const out = remapLocalState(s, PROFILE_ID, seqGen());
    expect(out.expenses[0].groupId).toBeNull();
    expect(out.settlements[0].groupId).toBeNull();
  });

  it('assigns fresh uuids to dangling person refs instead of leaking old strings', () => {
    const s = baseState();
    s.expenses[0].splitWith.push({ userId: 'user_ghost', amount: 0 });
    const out = remapLocalState(s, PROFILE_ID, seqGen());
    const ghost = out.expenses[0].splitWith[2].userId;
    expect(ghost).toMatch(/^[0-9a-f-]{36}$/);
    expect(ghost).not.toBe('user_ghost');
  });

  it('preserves non-id fields verbatim (amounts, dates, deletedAt, notes)', () => {
    const out = remapLocalState(baseState(), PROFILE_ID, seqGen());
    expect(out.expenses[0].amount).toBe(30);
    expect(out.expenses[0].notes).toBe('yum');
    expect(out.expenses[0].date).toBe('2026-01-01T00:00:00.000Z');
    expect(out.expenses[0].deletedAt).toBeNull();
    expect(out.settlements[0].amount).toBe(15);
  });

  it('is deterministic given the same genId sequence', () => {
    const a = remapLocalState(baseState(), PROFILE_ID, seqGen());
    const b = remapLocalState(baseState(), PROFILE_ID, seqGen());
    expect(a).toEqual(b);
  });

  it('does not mutate the input state', () => {
    const s = baseState();
    const copy = JSON.parse(JSON.stringify(s));
    remapLocalState(s, PROFILE_ID, seqGen());
    expect(s).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test -- importRemapper` → FAIL (module not found).
- [ ] **Step 3: Implement `jsapps/src/services/importRemapper.ts`:**

```ts
/**
 * Pure remapper for the one-time localStorage → Postgres import (Phase 4a).
 * Rewrites every old string id (user_…, exp_…, grp_…) to a fresh uuid,
 * mapping the old currentUser id to the authenticated profile id.
 * No side effects; genId injectable for tests.
 */
import { AppState, Expense, Friend, Group, Settlement } from '../types';
import { ActivityEvent } from './activityLog';

/** localStorage flag: import already offered/completed for this browser. */
export const IMPORT_HANDLED_KEY = 'splitease.importHandled';

export interface RemappedState {
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activityEvents: ActivityEvent[];
}

export function remapLocalState(
  state: AppState,
  profileId: string,
  genId: () => string = () => crypto.randomUUID()
): RemappedState {
  const idMap = new Map<string, string>([[state.currentUser.id, profileId]]);
  const mapId = (old: string): string => {
    const hit = idMap.get(old);
    if (hit) return hit;
    const next = genId();
    idMap.set(old, next);
    return next;
  };
  const mapNullable = (old: string | null | undefined): string | null =>
    old == null ? null : mapId(old);
  // Group refs become real FKs in Postgres — null them when the target group
  // isn't part of the imported payload.
  const knownGroups = new Set(state.groups.map((g) => g.id));
  const mapGroupRef = (old: string | null | undefined): string | null =>
    old != null && knownGroups.has(old) ? mapId(old) : null;

  const friends = state.friends.map((f) => ({ ...f, id: mapId(f.id) }));
  const groups = state.groups.map((g) => ({
    ...g,
    id: mapId(g.id),
    members: g.members.map(mapId),
  }));
  const expenses = state.expenses.map((e) => ({
    ...e,
    id: mapId(e.id),
    paidBy: mapId(e.paidBy),
    payers: e.payers?.map((p) => ({ ...p, userId: mapId(p.userId) })),
    splitWith: e.splitWith.map((s) => ({ ...s, userId: mapId(s.userId) })),
    groupId: mapGroupRef(e.groupId),
  }));
  const settlements = state.settlements.map((s) => ({
    ...s,
    id: mapId(s.id),
    fromUserId: mapId(s.fromUserId),
    toUserId: mapId(s.toUserId),
    groupId: mapGroupRef(s.groupId),
  }));
  const activityEvents = state.activityEvents.map((ev) => ({
    ...ev,
    id: mapId(ev.id),
    actorId: mapId(ev.actorId),
    entityId: mapId(ev.entityId),
    groupId: mapNullable(ev.groupId),
  }));

  return { friends, groups, expenses, settlements, activityEvents };
}
```

- [ ] **Step 4: Run tests** — `npm run test -- importRemapper` → 7 passing; full `npm run test` → 72 passing; `npm run typecheck` clean.
- [ ] **Step 5: Commit** — `git add src/services/importRemapper.ts src/services/importRemapper.test.ts && git commit -m "feat(4a): pure localStorage->uuid import remapper + tests"`.

---

### Task T4: `services/supabaseStore.ts` (mappers TDD + CRUD)

**Files:**
- Create: `jsapps/src/services/supabaseStore.ts`
- Test: `jsapps/src/services/supabaseStore.test.ts`

**Interfaces:**
- Consumes: `Database` types (T2), `supabase` client from `../lib/supabase` (mocked in tests), domain types.
- Produces (used by T6/T7 — exact signatures): spec §5 block, notably `fetchAll(userId): Promise<RemoteState>`, `insertExpense/updateExpense(ownerId, e: Expense)`, `setExpenseDeleted(id, deletedAt: string | null)`, `purgeExpense(id)`, group equivalents, `insertSettlement`, `insertActivityEvent`, `importState(ownerId, payload: ImportPayload)`, plus pure exported mappers `expenseToRow/expenseFromRow/groupToRow/groupFromRow/friendToRow/friendFromRow/settlementToRow/settlementFromRow/activityEventToRow/activityEventFromRow` and `interface RemoteState`.

- [ ] **Step 1: Write failing mapper tests** — `jsapps/src/services/supabaseStore.test.ts` (top of file mocks the client so importing the store never touches env):

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import {
  activityEventFromRow, activityEventToRow,
  expenseFromRow, expenseToRow,
  friendFromRow, friendToRow,
  groupFromRow, groupToRow,
  settlementFromRow, settlementToRow,
} from './supabaseStore';
import { Expense, Settlement } from '../types';
import { ActivityEvent } from './activityLog';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('expense mapping', () => {
  const expense: Expense = {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    description: 'Dinner', amount: 30,
    paidBy: OWNER,
    payers: [{ userId: OWNER, amount: 30 }],
    splitWith: [{ userId: OWNER, amount: 15 }],
    date: '2026-01-01T00:00:00.000Z', category: 'dining', currency: 'USD',
    groupId: null, deletedAt: null, notes: 'yum',
  };

  it('round-trips an expense with payers and notes', () => {
    const bundle = expenseToRow(OWNER, expense);
    expect(bundle.expense.owner_id).toBe(OWNER);
    expect(bundle.expense.paid_by).toBe(OWNER);
    expect(bundle.payers).toHaveLength(1);
    expect(bundle.splits).toHaveLength(1);
    const back = expenseFromRow(
      { ...bundle.expense, created_at: 'x' } as never,
      bundle.payers as never[],
      bundle.splits as never[]
    );
    expect(back).toEqual(expense);
  });

  it('maps empty payers to undefined and null notes to undefined', () => {
    const e: Expense = { ...expense, payers: undefined, notes: undefined };
    const bundle = expenseToRow(OWNER, e);
    expect(bundle.payers).toHaveLength(0);
    expect(bundle.expense.notes).toBeNull();
    const back = expenseFromRow({ ...bundle.expense, created_at: 'x' } as never, [], bundle.splits as never[]);
    expect(back.payers).toBeUndefined();
    expect(back.notes).toBeUndefined();
  });
});

describe('group mapping', () => {
  it('round-trips a group with members', () => {
    const g = { id: 'cccccccc-0000-4000-8000-000000000001', name: 'Trip', members: [OWNER], avatar: 'a', deletedAt: null };
    const bundle = groupToRow(OWNER, g);
    expect(bundle.members[0]).toEqual({ group_id: g.id, person_id: OWNER });
    const back = groupFromRow({ ...bundle.group, created_at: 'x' } as never, bundle.members as never[]);
    expect(back).toEqual(g);
  });
});

describe('friend mapping', () => {
  it('round-trips a friend', () => {
    const f = { id: 'dddddddd-0000-4000-8000-000000000001', name: 'Ana', email: 'a@x.com', avatar: '' };
    const back = friendFromRow({ ...friendToRow(OWNER, f), deleted_at: null, created_at: 'x' } as never);
    expect(back).toEqual(f);
  });
});

describe('settlement mapping', () => {
  it('round-trips a settlement', () => {
    const s: Settlement = {
      id: 'eeeeeeee-0000-4000-8000-000000000001',
      fromUserId: OWNER, toUserId: 'ffffffff-0000-4000-8000-000000000001',
      amount: 15, currency: 'USD', date: '2026-01-02T00:00:00.000Z',
      groupId: null, deletedAt: null,
    };
    const back = settlementFromRow({ ...settlementToRow(OWNER, s), created_at: 'x' } as never);
    expect(back).toEqual(s);
  });
});

describe('activity event mapping', () => {
  it('round-trips an event with snapshots', () => {
    const ev: ActivityEvent = {
      id: '99999999-0000-4000-8000-000000000001',
      actorId: OWNER, action: 'expense.create', entityType: 'expense',
      entityId: 'bbbbbbbb-0000-4000-8000-000000000001',
      groupId: null, before: null, after: { description: 'Dinner' },
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const back = activityEventFromRow(activityEventToRow(OWNER, ev) as never);
    expect(back).toEqual(ev);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test -- supabaseStore` → FAIL (module not found).
- [ ] **Step 3: Implement `jsapps/src/services/supabaseStore.ts`:**

```ts
/**
 * Typed async persistence layer over the local Supabase stack (Phase 4a).
 * Maps DB rows (snake_case) <-> domain types (camelCase). Owner-scoped:
 * every query relies on RLS (owner_id = auth.uid()) for isolation.
 * Throws Error on any failure — callers (AppContext) roll back + toast.
 */
import { supabase } from '../lib/supabase';
import type { Database, Json } from '../lib/database.types';
import { ActivityAction, ActivityEntityType, ActivityEvent } from './activityLog';
import { Expense, ExpenseCategory, Friend, Group, Settlement, User } from '../types';

type Tables = Database['public']['Tables'];
type ProfileRow = Tables['profiles']['Row'];
type FriendRow = Tables['friends']['Row'];
type GroupRow = Tables['groups']['Row'];
type GroupMemberRow = Tables['group_members']['Row'];
type ExpenseRow = Tables['expenses']['Row'];
type ExpensePayerRow = Tables['expense_payers']['Row'];
type ExpenseSplitRow = Tables['expense_splits']['Row'];
type SettlementRow = Tables['settlements']['Row'];
type ActivityEventRow = Tables['activity_events']['Row'];

// ---------- pure mappers (exported for unit tests) ----------

export function profileFromRow(row: ProfileRow): User {
  return { id: row.id, name: row.name, email: row.email, avatar: row.avatar };
}

export function friendToRow(ownerId: string, f: Friend): Tables['friends']['Insert'] {
  return { id: f.id, owner_id: ownerId, name: f.name, email: f.email, avatar: f.avatar };
}
export function friendFromRow(row: FriendRow): Friend {
  return { id: row.id, name: row.name, email: row.email, avatar: row.avatar };
}

export interface GroupRowBundle {
  group: Tables['groups']['Insert'];
  members: Tables['group_members']['Insert'][];
}
export function groupToRow(ownerId: string, g: Group): GroupRowBundle {
  return {
    group: { id: g.id, owner_id: ownerId, name: g.name, avatar: g.avatar, deleted_at: g.deletedAt ?? null },
    members: g.members.map((personId) => ({ group_id: g.id, person_id: personId })),
  };
}
export function groupFromRow(row: GroupRow, memberRows: GroupMemberRow[]): Group {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    members: memberRows.map((m) => m.person_id),
    deletedAt: row.deleted_at,
  };
}

export interface ExpenseRowBundle {
  expense: Tables['expenses']['Insert'];
  payers: Tables['expense_payers']['Insert'][];
  splits: Tables['expense_splits']['Insert'][];
}
export function expenseToRow(ownerId: string, e: Expense): ExpenseRowBundle {
  return {
    expense: {
      id: e.id,
      owner_id: ownerId,
      description: e.description,
      amount: e.amount,
      paid_by: e.paidBy,
      date: e.date,
      category: e.category,
      currency: e.currency,
      group_id: e.groupId,
      notes: e.notes ?? null,
      deleted_at: e.deletedAt ?? null,
    },
    payers: (e.payers ?? []).map((p) => ({ expense_id: e.id, person_id: p.userId, amount: p.amount })),
    splits: e.splitWith.map((s) => ({ expense_id: e.id, person_id: s.userId, amount: s.amount })),
  };
}
export function expenseFromRow(
  row: ExpenseRow,
  payerRows: ExpensePayerRow[],
  splitRows: ExpenseSplitRow[]
): Expense {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    paidBy: row.paid_by,
    payers:
      payerRows.length > 0
        ? payerRows.map((p) => ({ userId: p.person_id, amount: Number(p.amount) }))
        : undefined,
    splitWith: splitRows.map((s) => ({ userId: s.person_id, amount: Number(s.amount) })),
    date: row.date,
    category: row.category as ExpenseCategory,
    currency: row.currency,
    groupId: row.group_id,
    deletedAt: row.deleted_at,
    notes: row.notes ?? undefined,
  };
}

export function settlementToRow(ownerId: string, s: Settlement): Tables['settlements']['Insert'] {
  return {
    id: s.id,
    owner_id: ownerId,
    from_person_id: s.fromUserId,
    to_person_id: s.toUserId,
    amount: s.amount,
    currency: s.currency,
    date: s.date,
    group_id: s.groupId ?? null,
    deleted_at: s.deletedAt ?? null,
  };
}
export function settlementFromRow(row: SettlementRow): Settlement {
  return {
    id: row.id,
    fromUserId: row.from_person_id,
    toUserId: row.to_person_id,
    amount: Number(row.amount),
    currency: row.currency,
    date: row.date,
    groupId: row.group_id,
    deletedAt: row.deleted_at,
  };
}

export function activityEventToRow(ownerId: string, ev: ActivityEvent): Tables['activity_events']['Insert'] {
  return {
    id: ev.id,
    owner_id: ownerId,
    actor_id: ev.actorId,
    action: ev.action,
    entity_type: ev.entityType,
    entity_id: ev.entityId,
    group_id: ev.groupId ?? null,
    before: (ev.before ?? null) as Json,
    after: (ev.after ?? null) as Json,
    created_at: ev.createdAt,
  };
}
export function activityEventFromRow(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action as ActivityAction,
    entityType: row.entity_type as ActivityEntityType,
    entityId: row.entity_id,
    groupId: row.group_id,
    before: row.before,
    after: row.after,
    createdAt: row.created_at,
  };
}

// ---------- helpers ----------

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

// ---------- reads ----------

export interface RemoteState {
  currentUser: User;
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activityEvents: ActivityEvent[];
}

export async function fetchAll(userId: string): Promise<RemoteState> {
  const [profile, friends, groups, members, expenses, payers, splits, settlements, events] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('friends').select('*').is('deleted_at', null).order('created_at'),
      supabase.from('groups').select('*').order('created_at'),
      supabase.from('group_members').select('*'),
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('expense_payers').select('*'),
      supabase.from('expense_splits').select('*'),
      supabase.from('settlements').select('*').order('date', { ascending: false }),
      supabase.from('activity_events').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
  if (profile.error) fail('fetch profile', profile.error.message);
  if (friends.error) fail('fetch friends', friends.error.message);
  if (groups.error) fail('fetch groups', groups.error.message);
  if (members.error) fail('fetch group_members', members.error.message);
  if (expenses.error) fail('fetch expenses', expenses.error.message);
  if (payers.error) fail('fetch expense_payers', payers.error.message);
  if (splits.error) fail('fetch expense_splits', splits.error.message);
  if (settlements.error) fail('fetch settlements', settlements.error.message);
  if (events.error) fail('fetch activity_events', events.error.message);

  const payersByExpense = new Map<string, ExpensePayerRow[]>();
  for (const p of payers.data) {
    const list = payersByExpense.get(p.expense_id) ?? [];
    list.push(p);
    payersByExpense.set(p.expense_id, list);
  }
  const splitsByExpense = new Map<string, ExpenseSplitRow[]>();
  for (const s of splits.data) {
    const list = splitsByExpense.get(s.expense_id) ?? [];
    list.push(s);
    splitsByExpense.set(s.expense_id, list);
  }
  const membersByGroup = new Map<string, GroupMemberRow[]>();
  for (const m of members.data) {
    const list = membersByGroup.get(m.group_id) ?? [];
    list.push(m);
    membersByGroup.set(m.group_id, list);
  }

  return {
    currentUser: profileFromRow(profile.data),
    friends: friends.data.map(friendFromRow),
    groups: groups.data.map((g) => groupFromRow(g, membersByGroup.get(g.id) ?? [])),
    expenses: expenses.data.map((e) =>
      expenseFromRow(e, payersByExpense.get(e.id) ?? [], splitsByExpense.get(e.id) ?? [])
    ),
    settlements: settlements.data.map(settlementFromRow),
    activityEvents: events.data.map(activityEventFromRow),
  };
}

// ---------- expense writes ----------

async function writeExpenseChildren(bundle: ExpenseRowBundle): Promise<void> {
  if (bundle.payers.length > 0) {
    const { error } = await supabase.from('expense_payers').insert(bundle.payers);
    if (error) fail('insert expense_payers', error.message);
  }
  if (bundle.splits.length > 0) {
    const { error } = await supabase.from('expense_splits').insert(bundle.splits);
    if (error) fail('insert expense_splits', error.message);
  }
}

export async function insertExpense(ownerId: string, e: Expense): Promise<void> {
  const bundle = expenseToRow(ownerId, e);
  const { error } = await supabase.from('expenses').insert(bundle.expense);
  if (error) fail('insert expense', error.message);
  await writeExpenseChildren(bundle);
}

export async function updateExpense(ownerId: string, e: Expense): Promise<void> {
  const bundle = expenseToRow(ownerId, e);
  const { error } = await supabase.from('expenses').upsert(bundle.expense);
  if (error) fail('update expense', error.message);
  const del1 = await supabase.from('expense_payers').delete().eq('expense_id', e.id);
  if (del1.error) fail('replace expense_payers', del1.error.message);
  const del2 = await supabase.from('expense_splits').delete().eq('expense_id', e.id);
  if (del2.error) fail('replace expense_splits', del2.error.message);
  await writeExpenseChildren(bundle);
}

export async function setExpenseDeleted(id: string, deletedAt: string | null): Promise<void> {
  const { error } = await supabase.from('expenses').update({ deleted_at: deletedAt }).eq('id', id);
  if (error) fail('set expense deleted', error.message);
}

export async function purgeExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) fail('purge expense', error.message);
}

// ---------- group writes ----------

export async function insertGroup(ownerId: string, g: Group): Promise<void> {
  const bundle = groupToRow(ownerId, g);
  const { error } = await supabase.from('groups').insert(bundle.group);
  if (error) fail('insert group', error.message);
  if (bundle.members.length > 0) {
    const { error: me } = await supabase.from('group_members').insert(bundle.members);
    if (me) fail('insert group_members', me.message);
  }
}

export async function updateGroup(ownerId: string, g: Group): Promise<void> {
  const bundle = groupToRow(ownerId, g);
  const { error } = await supabase.from('groups').upsert(bundle.group);
  if (error) fail('update group', error.message);
  const del = await supabase.from('group_members').delete().eq('group_id', g.id);
  if (del.error) fail('replace group_members', del.error.message);
  if (bundle.members.length > 0) {
    const { error: me } = await supabase.from('group_members').insert(bundle.members);
    if (me) fail('insert group_members', me.message);
  }
}

export async function setGroupDeleted(id: string, deletedAt: string | null): Promise<void> {
  const { error } = await supabase.from('groups').update({ deleted_at: deletedAt }).eq('id', id);
  if (error) fail('set group deleted', error.message);
}

export async function purgeGroup(id: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) fail('purge group', error.message);
}

// ---------- settlements / activity ----------

export async function insertSettlement(ownerId: string, s: Settlement): Promise<void> {
  const { error } = await supabase.from('settlements').insert(settlementToRow(ownerId, s));
  if (error) fail('insert settlement', error.message);
}

export async function insertActivityEvent(ownerId: string, ev: ActivityEvent): Promise<void> {
  const { error } = await supabase.from('activity_events').insert(activityEventToRow(ownerId, ev));
  if (error) fail('insert activity_event', error.message);
}

// ---------- one-time import ----------

export interface ImportPayload {
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activityEvents: ActivityEvent[];
}

/** Batch-insert an already-remapped local state. Parents before children. */
export async function importState(ownerId: string, payload: ImportPayload): Promise<void> {
  if (payload.friends.length > 0) {
    const { error } = await supabase.from('friends').insert(payload.friends.map((f) => friendToRow(ownerId, f)));
    if (error) fail('import friends', error.message);
  }
  const groupBundles = payload.groups.map((g) => groupToRow(ownerId, g));
  if (groupBundles.length > 0) {
    const { error } = await supabase.from('groups').insert(groupBundles.map((b) => b.group));
    if (error) fail('import groups', error.message);
    const members = groupBundles.flatMap((b) => b.members);
    if (members.length > 0) {
      const { error: me } = await supabase.from('group_members').insert(members);
      if (me) fail('import group_members', me.message);
    }
  }
  const expenseBundles = payload.expenses.map((e) => expenseToRow(ownerId, e));
  if (expenseBundles.length > 0) {
    const { error } = await supabase.from('expenses').insert(expenseBundles.map((b) => b.expense));
    if (error) fail('import expenses', error.message);
    const payers = expenseBundles.flatMap((b) => b.payers);
    if (payers.length > 0) {
      const { error: pe } = await supabase.from('expense_payers').insert(payers);
      if (pe) fail('import expense_payers', pe.message);
    }
    const splits = expenseBundles.flatMap((b) => b.splits);
    if (splits.length > 0) {
      const { error: se } = await supabase.from('expense_splits').insert(splits);
      if (se) fail('import expense_splits', se.message);
    }
  }
  if (payload.settlements.length > 0) {
    const { error } = await supabase.from('settlements').insert(payload.settlements.map((s) => settlementToRow(ownerId, s)));
    if (error) fail('import settlements', error.message);
  }
  if (payload.activityEvents.length > 0) {
    const { error } = await supabase.from('activity_events').insert(payload.activityEvents.map((ev) => activityEventToRow(ownerId, ev)));
    if (error) fail('import activity_events', error.message);
  }
}
```

- [ ] **Step 4: Run tests** — `npm run test -- supabaseStore` → all passing; full `npm run test`, `npm run typecheck`, `npm run lint` clean.
- [ ] **Step 5: Commit** — `git add src/services/supabaseStore.ts src/services/supabaseStore.test.ts && git commit -m "feat(4a): typed supabase store — mappers, fetchAll, CRUD, batch import"`.

---

### Task T5: Auth — provider, screen, gate, logout

**Files:**
- Create: `jsapps/src/context/AuthContext.tsx`
- Create: `jsapps/src/components/auth/AuthScreen.tsx`
- Create: `jsapps/src/components/ui/LoadingScreen.tsx`
- Modify: `jsapps/src/App.tsx`
- Modify: `jsapps/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase` (T2); `clearState` from `services/localStore`.
- Produces (used by T6): `useAuth(): { session: Session | null; loading: boolean; signUp(name,email,password): Promise<{error: string|null}>; signIn(email,password): Promise<{error: string|null}>; signOut(): Promise<void> }`; `AuthProvider`; `LoadingScreen` (default export, no props); App provider order `ToastProvider → AuthProvider → AuthGate(→ AppContextProvider → Router)`.

- [ ] **Step 1: Write `jsapps/src/context/AuthContext.tsx`:**

```tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearState } from '../services/localStore';

interface AuthContextType {
  session: Session | null;
  /** true until the initial getSession() resolves. */
  loading: boolean;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }, // handle_new_user() seeds profiles.name from this
    });
    return { error: error?.message ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearState(); // remote is the source of truth; drop any stale local envelope
  };

  return (
    <AuthContext.Provider value={{ session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Write `jsapps/src/components/ui/LoadingScreen.tsx`:**

```tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500">
    <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-3" />
    <p className="text-sm font-medium">Loading SplitEase…</p>
  </div>
);

export default LoadingScreen;
```

- [ ] **Step 3: Write `jsapps/src/components/auth/AuthScreen.tsx`:**

```tsx
import React, { useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Mode = 'signin' | 'signup';

const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result =
      mode === 'signup'
        ? await signUp(name.trim(), email.trim(), password)
        : await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) setError(result.error);
    // On success onAuthStateChange flips the session and AuthGate re-renders.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center justify-center mb-6">
          <Wallet className="h-8 w-8 text-teal-500 mr-2" />
          <h1 className="text-2xl font-bold text-gray-800">SplitEase</h1>
        </div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4 text-center">
          {mode === 'signin' ? 'Log in to your account' : 'Create your account'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="mt-4 w-full text-sm text-teal-600 hover:text-teal-700 font-medium"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
```

- [ ] **Step 4: Rewrite `jsapps/src/App.tsx`:**

```tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppContextProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import AuthScreen from './components/auth/AuthScreen';
import LoadingScreen from './components/ui/LoadingScreen';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Groups from './pages/Groups';
import Expenses from './pages/Expenses';
import Friends from './pages/Friends';
import Activity from './pages/Activity';
import RecentlyDeleted from './pages/RecentlyDeleted';
import Settings from './pages/Settings';
import GroupDetail from './pages/GroupDetail';

function AuthGate() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  return (
    <AppContextProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/:id" element={<GroupDetail />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="friends" element={<Friends />} />
            <Route path="activity" element={<Activity />} />
            <Route path="recently-deleted" element={<RecentlyDeleted />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </AppContextProvider>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
```

*(Note: ToastProvider now wraps AppContextProvider — required by T6's rollback toasts.)*

- [ ] **Step 5: Add logout to `jsapps/src/components/layout/Sidebar.tsx`** — add imports `LogOut` (from `lucide-react`) and `useAuth`; insert a logout button in the bottom section ABOVE the balance card `div`:

```tsx
// added imports:
import { Home, Users, Receipt, UserPlus, PieChart, Activity, Trash2, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// inside the component:
const { signOut } = useAuth();

// bottom section becomes:
<div className="p-4 border-t border-gray-200 space-y-3">
  <button
    type="button"
    onClick={() => void signOut()}
    className="flex items-center w-full px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors duration-200"
  >
    <LogOut className="h-5 w-5 mr-3 text-gray-500" />
    <span className="font-medium">Log out</span>
  </button>
  <div className="p-4 bg-teal-50 rounded-lg">
    {/* existing Overall Balance card unchanged */}
  </div>
</div>
```

- [ ] **Step 6: Verify** — `npm run typecheck` clean. `npm run test`: the two AppContext test files may still pass (they render `AppContextProvider` directly, not `App`); if any test imports `App.tsx`, wrap expectations accordingly — but as of master no test imports `App`. Expected: 65+ tests green (T3/T4 may have merged more). `npm run lint` clean. **Do not run `npm run dev` against the real client** — env vars land in T8.
- [ ] **Step 7: Commit** — `git add src/context/AuthContext.tsx src/components/auth src/components/ui/LoadingScreen.tsx src/App.tsx src/components/layout/Sidebar.tsx && git commit -m "feat(4a): AuthProvider, AuthScreen, session gate, sidebar logout"`.

---

### Task T6: AppContext — optimistic-online refactor (seam preserved)

**Files:**
- Modify: `jsapps/src/context/AppContext.tsx` (full rewrite below)
- Modify: `jsapps/src/context/AppContext.test.tsx`, `jsapps/src/context/AppContext.behavior.test.tsx` (re-point mocks)

**Interfaces:**
- Consumes: `useAuth` (T5), all T4 store fns, `useToast`, `LoadingScreen` (T5), engines, `activityLog`.
- Produces: `AppContextType` unchanged (byte-identical interface). Internally exposes nothing new. T7 will add import wiring on top.

- [ ] **Step 1: Write the failing rollback test** — append to `jsapps/src/context/AppContext.behavior.test.tsx` (adapt imports to that file's existing helpers; core new cases):

```tsx
// vi.mock at module scope (hoisted above imports by vitest):
vi.mock('../services/supabaseStore', () => ({
  fetchAll: vi.fn(),
  insertExpense: vi.fn().mockResolvedValue(undefined),
  updateExpense: vi.fn().mockResolvedValue(undefined),
  setExpenseDeleted: vi.fn().mockResolvedValue(undefined),
  purgeExpense: vi.fn().mockResolvedValue(undefined),
  insertGroup: vi.fn().mockResolvedValue(undefined),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  setGroupDeleted: vi.fn().mockResolvedValue(undefined),
  purgeGroup: vi.fn().mockResolvedValue(undefined),
  insertSettlement: vi.fn().mockResolvedValue(undefined),
  insertActivityEvent: vi.fn().mockResolvedValue(undefined),
  importState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } },
    loading: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import * as store from '../services/supabaseStore';

const REMOTE: store.RemoteState = {
  currentUser: { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Me', email: 'me@x.com', avatar: '' },
  friends: [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Ana', email: 'a@x.com', avatar: '' }],
  groups: [], expenses: [], settlements: [], activityEvents: [],
};

beforeEach(() => {
  vi.mocked(store.fetchAll).mockResolvedValue(structuredClone(REMOTE));
});

it('applies addExpense optimistically, keeps it when persist succeeds', async () => {
  // render provider + probe (reuse the file's existing probe component pattern),
  // await disappearance of the loading screen, then:
  //   act(() => ctx.addExpense({ description: 'X', amount: 10, paidBy: REMOTE.currentUser.id,
  //     splitWith: [{ userId: REMOTE.currentUser.id, amount: 10 }], category: 'other',
  //     currency: 'USD', groupId: null }));
  // expect ctx.expenses to contain 'X' immediately, and still after `await waitFor(...)`.
});

it('rolls back the expense and shows a toast when persist rejects', async () => {
  vi.mocked(store.insertExpense).mockRejectedValueOnce(new Error('down'));
  // same as above, then: await waitFor(() => expect(ctx.expenses).toHaveLength(0));
  // and assert the toast text "Couldn't save your change" is in the document
  // (render inside ToastProvider).
});
```

Rewrite the two existing context test files' setup blocks with these mocks (they currently mock `localStore`/use demo data). Every pre-existing behavioral assertion (soft-delete, restore, purge, settle, activity log, balances) must be preserved — only setup changes: wrap in `ToastProvider`, mock `AuthContext` + `supabaseStore`, `await` initial load (`await screen.findBy…` post-loading) before acting.

- [ ] **Step 2: Run to verify failure** — `npm run test -- AppContext` → FAIL (context still synchronous/localStorage-backed).
- [ ] **Step 3: Rewrite `jsapps/src/context/AppContext.tsx` in full:**

```tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, Expense, Friend, Group, Settlement, User } from '../types';
import * as store from '../services/supabaseStore';
import { useAuth } from './AuthContext';
import { useToast } from '../components/ui/Toast';
import LoadingScreen from '../components/ui/LoadingScreen';
import {
  computeNetBalances,
  computeAbsoluteNet,
  simplifyDebts,
  Transfer,
} from '../services/splitEngine';
import {
  ActivityEvent,
  CreateEventInput,
  appendActivityEvent,
  createActivityEvent,
} from '../services/activityLog';

interface AppContextType {
  currentUser: User;
  friends: Friend[];
  /** Active (non-soft-deleted) groups. */
  groups: Group[];
  /** Active (non-soft-deleted) expenses. */
  expenses: Expense[];
  /** Active (non-soft-deleted) settlements. */
  settlements: Settlement[];
  /** Append-only audit/activity log, newest first. */
  activityEvents: ActivityEvent[];
  /** Soft-deleted expenses, most-recently-deleted first (for the Recently Deleted view). */
  deletedExpenses: Expense[];
  /** Soft-deleted groups, most-recently-deleted first. */
  deletedGroups: Group[];
  addExpense: (expense: Omit<Expense, 'id' | 'date'>) => void;
  updateExpense: (id: string, expense: Partial<Expense>) => void;
  /** Soft-delete: sets deletedAt; reversible via restoreExpense. */
  deleteExpense: (id: string) => void;
  restoreExpense: (id: string) => void;
  /** Permanent, irreversible removal (explicit user action from Recently Deleted). */
  purgeExpense: (id: string) => void;
  addGroup: (group: Omit<Group, 'id'>) => void;
  updateGroup: (id: string, group: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  restoreGroup: (id: string) => void;
  purgeGroup: (id: string) => void;
  settleDebt: (fromId: string, toId: string, amount: number, groupId?: string | null) => void;
  getBalances: () => { friend: Friend; balance: number }[];
  /** Minimal set of "who pays whom" transfers that settles the given participants
   *  (defaults to the current user + all friends). Powers debt simplification. */
  getSuggestedSettlements: (participantIds?: string[]) => Transfer[];
  getGroupById: (id: string) => Group | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
};

interface AppContextProviderProps {
  children: ReactNode;
}

const SAVE_FAILED_MESSAGE = "Couldn't save your change — it was undone.";

export const AppContextProvider: React.FC<AppContextProviderProps> = ({ children }) => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id ?? '';

  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Mirror of `state` that updates synchronously inside mutators, so rapid
  // successive mutations snapshot/rollback correctly (no stale closures).
  const stateRef = useRef<AppState | null>(null);

  const applyState = (next: AppState | null) => {
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    let cancelled = false;
    if (!userId) return undefined;
    setLoadError(null);
    store
      .fetchAll(userId)
      .then((remote) => {
        if (!cancelled) applyState(remote);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * Optimistic-online mutation: apply locally now, persist async, roll back the
   * entire prior state + toast on failure. The optional activity event is
   * persisted best-effort AFTER the primary write succeeds (its failure never
   * rolls back the primary mutation).
   */
  const mutate = (
    updater: (prev: AppState) => AppState,
    persist: () => Promise<void>,
    event?: ActivityEvent
  ): void => {
    const prev = stateRef.current;
    if (!prev) return;
    applyState(updater(prev));
    persist()
      .then(() => {
        if (event) {
          store.insertActivityEvent(userId, event).catch((err: unknown) => {
            console.warn('SplitEase: activity event not persisted', err);
          });
        }
      })
      .catch((err: unknown) => {
        console.warn('SplitEase: persist failed, rolling back', err);
        applyState(prev);
        showToast({ message: SAVE_FAILED_MESSAGE });
      });
  };

  const buildEvent = (
    actorId: string,
    input: Omit<CreateEventInput, 'actorId' | 'id'>
  ): ActivityEvent =>
    createActivityEvent({ id: crypto.randomUUID(), actorId, ...input });

  const addExpense = (expense: Omit<Expense, 'id' | 'date'>) => {
    const current = stateRef.current;
    if (!current) return;
    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      deletedAt: null,
    };
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.create',
      entityType: 'expense',
      entityId: newExpense.id,
      groupId: newExpense.groupId,
      after: newExpense,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: [newExpense, ...prev.expenses],
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.insertExpense(userId, newExpense),
      event
    );
  };

  const updateExpense = (id: string, updatedExpense: Partial<Expense>) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.expenses.find((e) => e.id === id);
    if (!before) return;
    const after = { ...before, ...updatedExpense };
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.update',
      entityType: 'expense',
      entityId: id,
      groupId: after.groupId,
      before,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? after : e)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.updateExpense(userId, after),
      event
    );
  };

  const deleteExpense = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.expenses.find((e) => e.id === id && !e.deletedAt);
    if (!before) return;
    const deletedAt = new Date().toISOString();
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.delete',
      entityType: 'expense',
      entityId: id,
      groupId: before.groupId,
      before,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deletedAt } : e)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setExpenseDeleted(id, deletedAt),
      event
    );
  };

  const restoreExpense = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const target = current.expenses.find((e) => e.id === id && !!e.deletedAt);
    if (!target) return;
    const after = { ...target, deletedAt: null };
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.restore',
      entityType: 'expense',
      entityId: id,
      groupId: after.groupId,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? after : e)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setExpenseDeleted(id, null),
      event
    );
  };

  const purgeExpense = (id: string) => {
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== id),
      }),
      () => store.purgeExpense(id)
    );
  };

  const addGroup = (group: Omit<Group, 'id'>) => {
    const current = stateRef.current;
    if (!current) return;
    const newGroup: Group = { ...group, id: crypto.randomUUID(), deletedAt: null };
    const event = buildEvent(current.currentUser.id, {
      action: 'group.create',
      entityType: 'group',
      entityId: newGroup.id,
      groupId: newGroup.id,
      after: newGroup,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: [newGroup, ...prev.groups],
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.insertGroup(userId, newGroup),
      event
    );
  };

  const updateGroup = (id: string, updatedGroup: Partial<Group>) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.groups.find((g) => g.id === id);
    if (!before) return;
    const after = { ...before, ...updatedGroup };
    const event = buildEvent(current.currentUser.id, {
      action: 'group.update',
      entityType: 'group',
      entityId: id,
      groupId: id,
      before,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? after : g)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.updateGroup(userId, after),
      event
    );
  };

  const deleteGroup = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.groups.find((g) => g.id === id && !g.deletedAt);
    if (!before) return;
    const deletedAt = new Date().toISOString();
    const event = buildEvent(current.currentUser.id, {
      action: 'group.delete',
      entityType: 'group',
      entityId: id,
      groupId: id,
      before,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? { ...g, deletedAt } : g)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setGroupDeleted(id, deletedAt),
      event
    );
  };

  const restoreGroup = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const target = current.groups.find((g) => g.id === id && !!g.deletedAt);
    if (!target) return;
    const after = { ...target, deletedAt: null };
    const event = buildEvent(current.currentUser.id, {
      action: 'group.restore',
      entityType: 'group',
      entityId: id,
      groupId: id,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? after : g)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setGroupDeleted(id, null),
      event
    );
  };

  const purgeGroup = (id: string) => {
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.id !== id),
      }),
      () => store.purgeGroup(id)
    );
  };

  const settleDebt = (
    fromId: string,
    toId: string,
    amount: number,
    groupId: string | null = null
  ) => {
    const current = stateRef.current;
    if (!current) return;
    const settlement: Settlement = {
      id: crypto.randomUUID(),
      fromUserId: fromId,
      toUserId: toId,
      amount,
      currency: 'USD',
      date: new Date().toISOString(),
      groupId,
      deletedAt: null,
    };
    const event = buildEvent(current.currentUser.id, {
      action: 'settlement.create',
      entityType: 'settlement',
      entityId: settlement.id,
      groupId,
      after: settlement,
    });
    mutate(
      (prev) => ({
        ...prev,
        settlements: [settlement, ...prev.settlements],
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.insertSettlement(userId, settlement),
      event
    );
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-600 px-4">
        <p className="font-semibold mb-2">Couldn’t load your data</p>
        <p className="text-sm mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!state) {
    return <LoadingScreen />;
  }

  const { currentUser, friends } = state;

  // Derived active/deleted views.
  const expenses = state.expenses.filter((e) => !e.deletedAt);
  const groups = state.groups.filter((g) => !g.deletedAt);
  const settlements = state.settlements.filter((s) => !s.deletedAt);
  const activityEvents = state.activityEvents;
  const deletedExpenses = state.expenses
    .filter((e) => !!e.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  const deletedGroups = state.groups
    .filter((g) => !!g.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

  const getBalances = () => {
    const friendIds = friends.map((f) => f.id);
    const balances = computeNetBalances(
      currentUser.id,
      friendIds,
      expenses,
      settlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
      }))
    );
    return friendIds.map((friendId) => ({
      friend: friends.find((f) => f.id === friendId)!,
      balance: balances[friendId] ?? 0,
    }));
  };

  const getSuggestedSettlements = (participantIds?: string[]): Transfer[] => {
    const ids = participantIds ?? [currentUser.id, ...friends.map((f) => f.id)];
    const net = computeAbsoluteNet(
      ids,
      expenses,
      settlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
      }))
    );
    return simplifyDebts(net);
  };

  const getGroupById = (id: string) => groups.find((group) => group.id === id);

  const value: AppContextType = {
    currentUser,
    friends,
    groups,
    expenses,
    settlements,
    activityEvents,
    deletedExpenses,
    deletedGroups,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    purgeExpense,
    addGroup,
    updateGroup,
    deleteGroup,
    restoreGroup,
    purgeGroup,
    settleDebt,
    getBalances,
    getSuggestedSettlements,
    getGroupById,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
```

*(Deliberate changes from master: no `demoData`/`localStore` imports, no persistence `useEffect`, ids via `crypto.randomUUID()`, all mutators go through `mutate`. `AppContextType` and all derived views byte-identical.)*

- [ ] **Step 4: Update the two context test files** per Step 1's mocking recipe; keep every pre-existing behavioral assertion. Render helper: `render(<ToastProvider><AppContextProvider><Probe/></AppContextProvider></ToastProvider>)`; first `await waitFor` for the probe to appear (initial fetch is async).
- [ ] **Step 5: Run tests** — `npm run test` → all green (old 65 + new remapper/mapper/rollback tests); `npm run typecheck`, `npm run lint` clean.
- [ ] **Step 6: Commit** — `git add src/context && git commit -m "feat(4a): AppContext optimistic-online — fetchAll gate, rollback+toast, uuid ids"`.

---

### Task T7: One-time localStorage import (prompt + wiring)

**Files:**
- Create: `jsapps/src/components/import/ImportPrompt.tsx`
- Modify: `jsapps/src/context/AppContext.tsx` (additive wiring only)
- Test: extend `jsapps/src/context/AppContext.behavior.test.tsx`

**Interfaces:**
- Consumes: `remapLocalState`, `IMPORT_HANDLED_KEY` (T3); `store.importState`, `store.fetchAll` (T4); `loadState`, `clearState` (localStore).
- Produces: import UX; no public API changes.

- [ ] **Step 1: Write failing tests** — extend the behavior test file:

```tsx
// Additional mock at top: vi.mock('../services/localStore', async (importOriginal) => {
//   const mod = await importOriginal<typeof import('../services/localStore')>();
//   return { ...mod, loadState: vi.fn(), clearState: vi.fn() };
// });
import * as localStore from '../services/localStore';

it('offers import when remote is empty and local data exists, imports on accept', async () => {
  vi.mocked(localStore.loadState).mockReturnValue(LOCAL_LEGACY_STATE); // fixture w/ user_1 ids
  localStorage.removeItem('splitease.importHandled');
  // render; await load; expect screen.getByText(/import your existing data/i)
  // click "Import"; await waitFor: store.importState called once,
  // store.fetchAll called twice (initial + refetch),
  // localStorage.getItem('splitease.importHandled') === '1', clearState called.
});

it('never re-offers after dismissal', async () => {
  vi.mocked(localStore.loadState).mockReturnValue(LOCAL_LEGACY_STATE);
  localStorage.removeItem('splitease.importHandled');
  // render; click "Not now"; prompt gone; importHandled === '1'; importState NOT called.
});

it('does not offer when remote already has data', async () => {
  vi.mocked(store.fetchAll).mockResolvedValue({ ...structuredClone(REMOTE), expenses: [SOME_EXPENSE] });
  vi.mocked(localStore.loadState).mockReturnValue(LOCAL_LEGACY_STATE);
  // render; assert prompt absent.
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test -- AppContext.behavior` → new cases FAIL.
- [ ] **Step 3: Create `jsapps/src/components/import/ImportPrompt.tsx`:**

```tsx
import React from 'react';
import { DownloadCloud, Loader2 } from 'lucide-react';

interface ImportPromptProps {
  busy: boolean;
  onImport: () => void;
  onDismiss: () => void;
}

/** One-time offer to migrate pre-4a localStorage data into the user's account. */
const ImportPrompt: React.FC<ImportPromptProps> = ({ busy, onImport, onDismiss }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div role="dialog" aria-modal="true" className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
      <div className="flex items-center mb-3">
        <DownloadCloud className="h-6 w-6 text-teal-500 mr-2" />
        <h2 className="text-lg font-semibold text-gray-800">Import your existing data?</h2>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        We found SplitEase data saved on this device from before you had an account.
        Import it now to keep your expenses, groups, and settlements. This is a
        one-time offer.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onImport}
          className="flex-1 flex items-center justify-center bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Import
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded-lg"
        >
          Not now
        </button>
      </div>
    </div>
  </div>
);

export default ImportPrompt;
```

- [ ] **Step 4: Wire into `AppContext.tsx`** (additive):

```tsx
// new imports:
import { loadState, clearState } from '../services/localStore';
import { remapLocalState, IMPORT_HANDLED_KEY } from '../services/importRemapper';
import ImportPrompt from '../components/import/ImportPrompt';

// new state next to `state`/`loadError`:
const [importCandidate, setImportCandidate] = useState<AppState | null>(null);
const [importBusy, setImportBusy] = useState(false);

// in the initial-fetch .then(remote => …), after applyState(remote):
const remoteEmpty =
  remote.friends.length === 0 &&
  remote.groups.length === 0 &&
  remote.expenses.length === 0 &&
  remote.settlements.length === 0;
const local = loadState();
if (remoteEmpty && local && localStorage.getItem(IMPORT_HANDLED_KEY) !== '1') {
  setImportCandidate(local);
}

// handlers (place after settleDebt):
const handleImport = () => {
  const candidate = importCandidate;
  if (!candidate) return;
  setImportBusy(true);
  const remapped = remapLocalState(candidate, userId);
  store
    .importState(userId, remapped)
    .then(() => store.fetchAll(userId))
    .then((remote) => {
      applyState(remote);
      localStorage.setItem(IMPORT_HANDLED_KEY, '1');
      clearState();
      setImportCandidate(null);
    })
    .catch((err: unknown) => {
      console.warn('SplitEase: import failed', err);
      showToast({ message: "Import failed — your local data is untouched. Try again later." });
    })
    .finally(() => setImportBusy(false));
};
const handleDismissImport = () => {
  localStorage.setItem(IMPORT_HANDLED_KEY, '1');
  setImportCandidate(null);
};

// render, just inside the final Provider return:
return (
  <AppContext.Provider value={value}>
    {importCandidate && (
      <ImportPrompt busy={importBusy} onImport={handleImport} onDismiss={handleDismissImport} />
    )}
    {children}
  </AppContext.Provider>
);
```

- [ ] **Step 5: Run tests** — `npm run test` all green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 6: Commit** — `git add src/components/import src/context && git commit -m "feat(4a): one-time localStorage import — prompt, remap, batch insert"`.

---

### Task T8: Local stack bring-up + live verification (HUMAN-IN-LOOP)

**Files:**
- Create: `supabase/config.toml` (via `supabase init`, then edit)
- Create: `jsapps/.env.local` (NOT committed — `*.local` gitignored)
- Possibly modify: `jsapps/src/lib/database.types.ts` (only if generator output differs)

**Interfaces:**
- Consumes: everything (T1–T7 merged into `feature/phase4a`).
- Produces: running local stack + verified acceptance; reconciled types.

- [ ] **Step 1: Install tooling** (skip what exists): `brew install supabase/tap/supabase`; Docker Desktop — `brew install --cask docker` **may need the user's password / manual first launch**. If Docker can't be installed non-interactively: set board row `BLOCKED` with note `needs user: install+launch Docker Desktop`, and tell the user. Verify: `docker info` and `supabase --version` both succeed.
- [ ] **Step 2: Init stack** — from repo root: `supabase init` (creates `supabase/config.toml`; keep existing `migrations/`). Edit `config.toml`: under `[auth.email]` set `enable_confirmations = false`.
- [ ] **Step 3: Start + migrate** — `supabase start`, then `supabase db reset` (applies `20260719000001_…​.sql`). Expected: reset completes with no SQL errors.
- [ ] **Step 4: Env** — `supabase status` → copy `API URL` + `anon key` into `jsapps/.env.local`: `VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…`. Confirm `git status` does NOT list it.
- [ ] **Step 5: Reconcile types** — `supabase gen types typescript --local > /tmp/gen.types.ts`; diff the `Tables` section against `jsapps/src/lib/database.types.ts`. If they differ materially (column names/nullability/types), replace the file with generator output, re-run `npm run typecheck && npm run test`, fix mapper fallout, commit `fix(4a): reconcile database.types.ts with generator`.
- [ ] **Step 6: Manual acceptance script** (run `npm run dev` under Node 20; use the spec §9 checklist): sign-up A → empty app; seed legacy localStorage (open pre-4a build or hand-craft `splitease.appState` v2 envelope) → refresh → import prompt → Import → data visible → refresh persists; CRUD + soft-delete/restore/purge survive refresh; sign-out → sign-up B → sees nothing of A; `supabase stop` → mutation → rollback toast; restart stack. Record each pass/fail in the board notes.
- [ ] **Step 7: Full gate** — `npm run test && npm run typecheck && npm run build && npm run lint` all clean. Commit anything outstanding; set board row DONE.

---

## Integration & completion

When T1–T8 are all DONE on the board: from `feature/phase4a` run the full gate once more, then hand off per `superpowers:finishing-a-development-branch` (default: merge `feature/phase4a` → `master` fast-forward-if-possible, update ledger rows to DONE). Update `CLAUDE.md`'s stale "Supabase schema exists / not wired" sentence to reflect Phase 4a reality in the same merge commit.
