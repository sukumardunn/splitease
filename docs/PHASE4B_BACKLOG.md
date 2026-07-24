# Phase 4b Backlog

Deferred items carried out of Phase 4a. None block 4a — all were reviewed,
accepted as non-blocking, and logged here.

> **Why this file exists:** the working record lives in
> `.superpowers/sdd/progress.md`, but that path is git-excluded via
> `.git/info/exclude`, so it is machine-local and does not survive a clone. This
> tracked copy is the durable one — **update both**, or treat this as the source
> of truth.

## Correctness / robustness

1. **Silent no-op writes** — persist paths don't check the affected-row `.select`
   count, so a write silently rejected by RLS can look successful to the client.
2. **`getSession` catch** — unhandled rejection path on session bootstrap.
3. **Sign-out race toast** — a mutation still in flight during sign-out can
   surface a spurious rollback toast.
4. **`category` / `action` cast validation** — DB strings are cast to TypeScript
   union types with no runtime validation; unexpected values flow through.
5. **Whole-state rollback granularity** (from T6) — a failed write restores the
   entire state snapshot, discarding any concurrent in-flight optimistic update.
   Spec'd tradeoff, commented in code.

## Security

6. **`activity_events` RLS tighten** — spec-level issue; the policy is looser
   than the other tables'.

## Accessibility / UX

7. **AuthScreen a11y** — inputs lack `label` / `id` / `autoComplete`.
8. **`ImportPrompt` focus trap** — the modal doesn't trap focus.
9. **Sidebar "Overall Balance" is hardcoded** —
   `jsapps/src/components/layout/Sidebar.tsx:59` renders a static `$355.00`
   instead of deriving from state. **Pre-existing cosmetic bug: it predates
   Phase 4a and was not caused by it.** Found during T8 browser smoke.

## Tests / tooling

10. **No `AuthContext` / `AuthScreen` unit tests** — was out of the 4a brief scope;
    prudent follow-up.
11. **Test stderr noise** — expected-error tests log to stderr, cluttering output.
12. **Node 26 vs jsdom** — `npm test` must run under Node 20; jsdom crashes on 26.
    Either pin the toolchain or upgrade jsdom so one Node version serves everything.
