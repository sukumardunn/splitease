# Coordination Ledger

**Live claim board.** Read [`PROTOCOL.md`](PROTOCOL.md) first. Add a row BEFORE
you edit any file, commit the claim before code, heartbeat every ~15 min, set
`DONE` when finished. Stale claims (heartbeat > 30 min) may be reclaimed.

Timestamps are ISO-8601 UTC. Keep this table sorted by `claimed_at`.

| agent  | status | branch | scope | task | claimed_at | last_heartbeat | notes |
|--------|--------|--------|-------|------|------------|----------------|-------|
| agent1 | ACTIVE | agent/phase1-persistence-agent1 | `jsapps/src/services/**`, `jsapps/src/context/AppContext.tsx`, `jsapps/src/data/**`, `jsapps/src/types.ts`, `jsapps/src/components/expenses/**`, `jsapps/**/*.test.ts*`, `jsapps/vitest.config.ts`, `jsapps/package.json` | Phase 1: on-device persistence + repo layer + payer fix + tests | 2026-07-18T14:04:43Z | 2026-07-18T14:04:43Z | Building first-level working app. Other agents: avoid these files until DONE. |

<!--
Copy this row template, fill it in, delete the example above once real claims exist:

| agentN | ACTIVE | agent/<task>-agentN | `src/pages/Foo.tsx`, `src/components/foo/**` | build Foo screen | 2026-07-18T14:00:00Z | 2026-07-18T14:00:00Z |  |
-->
