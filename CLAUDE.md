# SplitEase — Repo Instructions

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
4. **Work on your own git branch** named `agent/<short-task>-<agentid>`. Never
   commit feature work directly to `master` or another agent's branch.
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
- **State:** currently in-memory only — `src/context/AppContext.tsx` holds all
  data from `src/data/demoData.ts`. Supabase client (`src/lib/supabase.ts`) and
  schema (`supabase/migrations/`) exist but are **not yet wired into the app**.
- **Dev:** `cd jsapps && npm install && npm run dev`. Lint: `npm run lint`.
- Do not add UI/icon packages beyond `lucide-react` + Tailwind unless requested
  (see `jsapps/.bolt/prompt`).

## Conventions

- Be concise in commit messages; imperative mood.
- Match existing file structure: pages in `src/pages`, feature components in
  `src/components/<feature>`, shared types in `src/types.ts`.
