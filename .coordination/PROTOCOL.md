# Multi-Agent Coordination Protocol

**Why this exists:** Multiple AI coding agents may operate in this repo at the
same time, launched from independent sessions that cannot see each other's
context. Without coordination they will redo the same work, overwrite each
other's edits, or create conflicting migrations. The filesystem + git are the
only shared channel, so coordination is **file-based and git-committed**.

This protocol is intentionally lightweight (no daemon, no external service). It
relies on three things: a shared ledger, per-agent git branches, and heartbeats.

---

## 0. Base branch (read this first)

**`claude-driven-changes` is the working line.** Cut every agent branch from it,
merge every finished branch back into it, and put ledger/board commits on it too.

**`master` is frozen** at upstream `a8266c6` and must not receive commits of any
kind. Phases 0–4a predate this rule and were developed on `master`; that history
now lives on `claude-driven-changes`, and local `master` has been reset back to
upstream. Anywhere below — or in the Phase 4a plan, spec, and board — that says
`master`, read `claude-driven-changes`.

This holds until the user says otherwise.

---

## 1. Identity

At the start of a session pick a stable **agent id**: `agentN` where N is the
first integer not currently used by an ACTIVE row in the ledger (e.g. `agent3`).
Use it for the whole session, in the ledger and in your branch name.

## 2. The Ledger (`.coordination/LEDGER.md`)

The ledger is the single source of truth for "who is doing what right now." It is
a markdown table. Each row is one **claim** over a bounded scope of work.

Claim row columns:

| Column           | Meaning                                                              |
|------------------|---------------------------------------------------------------------|
| `agent`          | Your agent id (e.g. `agent2`).                                       |
| `status`         | `ACTIVE`, `BLOCKED`, or `DONE`.                                      |
| `branch`         | Your git branch, `agent/<task>-<agentid>`.                          |
| `scope`          | Glob(s) / paths / subsystem you will modify. Be specific.           |
| `task`           | One-line description of the work.                                    |
| `claimed_at`     | ISO-8601 UTC when you claimed (e.g. `2026-07-18T14:03:00Z`).        |
| `last_heartbeat` | ISO-8601 UTC, refreshed ≈ every 15 min while working.               |
| `notes`          | Free text: dependencies, hand-offs, messages to other agents.       |

## 3. Workflow (the loop every agent follows)

1. **Pull latest** if the repo has a remote: `git pull --rebase`. Always
   re-read `LEDGER.md` fresh — do not trust a cached copy.
2. **Scan for conflicts.** A conflict = another row with `status: ACTIVE` and
   `last_heartbeat` within the last **30 minutes** whose `scope` overlaps yours.
   File-path overlap, same migration area, or same shared file (e.g.
   `src/context/AppContext.tsx`, `src/types.ts`) all count.
   - Conflict → do NOT proceed. Either (a) pick different, non-overlapping work,
     or (b) leave a note in the other agent's `notes` and wait, or (c) if their
     heartbeat is stale (> 30 min), you may reclaim (see §5).
3. **Claim.** Add your row to the ledger. Commit it **before** any code change:
   `git add .coordination/LEDGER.md && git commit -m "coord: agentN claim <task>"`.
   Committing the claim first is what makes the claim visible to others.
4. **Branch.** `git checkout -b agent/<task>-<agentid>` from
   `claude-driven-changes` (§0). Do your work here. Never push feature commits to
   `claude-driven-changes`, `master`, or a branch another agent owns.
5. **Heartbeat.** Every ~15 min of active work, update `last_heartbeat` and
   re-commit the ledger (on your branch is fine; if a remote exists, also push
   the ledger to `claude-driven-changes` so others see it — see §6).
6. **Release.** When finished, set `status: DONE`, commit, and open a PR / hand
   off per the repo's integration flow. Remove your row on the next cleanup pass
   or leave it as `DONE` for history.

## 4. Rules of the road

- **One writer per file at a time.** If your scope needs a shared/high-traffic
  file (`AppContext.tsx`, `types.ts`, `database.types.ts`, anything in
  `supabase/migrations/`), claim it explicitly and keep the claim short-lived.
- **Migrations are append-only and serialized.** Only one agent may add a DB
  migration at a time. Claim scope `supabase/migrations/**` exclusively, add your
  timestamped file, release quickly. Never edit an existing migration another
  agent authored.
- **Prefer additive changes.** New files over edits to shared files. New
  components over modifying a component another agent is touching.
- **Don't refactor across another agent's active scope.** Even a "quick" rename
  can break their in-flight work.
- **Communicate via `notes`.** There is no other channel. If you need something
  from another agent, write it in their row's notes and your own.

## 5. Stale claims & recovery

- A claim whose `last_heartbeat` is > 30 min old is **stale**. Any agent may take
  it over: set that row `status: DONE` with a note `reclaimed by agentN (stale)`,
  inspect the branch for partial work, and start a fresh claim.
- If you crash/stop, your row simply goes stale and is recovered by the above.

## 6. If there is a git remote

- The ledger only coordinates agents that can see each other's commits. Push
  ledger commits to `claude-driven-changes` frequently so other agents'
  `git pull` sees your claim.
- Treat a merge conflict in `LEDGER.md` as two simultaneous claims: keep BOTH
  rows, then re-check for scope overlap and resolve per §3.2.

## 7. If there is NO remote (all agents on one machine)

- All agents share the same working tree/filesystem. Re-read `LEDGER.md` from
  disk before every claim and heartbeat (it may have changed under you).
- Keep claims and heartbeats as ordinary commits on `claude-driven-changes` for
  the ledger file only; feature code still goes on per-agent branches.

---

**Golden rule:** *Read the ledger, claim before you touch, heartbeat while you
work, release when you're done, and never write into another live agent's scope.*
