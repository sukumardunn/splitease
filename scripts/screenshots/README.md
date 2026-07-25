# UI screenshot harness

Captures every SplitEase screen into `working_prototype_screenshots/v<N>/` so
successive phases can be compared side by side.

`v0` is the pre-redesign baseline, captured 2026-07-25.

## Setup (once)

```bash
cd scripts/screenshots
npm install                 # playwright only; jsapps/ is untouched
```

This drives your installed Google Chrome (`channel: 'chrome'`), so there is no
browser download. It does **not** add a dependency to the app.

## Capture

```bash
cd jsapps && npm run dev          # terminal 1 — must be running
cd scripts/screenshots && node capture.js   # terminal 2
```

- `node capture.js` — writes to the next unused `v<N>`
- `node capture.js v2` — writes to `v2`, replacing it if it exists
- `node capture.js --headed` — watch it drive the browser

It prints a warning list and any console errors at the end. Warnings are
non-fatal: a surface that can't be found is skipped rather than aborting the run.

## Sample data

The screenshots need a populated account. **The existing demo data is kept
deliberately — it is wanted for the next phase.**

```bash
node seed.js            # safe: only creates what's missing, deletes nothing
node seed.js --reset    # DESTRUCTIVE: rebuilds this demo user's expenses+groups
```

Credentials (override with `SPLITEASE_DEMO_EMAIL` / `SPLITEASE_DEMO_PASSWORD`):

| | |
|---|---|
| email | `demo@splitease.local` |
| password | `demo1234` |

Seeding writes to whatever project `jsapps/.env.local` points at, as the demo
user via their own JWT — RLS applies normally and the service-role key is never
used. Sign-up works without an inbox because the hosted project has
`mailer_autoconfirm` on (Auth → Providers → Email → Confirm email is off).

What it creates: 5 friends, 4 groups, 31 expenses across all 10 categories
spread over ~12 months, 97 split rows, 1 settlement, 14 activity events,
2 soft-deleted expenses + 1 deleted group, and 1 receipt image.

## What gets captured

21 shots: the two auth screens, all 9 routes, group-detail's 3 tabs, 6 modals,
and 2 mobile views. Desktop is 1512×950 at DPR 2; mobile is 390×844 at DPR 3.

**Keep the viewport constants stable** across versions — changing them makes the
screenshots incomparable, which defeats the point.

## Things to know

- **There is no dark mode.** The app has no `dark:` classes, no `darkMode` in
  `tailwind.config.js`, and no theme toggle. `v0` is light-only for that reason,
  not by choice. Add dark captures here if a theme ever lands.
- **Two modals may not be real dialogs.** `modal-settle-up` and `modal-new-group`
  had no `[role="dialog"]` when captured, so those files may show the page
  behind them. The harness warns when it happens.
- **Some on-screen numbers are hardcoded**, not computed — the "You are owed
  $120.50" on group cards and "You owe $145.25" on group detail. They won't move
  between versions unless that source changes.
- Non-obvious constraints the seed script has to respect, learned the hard way:
  - `GroupDetail.tsx` does `friends.find(...)!` on group members, so every
    member id must be a real friend id (or the current user) or the page breaks.
  - Balances are derived, never stored — one only appears when a user's paid
    amount differs from their `expense_splits` share.
  - `activity_events` are written by `AppContext`, not a DB trigger, so REST
    seeding must insert them by hand, with **camelCase** payload keys.
  - `activity_events` has no UPDATE/DELETE policy — it is append-only, so
    `--reset` cannot clear old events.
  - Analytics defaults to a 90-day filter but its trend chart always spans 12
    months, so expense dates need to cover both.
