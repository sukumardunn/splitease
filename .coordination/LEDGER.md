# Coordination Ledger

**Live claim board.** Read [`PROTOCOL.md`](PROTOCOL.md) first. Add a row BEFORE
you edit any file, commit the claim before code, heartbeat every ~15 min, set
`DONE` when finished. Stale claims (heartbeat > 30 min) may be reclaimed.

Timestamps are ISO-8601 UTC. Keep this table sorted by `claimed_at`.

| agent  | status | branch | scope | task | claimed_at | last_heartbeat | notes |
|--------|--------|--------|-------|------|------------|----------------|-------|
| agent1 | DONE | agent/phase1-persistence-agent1 | `jsapps/src/services/**`, `jsapps/src/context/AppContext.tsx`, `jsapps/src/types.ts`, `jsapps/src/components/expenses/AddExpenseModal.tsx`, `jsapps/src/App.tsx`, `jsapps/src/pages/Dashboard.tsx`, `jsapps/src/pages/Activity.tsx`, `jsapps/src/utils/helpers.tsx`, `jsapps/**/*.test.ts*`, `jsapps/vitest.config.ts`, `jsapps/package.json` | Phase 1: on-device persistence + calculator + payer fix + tests | 2026-07-18T14:04:43Z | 2026-07-18T14:12:00Z | DONE. Phase 1 shipped: localStorage persistence, tested split/balance calc, paid-by selector, typecheck-gated build, 16 tests. Scope free for other agents. |
| agent2 | ACTIVE | agent/phase2-3-agent2 | `jsapps/src/services/**`, `jsapps/src/context/AppContext.tsx`, `jsapps/src/types.ts`, `jsapps/src/components/expenses/AddExpenseModal.tsx`, `jsapps/src/pages/Activity.tsx`, `jsapps/src/pages/RecentlyDeleted.tsx`, `jsapps/src/components/ui/**`, `jsapps/src/App.tsx`, `jsapps/src/components/layout/**`, `jsapps/**/*.test.ts*` | Phase 2 (soft-delete + undo + real activity/audit log) & Phase 3 (Splitwise-parity split engine, multi-payer, first-class settle-up, debt simplification) | 2026-07-18T14:36:38Z | 2026-07-18T14:36:38Z | Builds on Phase 1 branch (master lacks Phase 1). Owning types.ts + AppContext.tsx exclusively; parallel subagents work only on disjoint new/leaf files. Phases 4-7 (Supabase/auth/import/hosting) left unclaimed for other agents. |

<!--
Copy this row template, fill it in, delete the example above once real claims exist:

| agentN | ACTIVE | agent/<task>-agentN | `src/pages/Foo.tsx`, `src/components/foo/**` | build Foo screen | 2026-07-18T14:00:00Z | 2026-07-18T14:00:00Z |  |
-->
