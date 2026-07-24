# Phase 4a Task Board — AUTHORITATIVE claim surface for this phase

> **⚠️ BRANCHING UPDATE (2026-07-25):** Phase 4a is closed, and the branching
> rules below are historical. `claude-driven-changes` is now the working line;
> **`master` is frozen** at upstream `a8266c6` and takes no commits. The 4a merge
> commit `8a0451c` referenced below now lives on `claude-driven-changes`. For new
> work read `master` here as `claude-driven-changes` — see `CLAUDE.md` and
> `.coordination/PROTOCOL.md` §0.

**STATUS: PHASE 4a COMPLETE & MERGED TO MASTER** (merge `8a0451c`). T1–T8 all DONE. T8 done via Docker-free hosted-cloud path: migration live on hosted Supabase, gate green (typecheck/build/lint Node26, tests 85/85 Node20), backend acceptance 13/13 vs live Postgres, types 0-drift, browser smoke passed (auth/signup/import/rollback). master post-merge gate green.

Plan: `docs/superpowers/plans/2026-07-19-phase4a-auth-persistence.md` (read its
COORDINATION section before claiming). Spec: `docs/superpowers/specs/2026-07-19-phase4a-auth-persistence-spec.md`.

- Integration branch: **`feature/phase4a`** (base `master`). Task branches `agent/4a-t<N>-<agentid>` off it, merged back `--no-ff` only with tests+typecheck+lint green (Node 20!).
- Claim = edit your row (status/agent/branch/updated_at) + commit **on master**: `coord: <agentid> claim 4a-T<N>`. Also keep an ACTIVE row w/ heartbeat in `LEDGER.md`.
- Only claim a task whose `depends_on` are all DONE. `CLAIMED` + ledger heartbeat >30 min stale → reclaimable.
- Statuses: `UNCLAIMED` → `CLAIMED` → `DONE` (or `BLOCKED` + note).

| task | status | agent | branch | depends_on | files (scope) | updated_at | notes |
|------|--------|-------|--------|------------|----------------|------------|-------|
| T1 migration SQL | DONE | agent3 | agent/4a-t1-agent3 | — | `supabase/migrations/**` | 2026-07-18T21:58:10Z | merged to feature/phase4a; review clean |
| T2 database.types + client | DONE | agent3 | agent/4a-t2-agent3 | — | `jsapps/src/lib/**` | 2026-07-18T22:09:52Z | merged to feature/phase4a; review clean |
| T3 import remapper | DONE | agent3 | agent/4a-t3-agent3 | — | `jsapps/src/services/importRemapper*` | 2026-07-18T22:07:18Z | merged to feature/phase4a; review clean |
| T4 supabaseStore | DONE | agent4 | agent/4a-t4-agent3 | T2 | `jsapps/src/services/supabaseStore*` | 2026-07-19T00:30:00Z | merged to feature/phase4a (4da048e); gate green (typecheck+78 tests+lint) |
| T5 auth provider/screen/gate | DONE | agent4 | agent/4a-t5-agent3 | T2 | `jsapps/src/context/AuthContext.tsx`, `jsapps/src/components/auth/**`, `jsapps/src/components/ui/LoadingScreen.tsx`, `jsapps/src/App.tsx`, `jsapps/src/components/layout/Sidebar.tsx` | 2026-07-19T00:30:00Z | merged to feature/phase4a (10f1945); gate green |
| T6 AppContext optimistic refactor | DONE | agent3 | agent/4a-t6-agent3 | T4, T5 | `jsapps/src/context/AppContext.tsx`, `jsapps/src/context/*.test.tsx` | 2026-07-19T04:57:14Z | merged to feature/phase4a; review clean (80/80 tests) |
| T7 import prompt & wiring | DONE | agent3 | agent/4a-t7-agent3 | T3, T6 | `jsapps/src/components/import/**`, `jsapps/src/context/AppContext.tsx`, `jsapps/src/context/AppContext.behavior.test.tsx` | 2026-07-19T05:17:48Z | merged to feature/phase4a; review clean (83/83 tests) |
| T8 stack bring-up + live verify | DONE | agent5 | feature/phase4a→master | T1–T7 | `supabase/config.toml`, `jsapps/.env.local`, `jsapps/src/lib/database.types.ts` (reconcile only) | 2026-07-24T18:33:34Z | DONE via Docker-free hosted-cloud path (project `mgqlzlmcmdhgwuijxgfg`). Migration applied+verified (9 tables live); gate green (typecheck/build/lint Node26; tests 85/85 Node20 — jsdom needs Node20); backend acceptance 13/13 vs live Postgres (handle_new_user trigger, owner CRUD, soft-delete/purge, RLS isolation A/B); types reconciled (66 cols, 0 drift); browser smoke passed (auth gate, signup, one-time localStorage import persisting across refresh, optimistic rollback+toast on persist failure). Merged to master `8a0451c`; master post-merge gate green. Note: `jsapps/.env.local` holds VITE_ url/anon key + non-VITE SUPABASE_SECRET_KEY (gitignored). Pre-existing (non-4a) cosmetic bug found: Sidebar.tsx `Overall Balance` is a hardcoded $355.00 — log for 4b. |
