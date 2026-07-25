# SplitEase

A Splitwise-style expense-splitting web app — groups, expenses, five split modes,
multi-payer, settle-up with debt simplification, soft-delete + audit log, and
Supabase-backed auth & persistence.

- **App root:** `jsapps/` — Vite + React 18 + TypeScript + Tailwind, `lucide-react` icons.
- **Backend:** Supabase (Postgres + Auth + RLS). Schema lives in `supabase/migrations/`.
- **State:** `src/context/AppContext.tsx` — optimistic-online; writes go to Postgres
  and roll back with a toast on failure.

---

## Branching: `claude-driven-changes` is the working line

**All work happens on `claude-driven-changes`.** Branch from it, merge back into it,
and treat it as the integration branch.

**`master` is frozen** at the upstream commit (`a8266c6`, same as `origin/master`).
Do not commit to `master` directly — not feature code, not docs, not coordination
ledger updates. Earlier phases (0–4a) were developed on `master` before this rule
existed; that history now lives on `claude-driven-changes`, which is the only
branch you should build on.

```bash
git checkout claude-driven-changes
git checkout -b agent/<short-task>-<agentid>   # do your work here
# ...then merge back into claude-driven-changes
```

See [`.coordination/PROTOCOL.md`](.coordination/PROTOCOL.md) for the full
multi-agent coordination rules (ledger claims, heartbeats, stale-claim recovery).

---

## Setup

### 1. Prerequisites

- **Node 20 or newer** — every script (`test`, `build`, `typecheck`, `lint`) runs
  on Node 20 and Node 26 alike. The suite used to require Node 20 because
  `localStorage` was `undefined` on newer Node; `jsapps/src/test/setup.ts` fixes
  that (see [`docs/PHASE4B_BACKLOG.md`](docs/PHASE4B_BACKLOG.md) item 12).
- A **Supabase project** — either hosted (supabase.com, no Docker needed) or local
  via the `supabase` CLI + Docker Desktop.

### 2. Install

```bash
cd jsapps
npm install
```

### 3. Apply the database schema

Run `supabase/migrations/20260719000001_phase4a_auth_persistence.sql` against your
project. It creates 9 tables, RLS policies, and the `handle_new_user` trigger.

- **Hosted:** paste it into the Supabase dashboard SQL editor and run it.
- **Local CLI:** `supabase start && supabase db reset`.

Also disable email confirmations for local dev so sign-up logs you straight in
(dashboard: *Auth → Providers → Email → Confirm email* off; or local
`supabase/config.toml`: `[auth.email] enable_confirmations = false`).

### 4. Create `jsapps/.env.local`

> **`.env.local` isn't in git (by design) — recreate it wherever you deploy.**
>
> It's ignored via the `*.local` pattern in `jsapps/.gitignore`, so it will never
> arrive with a `git clone` and it won't travel to a new machine, CI runner, or
> hosting provider. Every fresh environment needs this file written by hand (or
> the equivalent env vars set in your host's dashboard). If it's missing or
> misspelled, the app fails at startup in `src/lib/supabase.ts`.

```bash
# jsapps/.env.local
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Find both under *Project Settings → API* in the dashboard (or `supabase status`
for a local stack).

**Never add a service-role/secret key with a `VITE_` prefix** — Vite inlines every
`VITE_`-prefixed variable into the client bundle, which would publish a key that
bypasses RLS. If you need one for CLI/admin work, keep it unprefixed
(`SUPABASE_SECRET_KEY=…`); the app must never read it.

After creating the file, confirm it's invisible to git:

```bash
git status --short jsapps/.env.local   # must print nothing
```

### 5. Run

```bash
cd jsapps
npm run dev
```

Sign up, and the app starts empty. If you have pre-4a data in `localStorage`
(`splitease.appState`), you'll get a one-time import prompt on first load.

---

## Commands

All run from `jsapps/`:

| Command             | What it does                                      |
|---------------------|---------------------------------------------------|
| `npm run dev`       | Vite dev server                                   |
| `npm test`          | Vitest suite                                      |
| `npm run typecheck` | `tsc --noEmit`                                    |
| `npm run build`     | typecheck + production build                      |
| `npm run lint`      | ESLint                                            |
| `npm run preview`   | Serve the production build                        |

Full gate before any merge: `npm test && npm run typecheck && npm run build && npm run lint`.

---

## Conventions

- Pages in `src/pages`, feature components in `src/components/<feature>`, shared
  types in `src/types.ts`.
- No new UI/icon packages beyond Tailwind + `lucide-react` (see `jsapps/.bolt/prompt`).
- Migrations are append-only — never edit an applied migration; add a new one.
- New entity ids use `crypto.randomUUID()`.
- Commit messages: concise, imperative.

---

## Status & roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) is the durable record of what's done and
what's left, in priority order. Read it before picking up work.

## Known issues

- **"Add Friend" does nothing** — the buttons in `src/pages/Friends.tsx` have no
  handler, and there is no `addFriend` anywhere in the app, so a new user can't
  add anyone to split with. Top of the roadmap.
- **Whole-state rollback granularity** — a failed write restores the entire state
  snapshot, discarding any concurrent in-flight optimistic update. A spec'd
  Phase-4a tradeoff, commented in `AppContext.tsx`; fixing it needs a real
  concurrency model, so it's the one open Phase 4b item.

Everything else from the Phase 4b list — silent no-op writes, session-bootstrap
hardening, DB union validation, AuthScreen a11y, the import-modal focus trap, the
sidebar balance, and the Node-version test split — is now fixed; see
[`docs/PHASE4B_BACKLOG.md`](docs/PHASE4B_BACKLOG.md) for per-item detail and
commits. (The working copy in `.superpowers/sdd/progress.md` is git-excluded and
machine-local; the backlog doc is the durable record.)
