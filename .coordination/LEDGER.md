# Coordination Ledger

**Live claim board.** Read [`PROTOCOL.md`](PROTOCOL.md) first. Add a row BEFORE
you edit any file, commit the claim before code, heartbeat every ~15 min, set
`DONE` when finished. Stale claims (heartbeat > 30 min) may be reclaimed.

Timestamps are ISO-8601 UTC. Keep this table sorted by `claimed_at`.

| agent  | status | branch | scope | task | claimed_at | last_heartbeat | notes |
|--------|--------|--------|-------|------|------------|----------------|-------|
| agent1 | DONE | agent/phase1-persistence-agent1 | `jsapps/src/services/**`, `jsapps/src/context/AppContext.tsx`, `jsapps/src/types.ts`, `jsapps/src/components/expenses/AddExpenseModal.tsx`, `jsapps/src/App.tsx`, `jsapps/src/pages/Dashboard.tsx`, `jsapps/src/pages/Activity.tsx`, `jsapps/src/utils/helpers.tsx`, `jsapps/**/*.test.ts*`, `jsapps/vitest.config.ts`, `jsapps/package.json` | Phase 1: on-device persistence + calculator + payer fix + tests | 2026-07-18T14:04:43Z | 2026-07-18T14:12:00Z | DONE. Phase 1 shipped: localStorage persistence, tested split/balance calc, paid-by selector, typecheck-gated build, 16 tests. Scope free for other agents. |
| agent2 | DONE | agent/phase2-3-agent2 | `jsapps/src/services/**`, `jsapps/src/context/AppContext.tsx`, `jsapps/src/types.ts`, `jsapps/src/components/expenses/**`, `jsapps/src/pages/Activity.tsx`, `jsapps/src/pages/Expenses.tsx`, `jsapps/src/pages/Friends.tsx`, `jsapps/src/pages/RecentlyDeleted.tsx`, `jsapps/src/components/ui/**`, `jsapps/src/App.tsx`, `jsapps/src/components/layout/**`, `jsapps/**/*.test.ts*` | Phase 2 (soft-delete + undo + real activity/audit log) & Phase 3 (Splitwise-parity split engine, multi-payer, first-class settle-up, debt simplification) | 2026-07-18T14:36:38Z | 2026-07-18T15:10:47Z | DONE. Phases 2 & 3 shipped on branch agent/phase2-3-agent2 (commits 0cc44d5→7cd4294, built on Phase 1). 65 tests, typecheck+build clean. Scope free. NOTE for integrator: master still lacks Phase 1 — merge order is phase1 → phase2-3. Phases 4-7 (Supabase backend/auth/CSV import/attachments/hosting) UNCLAIMED — they need a Supabase project + credentials + deploy decisions (user input required), so left for a future session. ENV quirk: run vitest/vite under Node 20 (`nvm use 20`); local default Node 16 crashes them. |

| agent3 | ACTIVE | agent/phase4a-orchestrator-agent3 | `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `.coordination/PHASE4A_BOARD.md`, `supabase/**`, `jsapps/src/lib/**`, `jsapps/src/services/supabaseStore*`, `jsapps/src/services/importRemapper*`, `jsapps/src/context/**`, `jsapps/src/components/auth/**`, `jsapps/src/components/layout/Sidebar.tsx`, `jsapps/src/App.tsx`, `jsapps/.env.local` | Phase 4a: auth + core persistence (local Supabase). Orchestrating Sonnet subagents per docs/superpowers/plans/2026-07-19-phase4a-auth-persistence.md; integration branch `feature/phase4a`; per-task sub-claims tracked in `.coordination/PHASE4A_BOARD.md` | 2026-07-18T20:52:04Z | 2026-07-18T21:28:50Z | Other sessions welcome to take UNCLAIMED tasks from PHASE4A_BOARD.md — claim there (board is authoritative for 4a tasks), branch off `feature/phase4a`, merge back per plan §Coordination. |

<!--
Copy this row template, fill it in, delete the example above once real claims exist:

| agentN | ACTIVE | agent/<task>-agentN | `src/pages/Foo.tsx`, `src/components/foo/**` | build Foo screen | 2026-07-18T14:00:00Z | 2026-07-18T14:00:00Z |  |
-->
