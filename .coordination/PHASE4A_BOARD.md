# Phase 4a Task Board — AUTHORITATIVE claim surface for this phase

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
| T4 supabaseStore | CLAIMED | agent3 | agent/4a-t4-agent3 | T2 | `jsapps/src/services/supabaseStore*` | 2026-07-18T20:52:04Z | |
| T5 auth provider/screen/gate | CLAIMED | agent3 | agent/4a-t5-agent3 | T2 | `jsapps/src/context/AuthContext.tsx`, `jsapps/src/components/auth/**`, `jsapps/src/components/ui/LoadingScreen.tsx`, `jsapps/src/App.tsx`, `jsapps/src/components/layout/Sidebar.tsx` | 2026-07-18T20:52:04Z | |
| T6 AppContext optimistic refactor | UNCLAIMED | | | T4, T5 | `jsapps/src/context/AppContext.tsx`, `jsapps/src/context/*.test.tsx` | 2026-07-18T20:52:04Z | EXCLUSIVE AppContext.tsx |
| T7 import prompt & wiring | UNCLAIMED | | | T3, T6 | `jsapps/src/components/import/**`, `jsapps/src/context/AppContext.tsx`, `jsapps/src/context/AppContext.behavior.test.tsx` | 2026-07-18T20:52:04Z | EXCLUSIVE AppContext.tsx |
| T8 stack bring-up + live verify | UNCLAIMED | | | T1–T7 | `supabase/config.toml`, `jsapps/.env.local`, `jsapps/src/lib/database.types.ts` (reconcile only) | 2026-07-18T20:52:04Z | HUMAN-IN-LOOP: Docker Desktop install may need user |
