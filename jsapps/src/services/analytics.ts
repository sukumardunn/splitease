import { Expense, ExpenseCategory } from '../types';

/**
 * Analytics aggregations (Phase 6).
 *
 * Pure functions over already-loaded domain objects — no store access, no
 * React — so the numbers behind every chart are unit-testable without a DB or a
 * renderer.
 *
 * Two conventions run through the whole module:
 *
 * 1. **Every total is the current user's own share**, not the expense's face
 *    value. A $100 dinner split with one friend is $50 of *your* spending, and
 *    "where does my money go" is the question these charts answer. Callers must
 *    label the figures accordingly — `Analytics.tsx` says "your share" in the
 *    card subtitles.
 * 2. **Month bucketing and period cutoffs are computed in UTC**, matching the
 *    ISO timestamps in `Expense.date`. Local-time bucketing would put an
 *    expense near a month boundary in a different bucket depending on the
 *    viewer's timezone, and would make these tests machine-dependent.
 */

/** Display labels for every real spending category, in form/menu order. */
export const CATEGORY_LABELS: Record<Exclude<ExpenseCategory, 'settlement'>, string> = {
  groceries: 'Groceries',
  rent: 'Rent',
  utilities: 'Utilities',
  dining: 'Dining',
  entertainment: 'Entertainment',
  transportation: 'Transportation',
  travel: 'Travel',
  shopping: 'Shopping',
  services: 'Services',
  other: 'Other',
};

/** The real spending categories, excluding the synthetic `settlement`. */
export const EXPENSE_CATEGORIES = Object.keys(CATEGORY_LABELS) as Exclude<
  ExpenseCategory,
  'settlement'
>[];

export function categoryLabel(category: ExpenseCategory): string {
  return category === 'settlement'
    ? 'Settlement'
    : CATEGORY_LABELS[category] ?? 'Other';
}

function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * How much of `expense` the given user personally bears.
 *
 * Read off `splitWith`, which includes the current user as a participant (see
 * `AddExpenseModal`'s `participants`). Returns 0 when the user isn't a
 * participant — that happens for an expense the user recorded on behalf of
 * others, where they paid but bear none of the cost.
 */
export function shareOf(expense: Expense, userId: string): number {
  const split = expense.splitWith.find((s) => s.userId === userId);
  return split ? roundToCents(split.amount) : 0;
}

/**
 * Expenses that count as spending: active, and not a legacy settlement row.
 *
 * Settlements are cash transfers between people, not consumption — counting
 * them would double-count the expense they repay. Phase 3 made settlements
 * first-class records, but pre-Phase-3 data can still carry
 * `category === 'settlement'` expenses, so both shapes are excluded here.
 */
export function isSpending(expense: Expense): boolean {
  return !expense.deletedAt && expense.category !== 'settlement';
}

export type Period = '30d' | '90d' | '12m' | 'all';

export const PERIODS: { value: Period; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

/**
 * Inclusive lower bound for a period, or null for 'all'.
 *
 * Day-granular: the cutoff is midnight UTC `days` before `now`, so "last 30
 * days" means 30 whole calendar days and doesn't shift with the time of day the
 * page happens to be opened.
 */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === 'all') return null;
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 365;
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(midnight - (days - 1) * 86_400_000);
}

export function filterByPeriod(expenses: Expense[], period: Period, now: Date): Expense[] {
  const start = periodStart(period, now);
  if (!start) return expenses.filter(isSpending);
  const startMs = start.getTime();
  return expenses.filter((e) => {
    if (!isSpending(e)) return false;
    const ms = new Date(e.date).getTime();
    return !Number.isNaN(ms) && ms >= startMs;
  });
}

export interface CategorySlice {
  category: ExpenseCategory;
  label: string;
  total: number;
  count: number;
}

/**
 * The user's share per category, largest first.
 *
 * Only categories with a nonzero total appear — an empty bar for every unused
 * category is noise, and the chart is ranked rather than a fixed axis.
 */
export function totalsByCategory(expenses: Expense[], userId: string): CategorySlice[] {
  const totals = new Map<ExpenseCategory, { total: number; count: number }>();

  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    const share = shareOf(expense, userId);
    if (share === 0) continue;
    const entry = totals.get(expense.category) ?? { total: 0, count: 0 };
    entry.total += share;
    entry.count += 1;
    totals.set(expense.category, entry);
  }

  return [...totals.entries()]
    .map(([category, { total, count }]) => ({
      category,
      label: categoryLabel(category),
      total: roundToCents(total),
      count,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/**
 * Whole-percent shares of `total`, apportioned by largest remainder.
 *
 * Rounding each share independently is what makes a three-way breakdown print
 * 34% / 34% / 34% = 102%: every share is rounded in isolation, the errors point
 * the same way, and nothing reconciles them. Largest remainder floors each share
 * first, then hands the leftover whole points to the largest fractional parts,
 * so the printed column adds up to what a reader gets by summing it.
 *
 * Only the *percentages* are re-apportioned. The dollar figures beside them are
 * exact and are deliberately not touched — this function never sees them as
 * anything but a ratio.
 *
 * `total` is the denominator, so the result sums to exactly 100 when `values`
 * sum to `total` (which is how the category card calls it). When they sum to
 * less, the target is the rounded exact sum instead: a subset of spending must
 * not be inflated to 100%.
 *
 * Ties in the fractional part go to the earlier index, so the output is a pure
 * function of the caller's ordering — `totalsByCategory` already sorts stably,
 * and a percentage that flickered between renders would be a real bug.
 */
export function percentageShares(values: number[], total: number): number[] {
  // No spend at all, or a nonsense denominator: everything is 0%. Guarding the
  // division here is what keeps an empty period from rendering NaN%.
  if (!(total > 0)) return values.map(() => 0);

  const exact = values.map((v) => (v / total) * 100);
  // Nudge before flooring so a share that is mathematically whole but lands at
  // 24.999999999999996 in binary floating point floors to 25, not to 24.
  const floors = exact.map((p) => Math.floor(p + 1e-9));
  const fracs = exact.map((p, i) => p - floors[i]);
  const target = Math.round(exact.reduce((a, b) => a + b, 0));

  // Equals round(sum of fracs), so it is in [0, values.length] — never
  // negative, which is why only the "hand points out" direction exists.
  const leftover = target - floors.reduce((a, b) => a + b, 0);
  const byRemainder = values
    .map((_, i) => i)
    .sort((a, b) => fracs[b] - fracs[a] || a - b);
  for (let k = 0; k < leftover && k < byRemainder.length; k++) {
    floors[byRemainder[k]] += 1;
  }

  return floors;
}

export interface MonthSlice {
  /** `YYYY-MM`, UTC. */
  key: string;
  /** Short display label, e.g. `Jul` — or `Jul '25` in January, to mark the year. */
  label: string;
  total: number;
  count: number;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/**
 * The user's share per month over the trailing `months` months, oldest first.
 *
 * Months with no spending are returned as zeroes rather than omitted: a gap in
 * a time axis is information, and dropping it would silently compress the
 * x-axis and imply continuity that isn't there.
 */
export function totalsByMonth(
  expenses: Expense[],
  userId: string,
  months: number,
  now: Date
): MonthSlice[] {
  const buckets = new Map<string, { total: number; count: number }>();

  // Seed the trailing window so empty months survive.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const window: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const key = monthKey(d.getUTCFullYear(), d.getUTCMonth());
    const name = MONTH_NAMES[d.getUTCMonth()];
    // Stamp the year on January so a 12-month window reads unambiguously.
    const label =
      d.getUTCMonth() === 0 ? `${name} '${String(d.getUTCFullYear()).slice(2)}` : name;
    window.push({ key, label });
    buckets.set(key, { total: 0, count: 0 });
  }

  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    const share = shareOf(expense, userId);
    if (share === 0) continue;
    // ISO prefix is the UTC month directly; avoids a Date parse per row.
    const key = expense.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the window
    bucket.total += share;
    bucket.count += 1;
  }

  return window.map(({ key, label }) => {
    const { total, count } = buckets.get(key)!;
    return { key, label, total: roundToCents(total), count };
  });
}

export interface SpendSummary {
  total: number;
  expenseCount: number;
  /** Mean share per expense, 0 when there are none. */
  average: number;
  /** The largest single share, or null when there are no expenses. */
  largest: { description: string; amount: number } | null;
}

export function summarizeSpend(expenses: Expense[], userId: string): SpendSummary {
  let total = 0;
  let expenseCount = 0;
  let largest: { description: string; amount: number } | null = null;

  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    const share = shareOf(expense, userId);
    if (share === 0) continue;
    total += share;
    expenseCount += 1;
    if (!largest || share > largest.amount) {
      largest = { description: expense.description, amount: share };
    }
  }

  return {
    total: roundToCents(total),
    expenseCount,
    average: expenseCount === 0 ? 0 : roundToCents(total / expenseCount),
    largest,
  };
}
