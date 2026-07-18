# Phase 4a — Auth + Core Persistence (Local Supabase): Implementation Spec

**Status:** FINAL — approved for implementation.
**Source design:** `docs/superpowers/specs/2026-07-19-phase4a-auth-persistence-design.md` (user-verified; do not re-litigate its locked decisions).
**Execution plan:** `docs/superpowers/plans/2026-07-19-phase4a-auth-persistence.md`.
**Task board (live status):** `.coordination/PHASE4A_BOARD.md`.

Phase 4a delivers email+password auth and owner-scoped Postgres persistence via a
local Supabase stack, behind the existing `AppContextType` seam. Pages do not change.
4b/4c (real friend accounts, shared visibility, realtime) must remain additive.

---

## 1. Architecture summary

- **Auth:** new `AuthProvider` over `supabase.auth` (email+password, confirmations OFF
  locally). App gated: no session → `AuthScreen`; session → app.
- **Persistence:** `services/supabaseStore.ts` — typed async CRUD, snake_case↔camelCase
  mapping. Postgres = source of truth. **Optimistic online**: every context mutation
  applies local state immediately, persists async, rolls back the whole prior state +
  shows an error `Toast` on failure. One `<LoadingScreen/>` gate at mount until first
  `fetchAll` resolves.
- **Ids:** client generates `crypto.randomUUID()` for all new entities (so optimistic
  insert and DB row share the id — no reconciliation). Person refs (paid_by,
  payer/split person_id, settlement from/to, group members) are **plain `uuid` columns
  with NO foreign key** — the app's flat person-id namespace (currentUser + friends
  share one id space) makes hard FKs a 4c concern (`expense_participants`).
- **Import:** on first login to an empty account with localStorage state present,
  prompt once; a pure id-remapper rewrites every old string id (`user_…`, `exp_…`) to
  fresh uuids (currentUser → profile id), then batch-insert.
- **Untouched:** `splitEngine.ts`, `splitCalculator.ts`, `activityLog.ts` (pure
  engines), all pages, `AppContextType` (identical, void-returning fns).

## 2. Database schema (single migration)

File: `supabase/migrations/20260719000001_phase4a_auth_persistence.sql`.
Authoritative DDL — implementers copy verbatim:

```sql
-- Phase 4a: auth + owner-scoped core persistence.
-- Person-ref columns (paid_by, person_id, from/to_person_id, actor_id) are plain
-- uuids with NO FK: the app has a flat person-id namespace (profile + contacts).
-- Hard person FKs arrive in Phase 4c (expense_participants).

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  avatar text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'avatar', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- friends (contacts, NOT accounts) ----------
create table public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  email text not null default '',
  avatar text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index friends_owner_idx on public.friends (owner_id);

-- ---------- groups ----------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  avatar text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index groups_owner_idx on public.groups (owner_id);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  person_id uuid not null,
  primary key (group_id, person_id)
);

-- ---------- expenses ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  paid_by uuid not null,
  date timestamptz not null default now(),
  category text not null default 'other',
  currency text not null default 'USD',
  group_id uuid references public.groups(id) on delete set null,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index expenses_owner_idx on public.expenses (owner_id);
create index expenses_group_idx on public.expenses (group_id);

create table public.expense_payers (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  person_id uuid not null,
  amount numeric(12,2) not null,
  primary key (expense_id, person_id)
);

create table public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  person_id uuid not null,
  amount numeric(12,2) not null,
  primary key (expense_id, person_id)
);

-- ---------- settlements ----------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  from_person_id uuid not null,
  to_person_id uuid not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  date timestamptz not null default now(),
  group_id uuid references public.groups(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index settlements_owner_idx on public.settlements (owner_id);

-- ---------- activity_events (append-only audit log) ----------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  group_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_owner_idx on public.activity_events (owner_id, created_at desc);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

alter table public.friends enable row level security;
create policy "friends_own" on public.friends
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.groups enable row level security;
create policy "groups_own" on public.groups
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.group_members enable row level security;
create policy "group_members_via_parent" on public.group_members
  for all
  using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

alter table public.expenses enable row level security;
create policy "expenses_own" on public.expenses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.expense_payers enable row level security;
create policy "expense_payers_via_parent" on public.expense_payers
  for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()));

alter table public.expense_splits enable row level security;
create policy "expense_splits_via_parent" on public.expense_splits
  for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and e.owner_id = auth.uid()));

alter table public.settlements enable row level security;
create policy "settlements_own" on public.settlements
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.activity_events enable row level security;
create policy "activity_events_own" on public.activity_events
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
```

Notes:
- `expenses.date` / `settlements.date` store the domain `date: string` (ISO) values.
- `activity_events.entity_id` is uuid — new client events use uuid ids; imported
  events are remapped (§6).
- No `delete` policy on `profiles` (account deletion out of scope).

## 3. `database.types.ts` and `lib/supabase.ts`

`jsapps/src/lib/database.types.ts` is **hand-authored in 4a** to exactly match the DDL
(the standard `supabase gen types typescript --local` shape: `Json` type +
`Database.public.Tables.{profiles,friends,groups,group_members,expenses,expense_payers,expense_splits,settlements,activity_events}`
each with `Row`/`Insert`/`Update`/`Relationships`). The final verification task runs
the real generator against the live stack and reconciles any drift (generator output
wins). This decouples all app-code tasks from the Docker install.

`jsapps/src/lib/supabase.ts` stays as today (createClient<Database>, throws on missing
env) — it compiles once `database.types.ts` exists. Unit tests never import it
un-mocked (`vi.mock('../lib/supabase', …)`).

`jsapps/.env.local` (gitignored via `*.local`):
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<from `supabase status`>
```

## 4. Auth layer

New `jsapps/src/context/AuthContext.tsx`:

```ts
interface AuthContextType {
  session: Session | null;          // @supabase/supabase-js Session
  loading: boolean;                 // true until first getSession() resolves
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}
export const AuthProvider: React.FC<{children: ReactNode}>;
export function useAuth(): AuthContextType;
```

- `signUp` passes `options.data = { name }` so `handle_new_user()` seeds the profile name.
- Subscribes to `supabase.auth.onAuthStateChange`; `getSession()` on mount.
- New `jsapps/src/components/auth/AuthScreen.tsx`: single screen, login/signup toggle,
  email+password (+name on signup), inline error text, Tailwind + lucide-react only.
- `App.tsx` provider order becomes:
  `ToastProvider → AuthProvider → AuthGate` where `AuthGate` renders
  `AuthScreen` (no session), `LoadingScreen` (auth loading), or
  `AppContextProvider → Router → routes` (session).
- Logout: button at the bottom of `Sidebar.tsx` (`LogOut` icon) calling `signOut()`.
  Sign-out also calls `clearState()` (localStorage) — remote is the source of truth.

## 5. Data layer — `services/supabaseStore.ts`

All fns typed, promise-returning, throwing `Error` on failure (callers roll back).
Exported mappers are pure (unit-testable without a client).

```ts
// domain <-> row mappers (pure, exported for tests)
export function expenseToRow(ownerId: string, e: Expense): ExpenseRowBundle; // {expense, payers[], splits[]}
export function expenseFromRow(row, payers, splits): Expense;
export function groupToRow(ownerId: string, g: Group): GroupRowBundle;      // {group, members[]}
export function groupFromRow(row, memberRows): Group;
export function friendToRow(ownerId: string, f: Friend): FriendRow;
export function friendFromRow(row): Friend;
export function settlementToRow(ownerId: string, s: Settlement): SettlementRow;
export function settlementFromRow(row): Settlement;
export function activityEventToRow(ownerId: string, ev: ActivityEvent): ActivityEventRow;
export function activityEventFromRow(row): ActivityEvent;

export interface RemoteState {
  currentUser: User; friends: Friend[]; groups: Group[];
  expenses: Expense[]; settlements: Settlement[]; activityEvents: ActivityEvent[];
}
export async function fetchAll(userId: string): Promise<RemoteState>;

export async function insertExpense(ownerId: string, e: Expense): Promise<void>;
export async function updateExpense(ownerId: string, e: Expense): Promise<void>; // upsert row, replace children
export async function setExpenseDeleted(id: string, deletedAt: string | null): Promise<void>; // soft delete + restore
export async function purgeExpense(id: string): Promise<void>;

export async function insertGroup(ownerId: string, g: Group): Promise<void>;
export async function updateGroup(ownerId: string, g: Group): Promise<void>;    // upsert row, replace members
export async function setGroupDeleted(id: string, deletedAt: string | null): Promise<void>;
export async function purgeGroup(id: string): Promise<void>;

export async function insertSettlement(ownerId: string, s: Settlement): Promise<void>;
export async function insertActivityEvent(ownerId: string, ev: ActivityEvent): Promise<void>;

export interface ImportPayload {
  friends: Friend[]; groups: Group[]; expenses: Expense[];
  settlements: Settlement[]; activityEvents: ActivityEvent[];
}
export async function importState(ownerId: string, payload: ImportPayload): Promise<void>; // batch insert, parents before children
```

Mapping rules:
- snake_case rows ↔ camelCase domain; `deleted_at: null` ↔ `deletedAt: null`.
- `expenses` domain `payers?` — empty payers table rows ⇒ `payers` undefined;
  present rows ⇒ `payers: Payer[]`.
- `notes` null ⇒ `notes` undefined.
- `settlements.group_id` null ⇒ `groupId: null`.
- `amount` numeric comes back as number via supabase-js (`numeric` → number cast in
  mapper via `Number(...)` to be safe).
- `fetchAll` pulls: profile row (→ `currentUser`), friends (all incl. soft-deleted:
  domain keeps them filtered client-side — actually friends have no deleted UI in 4a,
  fetch only `deleted_at is null`), groups + members (ALL rows incl. soft-deleted —
  context derives active/deleted views), expenses + payers + splits (ALL rows),
  settlements (ALL rows), activity_events (newest first, limit 500).

## 6. Import remapper — `services/importRemapper.ts`

```ts
export interface RemappedState {
  friends: Friend[]; groups: Group[]; expenses: Expense[];
  settlements: Settlement[]; activityEvents: ActivityEvent[];
}
export function remapLocalState(
  state: AppState,
  profileId: string,
  genId: () => string = () => crypto.randomUUID()
): RemappedState;
```

Pure function. Behavior:
- Builds `idMap`: `state.currentUser.id → profileId`; every other id met (friend ids,
  group ids, expense ids, settlement ids, activity event ids, and ANY id referenced in
  `paidBy` / `payers[].userId` / `splitWith[].userId` / `Group.members[]` /
  `Settlement.fromUserId/toUserId` / `ActivityEvent.actorId/entityId/groupId`) →
  lazily assigned fresh `genId()`; same old id always maps to the same new id
  (dangling refs get a uuid too — uuid columns reject old string ids).
- Rewrites all entities + all cross-references; preserves every other field verbatim
  (amounts, dates, categories, deletedAt, notes, before/after snapshots are kept as-is
  EXCEPT ids inside before/after are NOT rewritten — they are opaque jsonb snapshots).
- Deterministic given `genId` (inject a counter fn in tests).

Import flow (`jsapps/src/components/import/ImportPrompt.tsx` + AppContext wiring):
- Trigger: after first successful `fetchAll` where the remote account is empty
  (`friends+groups+expenses+settlements` all length 0) AND `loadState()` returns
  non-null AND `localStorage['splitease.importHandled'] !== '1'`.
- Modal: “Import your existing data?” [Import] [Not now].
- Import → `remapLocalState` → `importState` → refetch `fetchAll` → set
  `splitease.importHandled = '1'` and `clearState()`.
- Not now → set `splitease.importHandled = '1'` (never re-prompt).

## 7. AppContext refactor (seam preserved)

`AppContextType` stays **byte-identical** (§1 design doc). Internals:
- `currentUser` from `fetchAll().currentUser` (profiles row). `demoData` no longer
  seeds the live path (used only by any remaining tests that import it directly).
- Mount: session user id → `fetchAll` → until resolved render `<LoadingScreen/>`
  instead of children.
- Mutation pattern (all 11 mutators):
  ```ts
  const prev = stateRef.current;            // snapshot
  setState(optimisticNext);                 // 1. optimistic apply
  persistPromise.catch(() => {              // 2. async persist
    setState(prev);                         // 3. rollback on error
    showToast({ message: 'Couldn’t save your change — it was undone.' });
  });
  ```
  `stateRef` mirrors state via `useEffect` (avoids stale-closure snapshots).
- New ids: `crypto.randomUUID()` (replaces `newId('exp')` etc.).
- Activity events: created via existing `createActivityEvent({ id: crypto.randomUUID(), … })`,
  optimistically appended AND persisted via `insertActivityEvent` **best-effort**
  (failure logs a `console.warn`, does NOT roll back the primary mutation).
- `purgeExpense`/`purgeGroup` call `purge*` store fns; soft delete/restore call
  `setExpenseDeleted(id, iso | null)`.
- `localStore.ts` retired from the live path (kept only for `loadState` in the import
  trigger + `clearState` on logout/import-success). The `useEffect` persisting to
  localStorage is deleted.

## 8. File-by-file change list

| File | Change |
|---|---|
| `supabase/migrations/20260719000001_phase4a_auth_persistence.sql` | NEW — §2 DDL |
| `supabase/config.toml` | NEW (via `supabase init`) + `[auth.email] enable_confirmations = false` |
| `jsapps/src/lib/database.types.ts` | NEW — hand-authored, §3 |
| `jsapps/src/lib/supabase.ts` | unchanged code, now compiles |
| `jsapps/.env.local` | NEW — local stack URL + anon key (gitignored) |
| `jsapps/src/context/AuthContext.tsx` | NEW — §4 |
| `jsapps/src/components/auth/AuthScreen.tsx` | NEW — §4 |
| `jsapps/src/components/ui/LoadingScreen.tsx` | NEW — centered spinner, Tailwind |
| `jsapps/src/services/supabaseStore.ts` | NEW — §5 |
| `jsapps/src/services/supabaseStore.test.ts` | NEW — mapper unit tests |
| `jsapps/src/services/importRemapper.ts` | NEW — §6 |
| `jsapps/src/services/importRemapper.test.ts` | NEW — remapper unit tests |
| `jsapps/src/components/import/ImportPrompt.tsx` | NEW — §6 modal |
| `jsapps/src/context/AppContext.tsx` | MODIFIED — §7 |
| `jsapps/src/context/AppContext.test.tsx`, `AppContext.behavior.test.tsx` | MODIFIED — mock supabaseStore + auth; add rollback tests |
| `jsapps/src/App.tsx` | MODIFIED — provider order + AuthGate |
| `jsapps/src/components/layout/Sidebar.tsx` | MODIFIED — logout button |
| `jsapps/src/services/localStore.ts` | KEPT (import trigger + clearState only); persistence effect removed from context |

## 9. Testing & acceptance

**Automated (no Docker needed; run under Node 20 — `nvm use 20`):**
- All 65 existing tests stay green (pure engines untouched; context tests updated to
  mock `services/supabaseStore` + auth).
- New: `importRemapper.test.ts` (consistent mapping, currentUser→profileId, every ref
  rewritten, uuid format, dangling refs mapped, determinism with injected genId).
- New: `supabaseStore.test.ts` (row↔domain mapper round-trips incl. payers/undefined
  payers, notes null↔undefined, deletedAt).
- New context tests: optimistic apply visible synchronously; rollback restores prior
  state + fires toast on rejected persist.
- `npm run typecheck`, `npm run build`, `npm run lint` clean.

**Manual acceptance (needs Docker + supabase CLI):**
1. `supabase start` → `supabase db reset` applies migration cleanly.
2. Sign up account A (name/email/pw) → profile row auto-created; app loads empty.
3. localStorage from pre-4a present → import prompt appears; Import → data visible;
   refresh persists; `splitease.appState` cleared.
4. Add expense/group/settlement, soft-delete + restore + purge → survive refresh.
5. Sign out → sign up account B → sees NONE of A's data (RLS isolation).
6. Stop the stack (`supabase stop`) → a mutation → rollback toast fires, UI state
   reverts.
7. `supabase gen types typescript --local` output reconciled with committed
   `database.types.ts`.

## 10. Non-goals (deferred)

Real friend accounts / invites / claim-on-signup (4b); shared visibility,
`expense_participants`, participant RLS, realtime (4c); OAuth/magic-link; account
deletion; multi-currency conversion.

## 11. Coordination

Multi-agent, multi-session execution is governed by
`.coordination/PROTOCOL.md` + the Phase-4a task board `.coordination/PHASE4A_BOARD.md`
(authoritative for 4a task claims). Integration branch: `feature/phase4a` (base:
`master`). Per-task branches `agent/4a-t<N>-<agentid>` merge back into
`feature/phase4a` only with tests+typecheck green. Board/ledger commits go on
`master`. See plan §Coordination for the full rules.
