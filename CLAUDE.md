# SplitEase — Repo Instructions

## ⚠️ BRANCHING: `claude-driven-changes` IS THE WORKING LINE

**All work happens on `claude-driven-changes`.** Branch from it, merge back into
it, treat it as the integration branch.

**`master` is frozen** at the upstream commit `a8266c6` (= `origin/master`).
**Never commit to `master`** — not feature code, not docs, not coordination
ledger/board updates. Phases 0–4a were developed on `master` before this rule
existed; that history now lives on `claude-driven-changes`, and local `master`
has been reset back to upstream. Wherever an older doc says to branch from or
commit to `master`, read it as `claude-driven-changes`.

This holds until the user says otherwise.

---

## ⚠️ MULTI-AGENT COORDINATION (READ FIRST, EVERY SESSION)

**Multiple AI agents may be working in this repo simultaneously, spawned from
separate, unconnected sessions.** They do not share memory or context. The ONLY
shared state is the filesystem + git. To avoid redoing work or corrupting each
other's changes, EVERY agent MUST follow the protocol in
[`.coordination/PROTOCOL.md`](.coordination/PROTOCOL.md) before touching any file.

**TL;DR — do this before you write any code:**

1. **Read the board:** open [`.coordination/LEDGER.md`](.coordination/LEDGER.md).
2. **Check for conflicts:** if another agent holds an ACTIVE claim (heartbeat <
   30 min old) overlapping the files/scope you intend to touch — STOP. Pick
   non-overlapping work or coordinate via the ledger notes column.
3. **Claim before editing:** add a row to the ledger (agent id, ISO timestamp,
   branch, scope/globs, task) and `git add .coordination/LEDGER.md && git commit`.
   Commit the claim FIRST, before code changes, so other agents can see it.
4. **Work on your own git branch** named `agent/<short-task>-<agentid>`, cut from
   `claude-driven-changes`. Never commit feature work directly to
   `claude-driven-changes`, `master`, or another agent's branch.
5. **Heartbeat:** update your row's `last_heartbeat` timestamp roughly every 15
   min of active work (re-commit the ledger).
6. **Release:** when done, set your row status to `DONE` (or delete it) and
   commit. Stale claims (heartbeat > 30 min) may be reclaimed by others.

If in doubt, prefer a smaller, clearly-bounded claim over a broad one. Overlap is
the enemy. See the protocol file for the full rules, conflict resolution, and the
claim-row format.

---

## Project overview

SplitEase is a Splitwise-style expense-splitting web app.

- **App root:** `jsapps/` (Vite + React 18 + TypeScript + Tailwind, `lucide-react` icons).
- **State:** Supabase-backed as of Phase 4a. `src/context/AppContext.tsx` is
  optimistic-online — writes go through `src/services/supabaseStore.ts` to
  Postgres and roll back with a toast on failure. Auth gate in
  `src/components/auth/`; schema in `supabase/migrations/`.
- **Dev:** `cd jsapps && npm install && npm run dev`. Lint: `npm run lint`.
  Requires `jsapps/.env.local` (gitignored — recreate it per environment; see
  [`README.md`](README.md)). Run `npm test` under **Node 20** (jsdom breaks on 26).
- Do not add UI/icon packages beyond `lucide-react` + Tailwind unless requested
  (see `jsapps/.bolt/prompt`).

## Conventions

- Be concise in commit messages; imperative mood.
- Match existing file structure: pages in `src/pages`, feature components in
  `src/components/<feature>`, shared types in `src/types.ts`.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

## Overrides to the generated Beads block above

- **Ignore "use `bd remember`, not MEMORY.md."** Cross-session, cross-repo memory lives at
  `~/.claude/projects/<slug>/memory/` and is not beads' job — keep using it.
- **Ignore "use `bd` for ALL task tracking, not markdown TODO lists."** This repo's narrative
  docs (`docs/ROADMAP.md`, `.coordination/LEDGER.md`, wave handoff notes) hold the *reasoning*
  behind a task, which a bead title can't carry — keep both. Beads is for "what's actionable
  right now," not a replacement for those docs.
- This repo has no `.scheduler.json` and is not registered with `claude-scheduler` — beads here
  is local task tracking only, nothing runs unattended.
