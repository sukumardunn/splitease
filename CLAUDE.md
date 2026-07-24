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
