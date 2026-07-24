# Phase 4b Backlog

Deferred items carried out of Phase 4a. All but one are now **done**; see the
status against each entry below.

> **Why this file exists:** the working record lives in
> `.superpowers/sdd/progress.md`, but that path is git-excluded via
> `.git/info/exclude`, so it is machine-local and does not survive a clone. This
> tracked copy is the durable one — **update both**, or treat this as the source
> of truth.

## Correctness / robustness

1. ~~**Silent no-op writes**~~ — **DONE** (`bfc8ade`). An UPDATE/DELETE whose
   WHERE matches nothing is a success in Postgres, and RLS hides non-owned rows
   rather than erroring, so a write rejected by policy looked identical to one
   that worked. The six writes that can silently match nothing now append
   `.select('id')` and throw unless a row comes back. Plain INSERTs were left
   alone: an RLS `with check` violation raises 42501, already caught.
2. ~~**`getSession` catch**~~ — **DONE** (`7c4e0e7`). A rejection left
   `loading` true forever, so the app sat on the loading screen with no way
   forward and the rejection went unhandled. Now falls back to signed-out.
3. ~~**Sign-out race toast**~~ — **DONE** (`7c4e0e7`). A mutation in flight
   during sign-out toasted "couldn't save your change" over the login screen,
   because `ToastProvider` sits above the auth gate and outlives
   `AppContextProvider`. Now rolls back silently when there is no session.
4. ~~**`category` / `action` cast validation**~~ — **DONE** (`bfc8ade`). See
   `src/services/dbValidation.ts`. Each union has a `Record<Union, true>` lookup
   so TypeScript rejects both a missing and an extra key and the tables cannot
   drift. `category` degrades to `'other'` (cosmetic — an expense is never
   dropped over it); `action` / `entity_type` degrade to a new explicit
   `'unknown'` member that `describeActivity` renders, so the audit row stays
   visible instead of being hidden.
5. **Whole-state rollback granularity** (from T6) — **STILL OPEN, deliberately.**
   A failed write restores the entire state snapshot, discarding any concurrent
   in-flight optimistic update. This is a spec'd Phase-4a tradeoff, commented in
   `AppContext.tsx`, and fixing it means choosing a real concurrency model
   (per-entity snapshots, or a mutation queue) rather than a patch — so it wants
   a design decision, not a drive-by. The only 4b item not addressed.

## Security

6. ~~**`activity_events` RLS tighten**~~ — **CODE DONE** (`47b778a`),
   **⚠️ NOT YET APPLIED to the hosted database.** The 4a policy was `for all`,
   copied from the mutable-data tables, so the owner could UPDATE/DELETE rows in
   the log auditing their own actions. Migration
   `supabase/migrations/20260724000001_phase4b_activity_events_append_only.sql`
   replaces it with select+insert policies. **Run it in the Supabase dashboard
   SQL editor** — there is no `supabase` CLI or `psql` on this machine, and the
   service-role key can't execute DDL over the REST API.

## Accessibility / UX

7. ~~**AuthScreen a11y**~~ — **DONE** (`02d47a0`). Was placeholder-only. Added
   labels tied by `for`/`id`, per-mode `autoComplete`
   (`current-password` vs `new-password`), a programmatic description for the
   length rule, and `aria-busy` on submit.
8. ~~**`ImportPrompt` focus trap**~~ — **DONE** (`02d47a0`). `aria-modal` only
   tells assistive tech the background is inert; it does not stop Tab from
   leaving. Added an explicit trap with wrap-around both ways, initial focus,
   and Escape-to-dismiss (ignored mid-import).
9. ~~**Sidebar "Overall Balance" is hardcoded**~~ — **DONE** (`827075e`). Now
   derived, and it distinguishes owed / owing / both / settled up. The owed-vs-owe
   reduction the Dashboard did inline was extracted to
   `summarizeBalances` and shared, so the two views can't drift.

## Tests / tooling

10. ~~**No `AuthContext` / `AuthScreen` unit tests**~~ — **DONE** (`02d47a0`).
    30 new cases across `AuthContext`, `AuthScreen`, and `ImportPrompt`,
    including regression guards for items 2 and 3 that were each verified to
    fail when the fix is reverted.
11. ~~**Test stderr noise**~~ — **DONE** (`5c21a17`). The one deliberately
    triggered `console.warn` is now captured per-test and asserted, rather than
    silencing `console` globally — a blanket mock would also hide warnings we
    did *not* expect. Suite output is clean.
12. ~~**Node 26 vs jsdom**~~ — **DONE** (`5c21a17`), **and the original
    diagnosis was wrong.** jsdom does not crash and no dependency bump was
    needed. Node ≥ 22 ships an experimental Web Storage global, and vitest's
    jsdom environment skips copying jsdom's `localStorage` onto `globalThis`
    when the key already exists there (it is not in vitest's allow-list).
    Node's own global is inert without `--localstorage-file`, so `localStorage`
    was `undefined` and 8 tests failed. `src/test/setup.ts` re-attaches jsdom's
    real Storage. **`npm test` now passes on Node 20 and Node 26 alike.**
