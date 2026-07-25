#!/usr/bin/env node
/**
 * Creates the demo account and its sample data in the Supabase project that
 * jsapps/.env.local points at, so the screenshots show a populated UI.
 *
 *   node seed.js            # safe: creates the account/data only if missing
 *   node seed.js --reset    # DESTRUCTIVE: deletes this demo user's expenses
 *                           # and groups, then rebuilds them from scratch
 *
 * NOTE: the existing demo data is deliberately kept for the next phase. Plain
 * `node seed.js` never deletes anything; only --reset does.
 *
 * Everything is written as the demo user via PostgREST with their own JWT, so
 * RLS applies exactly as it does for a real user. The service-role key is
 * never read or needed.
 *
 * Two things the app does client-side that REST seeding must do explicitly:
 *   - activity_events rows (written by AppContext, not a DB trigger)
 *   - balances are derived, never stored — a balance only shows up when a
 *     user's paid amount differs from their expense_splits share.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RESET = process.argv.includes('--reset');
const ENV_PATH = path.resolve(__dirname, '../../jsapps/.env.local');
const EMAIL = process.env.SPLITEASE_DEMO_EMAIL || 'demo@splitease.local';
const PASSWORD = process.env.SPLITEASE_DEMO_PASSWORD || 'demo1234';
const DISPLAY_NAME = 'Vignesh';

if (!fs.existsSync(ENV_PATH)) {
  console.error(`FAILED: ${ENV_PATH} not found. See README.md for the required keys.`);
  process.exit(1);
}
const ENV = Object.fromEntries(
  fs
    .readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL = ENV.VITE_SUPABASE_URL;
const ANON = ENV.VITE_SUPABASE_ANON_KEY;
if (!URL || !ANON) {
  console.error('FAILED: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.local');
  process.exit(1);
}

const NOW = new Date();
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
const uuid = () => crypto.randomUUID();
const money = (v) => Number(v.toFixed(2));

let TOKEN;
async function api(method, resource, body, headers = {}) {
  const res = await fetch(`${URL}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${resource} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const MIN = { Prefer: 'return=minimal' };

async function authenticate() {
  const signIn = await (
    await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
  ).json();
  if (signIn.access_token) return signIn;

  console.log(`no ${EMAIL} yet — signing up`);
  const signUp = await (
    await fetch(`${URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, data: { name: DISPLAY_NAME } }),
    })
  ).json();
  if (!signUp.access_token) {
    throw new Error(
      `could not create ${EMAIL}: ${JSON.stringify(signUp).slice(0, 250)}\n` +
        'If the project requires email confirmation, turn it off under ' +
        'Auth -> Providers -> Email -> Confirm email.'
    );
  }
  return signUp;
}

const FRIENDS = [
  ['Priya Raman', 'priya@example.com'],
  ['Arjun Mehta', 'arjun@example.com'],
  ['Sara Lopez', 'sara@example.com'],
  ['Daniel Kim', 'daniel@example.com'],
  ['Meera Nair', 'meera@example.com'],
];

const RENT_NOTE = 'Auto-debit from the joint account';

(async () => {
  const auth = await authenticate();
  TOKEN = auth.access_token;
  const ME = auth.user.id;
  console.log(`signed in as ${EMAIL} (${ME})`);

  const existing = await api('GET', 'expenses?select=id&limit=1');
  if (existing.length && !RESET) {
    console.log('\nDemo data already present — nothing to do.');
    console.log('Sample data is kept on purpose. Use --reset only if you want it rebuilt.');
    return;
  }

  if (RESET) {
    console.log('--reset: deleting this demo user\'s expenses and groups');
    await api('DELETE', `expenses?owner_id=eq.${ME}`, null, MIN);
    await api('DELETE', `groups?owner_id=eq.${ME}`, null, MIN);
    // friends are reused if already there; activity_events are append-only and
    // cannot be deleted under RLS, so old ones survive a reset by design.
  }

  // ---- friends (create only the missing ones) ----
  const have = await api('GET', 'friends?select=id,name');
  const missing = FRIENDS.filter(([n]) => !have.some((f) => f.name === n));
  if (missing.length) {
    await api(
      'POST',
      'friends',
      missing.map(([name, email]) => ({ id: uuid(), owner_id: ME, name, email, avatar: '' })),
      MIN
    );
  }
  const friends = await api('GET', 'friends?select=id,name&order=created_at');
  const F = Object.fromEntries(friends.map((f) => [f.name.split(' ')[0], f.id]));
  console.log(`friends: ${friends.length}`);

  // ---- groups + members (members must be real friend ids: GroupDetail.tsx
  // does friends.find(...)! and will break on an unknown member id) ----
  const G = {
    goa: { id: uuid(), name: 'Goa Trip 2026', members: [ME, F.Priya, F.Arjun, F.Sara] },
    flat: { id: uuid(), name: 'Flat 4B', members: [ME, F.Arjun, F.Meera] },
    crew: { id: uuid(), name: 'Weekend Crew', members: [ME, F.Sara, F.Daniel, F.Priya] },
    ski: { id: uuid(), name: 'Ski Trip (archived)', members: [ME, F.Daniel] },
  };
  await api('POST', 'groups', Object.values(G).map((g) => ({
    id: g.id, owner_id: ME, name: g.name, avatar: '',
  })), MIN);
  await api('POST', 'group_members', Object.values(G).flatMap((g) =>
    g.members.map((person_id) => ({ group_id: g.id, person_id }))
  ), MIN);
  console.log(`groups: ${Object.keys(G).length}`);

  // ---- expenses ----
  // Dates are spread across ~12 months on purpose: Analytics filters to the
  // last 90 days by default but its trend chart always shows 12 months.
  const E = [
    { d: 'Beach villa — 3 nights', a: 840, c: 'travel', g: G.goa, p: ME, ago: 12 },
    { d: 'Scooter rental', a: 96, c: 'transportation', g: G.goa, p: 'Priya', ago: 12 },
    { d: 'Seafood dinner at Britto’s', a: 214, c: 'dining', g: G.goa, p: ME, ago: 11 },
    { d: 'Parasailing + ferry', a: 180, c: 'entertainment', g: G.goa, p: 'Arjun', ago: 10 },
    { d: 'Beach shack lunch', a: 88, c: 'dining', g: G.goa, p: 'Sara', ago: 10 },
    { d: 'Airport cab', a: 72, c: 'transportation', g: G.goa, p: ME, ago: 9 },

    { d: 'July rent', a: 1800, c: 'rent', g: G.flat, p: ME, ago: 24, note: RENT_NOTE },
    { d: 'Electricity bill', a: 142, c: 'utilities', g: G.flat, p: 'Meera', ago: 20 },
    { d: 'Broadband', a: 60, c: 'utilities', g: G.flat, p: ME, ago: 18 },
    { d: 'Deep clean service', a: 120, c: 'services', g: G.flat, p: ME, ago: 15 },
    { d: 'Weekly groceries', a: 156, c: 'groceries', g: G.flat, p: 'Arjun', ago: 6 },
    { d: 'June rent', a: 1800, c: 'rent', g: G.flat, p: ME, ago: 55, note: RENT_NOTE },
    { d: 'Gas cylinder', a: 44, c: 'utilities', g: G.flat, p: 'Meera', ago: 48 },
    { d: 'Groceries — Costco run', a: 210, c: 'groceries', g: G.flat, p: ME, ago: 40 },

    { d: 'Concert tickets', a: 320, c: 'entertainment', g: G.crew, p: 'Daniel', ago: 30 },
    { d: 'Sunday brunch', a: 132, c: 'dining', g: G.crew, p: ME, ago: 5 },
    { d: 'Bowling night', a: 64, c: 'entertainment', g: G.crew, p: 'Sara', ago: 21 },
    { d: 'Escape room', a: 96, c: 'entertainment', g: G.crew, p: ME, ago: 60 },
    { d: 'Karaoke bar', a: 148, c: 'dining', g: G.crew, p: 'Priya', ago: 75 },

    { d: 'Birthday gift for Sara', a: 85, c: 'shopping', g: null, p: ME, with: ['Sara'], ago: 8 },
    { d: 'Shared streaming plan', a: 24, c: 'services', g: null, p: ME, with: ['Arjun', 'Priya'], ago: 3 },
    { d: 'Pharmacy run', a: 38, c: 'other', g: null, p: 'Meera', with: ['Meera'], ago: 2 },
    { d: 'Airport lounge day pass', a: 55, c: 'travel', g: null, p: ME, with: ['Daniel'], ago: 44 },
    { d: 'New headphones (split)', a: 180, c: 'shopping', g: null, p: 'Arjun', with: ['Arjun'], ago: 90 },
    { d: 'Team lunch', a: 96, c: 'dining', g: null, p: ME, with: ['Sara', 'Daniel'], ago: 120 },
    { d: 'Cab to conference', a: 42, c: 'transportation', g: null, p: ME, with: ['Priya'], ago: 150 },
    { d: 'Coworking day passes', a: 130, c: 'services', g: null, p: 'Sara', with: ['Sara'], ago: 180 },
    { d: 'Weekend cabin', a: 460, c: 'travel', g: null, p: ME, with: ['Daniel', 'Meera'], ago: 210 },
    { d: 'Grocery haul', a: 175, c: 'groceries', g: null, p: ME, with: ['Meera'], ago: 250 },
    { d: 'Winter jackets', a: 240, c: 'shopping', g: null, p: 'Daniel', with: ['Daniel'], ago: 300 },
    { d: 'Holiday dinner', a: 320, c: 'dining', g: null, p: ME, with: ['Priya', 'Sara', 'Arjun'], ago: 330 },
  ];

  const person = (x) => (x === ME ? ME : F[x]);
  const rows = [];
  const splits = [];
  const idByDesc = {};
  for (const e of E) {
    const id = uuid();
    idByDesc[e.d] = id;
    const parts = e.g ? e.g.members : [ME, ...e.with.map(person)];
    rows.push({
      id,
      owner_id: ME,
      description: e.d,
      amount: money(e.a),
      paid_by: person(e.p),
      date: daysAgo(e.ago),
      category: e.c,
      currency: 'USD',
      group_id: e.g ? e.g.id : null,
      notes: e.note || null,
      split_mode: 'equal',
    });
    const each = money(e.a / parts.length);
    parts.forEach((pid, i) => {
      const amount = i === parts.length - 1 ? money(e.a - each * (parts.length - 1)) : each;
      splits.push({ expense_id: id, person_id: pid, amount });
    });
  }
  await api('POST', 'expenses', rows, MIN);
  await api('POST', 'expense_splits', splits, MIN);
  console.log(`expenses: ${rows.length} (${splits.length} split rows)`);

  // ---- a settlement, so one balance is partly cleared ----
  await api('POST', 'settlements', [{
    id: uuid(), owner_id: ME, from_person_id: F.Sara, to_person_id: ME,
    amount: 60, currency: 'USD', date: daysAgo(4), group_id: null,
  }], MIN);

  // ---- soft-deleted rows, so /recently-deleted is not empty ----
  for (const [desc, ago] of [['Parasailing + ferry', 2], ['Bowling night', 5]]) {
    await api('PATCH', `expenses?id=eq.${idByDesc[desc]}`, { deleted_at: daysAgo(ago) }, MIN);
  }
  await api('PATCH', `groups?id=eq.${G.ski.id}`, { deleted_at: daysAgo(7) }, MIN);
  console.log('soft-deleted: 2 expenses + 1 group');

  // ---- activity_events (the app writes these client-side, so REST seeding
  // has to insert them explicitly; payload keys are camelCase domain fields) ----
  const ev = (h, action, entity_type, entity_id, group_id, before, after) => ({
    id: uuid(), owner_id: ME, actor_id: ME, action, entity_type, entity_id,
    group_id, before, after, created_at: hoursAgo(h),
  });
  const amountOf = (d) => money(E.find((e) => e.d === d).a);
  const payerOf = (d) => person(E.find((e) => e.d === d).p);
  await api('POST', 'activity_events', [
    ev(3, 'group.create', 'group', G.crew.id, G.crew.id, null, { name: G.crew.name }),
    ev(6, 'settlement.create', 'settlement', uuid(), null, null,
      { fromUserId: F.Sara, toUserId: ME, amount: 60 }),
    ev(9, 'expense.update', 'expense', idByDesc['Sunday brunch'], G.crew.id,
      { description: 'Brunch', amount: 120, paidBy: ME },
      { description: 'Sunday brunch', amount: amountOf('Sunday brunch'), paidBy: payerOf('Sunday brunch') }),
    ev(26, 'expense.create', 'expense', idByDesc['Weekly groceries'], G.flat.id, null,
      { description: 'Weekly groceries', amount: amountOf('Weekly groceries'), paidBy: payerOf('Weekly groceries') }),
    ev(30, 'expense.delete', 'expense', idByDesc['Parasailing + ferry'], G.goa.id,
      { description: 'Parasailing + ferry' }, null),
    ev(34, 'group.update', 'group', G.flat.id, G.flat.id, { name: 'Flat 4' }, { name: 'Flat 4B' }),
    ev(50, 'expense.restore', 'expense', idByDesc['Bowling night'], G.crew.id, null,
      { description: 'Bowling night' }),
    ev(54, 'import.create', 'import', uuid(), null, null,
      { source: 'csv', filename: 'bank-statement-june.csv', expenseCount: 9, friendCount: 2 }),
    ev(74, 'group.create', 'group', G.flat.id, G.flat.id, null, { name: G.flat.name }),
    ev(78, 'expense.create', 'expense', idByDesc['Beach villa — 3 nights'], G.goa.id, null,
      { description: 'Beach villa — 3 nights', amount: amountOf('Beach villa — 3 nights'), paidBy: payerOf('Beach villa — 3 nights') }),
    ev(98, 'group.delete', 'group', G.ski.id, G.ski.id, { name: G.ski.name }, null),
    ev(102, 'group.create', 'group', G.goa.id, G.goa.id, null, { name: G.goa.name }),
    ev(122, 'friend.add', 'friend', F.Meera, null, null, { id: F.Meera, name: 'Meera Nair' }),
    ev(126, 'friend.add', 'friend', F.Daniel, null, null, { id: F.Daniel, name: 'Daniel Kim' }),
  ], MIN);
  console.log('activity events: 14');

  // ---- one receipt, so the paperclip + receipt viewer are exercised ----
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const pg = await browser.newPage({ viewport: { width: 460, height: 640 } });
  await pg.setContent(`
    <div style="font:14px/1.7 ui-monospace,Menlo,monospace;padding:28px;background:#fff;color:#111">
      <div style="text-align:center;font-size:18px;font-weight:700;letter-spacing:2px">BRITTO'S</div>
      <div style="text-align:center;color:#666;font-size:12px">Baga Beach · Goa</div>
      <hr style="border:none;border-top:1px dashed #bbb;margin:16px 0">
      <div style="display:flex;justify-content:space-between"><span>2× Grilled kingfish</span><span>88.00</span></div>
      <div style="display:flex;justify-content:space-between"><span>1× Prawn curry</span><span>34.00</span></div>
      <div style="display:flex;justify-content:space-between"><span>1× Butter garlic crab</span><span>46.00</span></div>
      <div style="display:flex;justify-content:space-between"><span>4× Kingfisher</span><span>28.00</span></div>
      <div style="display:flex;justify-content:space-between"><span>Rice / breads</span><span>12.00</span></div>
      <hr style="border:none;border-top:1px dashed #bbb;margin:16px 0">
      <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>208.00</span></div>
      <div style="display:flex;justify-content:space-between"><span>Service 3%</span><span>6.00</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;margin-top:8px">
        <span>TOTAL</span><span>214.00</span></div>
      <hr style="border:none;border-top:1px dashed #bbb;margin:16px 0">
      <div style="text-align:center;color:#666;font-size:12px">Table 7 · Thank you!</div>
    </div>`);
  const jpeg = await pg.screenshot({ type: 'jpeg', quality: 80 });
  await browser.close();
  await api('POST', 'expense_receipts', [{
    expense_id: idByDesc['Seafood dinner at Britto’s'],
    owner_id: ME,
    mime_type: 'image/jpeg',
    byte_size: jpeg.length,
    data_base64: jpeg.toString('base64'),
  }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
  console.log(`receipt: 1 (${(jpeg.length / 1024).toFixed(0)}KB)`);

  console.log('\nDone. Now run:  node capture.js');
})().catch((e) => {
  console.error('\nFAILED: ' + e.message);
  process.exit(1);
});
