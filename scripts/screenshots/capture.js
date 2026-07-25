#!/usr/bin/env node
/**
 * SplitEase UI screenshot harness.
 *
 * Captures every screen into working_prototype_screenshots/v<N>/ so successive
 * phases can be compared side by side.
 *
 *   node capture.js            # auto-picks the next unused v<N>
 *   node capture.js v2         # writes to v2 (overwrites it if it exists)
 *   node capture.js --headed   # watch it drive the browser
 *
 * Requires the dev server to already be running:  cd jsapps && npm run dev
 * Requires demo data to exist:                    node seed.js  (see README)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const ROOT = path.join(REPO, 'working_prototype_screenshots');
const BASE = process.env.SPLITEASE_URL || 'http://localhost:5173';
const EMAIL = process.env.SPLITEASE_DEMO_EMAIL || 'demo@splitease.local';
const PASSWORD = process.env.SPLITEASE_DEMO_PASSWORD || 'demo1234';

// Retina desktop + a phone. Keep these stable across versions, otherwise the
// screenshots stop being comparable.
const DESKTOP = { width: 1512, height: 950, deviceScaleFactor: 2 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const explicit = args.find((a) => /^v\d+$/.test(a));

function nextVersion() {
  if (!fs.existsSync(ROOT)) return 'v0';
  const used = fs
    .readdirSync(ROOT)
    .map((d) => /^v(\d+)$/.exec(d))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return `v${used.length ? Math.max(...used) + 1 : 0}`;
}

const VERSION = explicit || nextVersion();
const OUT = path.join(ROOT, VERSION);

let n = 0;
const warnings = [];

async function shot(page, name, { wait = 1400, fullPage = true } = {}) {
  await page.waitForTimeout(wait);
  const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ${String(n).padStart(2, '0')}-${name}.png  ${kb}KB`);
  n++;
}

/** Open a modal, shoot it, close it. Never fatal — a missing modal is a warning. */
async function modal(page, name, open, wait = 1300) {
  try {
    await open();
    await page.waitForTimeout(wait);
    const isDialog = await page.locator('[role="dialog"]').count();
    if (!isDialog) warnings.push(`${name}: no [role="dialog"] present — shot may show the page behind it`);
    await shot(page, name, { fullPage: false, wait: 200 });
  } catch (e) {
    warnings.push(`${name}: ${e.message.split('\n')[0].slice(0, 120)}`);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#auth-email', EMAIL);
  await page.fill('#auth-password', PASSWORD);
  await page.getByRole('button', { name: /^log in$/i }).click();
  await page.waitForTimeout(3500);
  const body = await page.locator('body').innerText();
  if (/log in to your account/i.test(body)) {
    throw new Error(
      `Login failed for ${EMAIL}. Does the demo account exist? Run:  node seed.js --reset`
    );
  }
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\nSplitEase screenshots -> ${path.relative(REPO, OUT)}\n`);

  const browser = await chromium.launch({ channel: 'chrome', headless: !headed });
  const ctx = await browser.newContext({
    viewport: { width: DESKTOP.width, height: DESKTOP.height },
    deviceScaleFactor: DESKTOP.deviceScaleFactor,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  // ---- auth (logged out) ----
  console.log('auth');
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  } catch {
    throw new Error(`Cannot reach ${BASE}. Start the dev server:  cd jsapps && npm run dev`);
  }
  await shot(page, 'login');
  await page.getByRole('button', { name: /sign up/i }).click();
  await shot(page, 'signup');
  await page.getByRole('button', { name: /already have an account/i }).click();
  await page.waitForTimeout(400);

  await login(page);

  // ---- top-level pages ----
  console.log('pages');
  for (const [name, route] of [['dashboard', '/'], ['groups', '/groups']]) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await shot(page, name);
  }

  // ---- group detail + tabs ----
  await page.goto(BASE + '/groups', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const groupLink = page.locator('a[href^="/groups/"]').first();
  if (await groupLink.count()) {
    await groupLink.click();
    await page.waitForTimeout(1800);
    await shot(page, 'group-detail-expenses');
    for (const tab of ['Members', 'Settings']) {
      const t = page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') }).first();
      if (await t.count()) {
        await t.click();
        await shot(page, `group-detail-${tab.toLowerCase()}`);
      } else warnings.push(`group-detail tab "${tab}" not found`);
    }
  } else warnings.push('no group link on /groups — is the demo data seeded?');

  for (const [name, route] of [
    ['expenses', '/expenses'],
    ['friends', '/friends'],
    ['analytics', '/analytics'],
    ['activity', '/activity'],
    ['recently-deleted', '/recently-deleted'],
    ['settings', '/settings'],
  ]) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await shot(page, name);
  }

  // ---- modals ----
  console.log('modals');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await modal(page, 'modal-add-expense', () =>
    page.getByRole('button', { name: /add expense/i }).first().click()
  );

  // add-expense with a non-equal split mode chosen, so the split UI is visible
  try {
    await page.getByRole('button', { name: /add expense/i }).first().click();
    await page.waitForSelector('#expense-description', { timeout: 6000 });
    await page.fill('#expense-description', 'Villa deposit');
    await page.fill('#expense-amount', '600');
    await page.selectOption('#expense-category', 'travel');
    const pct = page.getByRole('button', { name: /percentage/i }).first();
    if (await pct.count()) await pct.click();
    await shot(page, 'modal-add-expense-percentage-split', { fullPage: false, wait: 900 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {
    warnings.push(`modal-add-expense-percentage-split: ${e.message.split('\n')[0].slice(0, 120)}`);
  }

  await page.goto(BASE + '/friends', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await modal(page, 'modal-add-friend', () =>
    page.getByRole('button', { name: /add friend/i }).first().click()
  );
  await modal(page, 'modal-settle-up', () =>
    page.getByRole('button', { name: /settle/i }).first().click()
  );

  await page.goto(BASE + '/groups', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await modal(page, 'modal-new-group', () =>
    page.getByRole('button', { name: /new group/i }).first().click()
  );

  await page.goto(BASE + '/expenses', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const clip = page.locator('button[aria-label*="receipt" i], button[title*="receipt" i]').first();
  if (await clip.count()) {
    await modal(page, 'modal-receipt-viewer', () => clip.click());
  } else warnings.push('no receipt button found — is a receipt attached to any expense?');

  // ---- mobile ----
  console.log('mobile');
  const mctx = await browser.newContext({
    viewport: { width: MOBILE.width, height: MOBILE.height },
    deviceScaleFactor: MOBILE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push('MOBILE PAGEERROR: ' + e.message));
  await login(mp);
  await shot(mp, 'mobile-dashboard');
  const burger = mp.locator('button:visible').filter({ hasText: /^$/ }).first();
  if (await burger.count()) {
    await burger.click();
    await shot(mp, 'mobile-menu');
  } else warnings.push('mobile burger button not found');

  await browser.close();

  // ---- report ----
  console.log(`\n${n} screenshots -> ${path.relative(REPO, OUT)}`);
  if (warnings.length) {
    console.log('\nwarnings:');
    warnings.forEach((w) => console.log('  - ' + w));
  }
  console.log('\nconsole errors: ' + (errors.length ? '\n  ' + errors.slice(0, 10).join('\n  ') : 'none'));
})().catch((e) => {
  console.error('\nFAILED: ' + e.message);
  process.exit(1);
});
