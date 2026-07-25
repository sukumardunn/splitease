import { describe, it, expect } from 'vitest';
import {
  shareOf,
  isSpending,
  periodStart,
  filterByPeriod,
  totalsByCategory,
  percentageShares,
  totalsByMonth,
  summarizeSpend,
  categoryLabel,
  EXPENSE_CATEGORIES,
} from './analytics';
import { Expense, ExpenseCategory } from '../types';

const ME = 'me';
const ALICE = 'alice';

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: crypto.randomUUID(),
    description: 'Thing',
    amount: 100,
    paidBy: ME,
    splitWith: [
      { userId: ME, amount: 50 },
      { userId: ALICE, amount: 50 },
    ],
    date: '2026-07-10T12:00:00.000Z',
    category: 'dining',
    currency: 'USD',
    groupId: null,
    deletedAt: null,
    ...over,
  };
}

describe('shareOf', () => {
  it("returns the user's own split, not the expense face value", () => {
    expect(shareOf(expense({ amount: 100 }), ME)).toBe(50);
  });

  it('returns 0 when the user bears none of the cost', () => {
    // Recorded on behalf of others: paid the whole thing, consumed none of it.
    const e = expense({ splitWith: [{ userId: ALICE, amount: 100 }] });
    expect(shareOf(e, ME)).toBe(0);
  });

  it('rounds to cents', () => {
    const e = expense({ splitWith: [{ userId: ME, amount: 33.333333 }] });
    expect(shareOf(e, ME)).toBe(33.33);
  });
});

describe('isSpending', () => {
  it('excludes soft-deleted expenses', () => {
    expect(isSpending(expense({ deletedAt: '2026-07-11T00:00:00.000Z' }))).toBe(false);
  });

  it('excludes legacy settlement-category expenses so repayments are not counted as spend', () => {
    expect(isSpending(expense({ category: 'settlement' }))).toBe(false);
  });

  it('includes an ordinary active expense', () => {
    expect(isSpending(expense())).toBe(true);
  });
});

describe('periodStart', () => {
  const now = new Date('2026-07-25T18:30:00.000Z');

  it('returns null for all-time', () => {
    expect(periodStart('all', now)).toBeNull();
  });

  it('is day-granular, so the cutoff does not drift with the time of day', () => {
    const start = periodStart('30d', now)!;
    expect(start.toISOString()).toBe('2026-06-26T00:00:00.000Z');
    // Same calendar day, different clock time => same cutoff.
    const later = periodStart('30d', new Date('2026-07-25T23:59:00.000Z'))!;
    expect(later.toISOString()).toBe(start.toISOString());
  });

  it('counts 30 days inclusive of today', () => {
    const start = periodStart('30d', now)!;
    const days = (Date.UTC(2026, 6, 25) - start.getTime()) / 86_400_000;
    expect(days).toBe(29); // 29 days back + today = 30
  });
});

describe('filterByPeriod', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  it('keeps expenses inside the window and drops older ones', () => {
    const inside = expense({ date: '2026-07-01T00:00:00.000Z' });
    const outside = expense({ date: '2026-01-01T00:00:00.000Z' });
    const kept = filterByPeriod([inside, outside], '30d', now);
    expect(kept).toEqual([inside]);
  });

  it('keeps everything spending-shaped for all-time but still drops deleted and settlements', () => {
    const old = expense({ date: '2001-01-01T00:00:00.000Z' });
    const deleted = expense({ deletedAt: '2026-07-02T00:00:00.000Z' });
    const settlement = expense({ category: 'settlement' });
    expect(filterByPeriod([old, deleted, settlement], 'all', now)).toEqual([old]);
  });

  it('drops rows with an unparseable date rather than bucketing them at the epoch', () => {
    const bad = expense({ date: 'not-a-date' });
    expect(filterByPeriod([bad], '30d', now)).toEqual([]);
  });
});

describe('totalsByCategory', () => {
  it("sums the user's share per category, largest first", () => {
    const slices = totalsByCategory(
      [
        expense({ category: 'dining', splitWith: [{ userId: ME, amount: 20 }] }),
        expense({ category: 'dining', splitWith: [{ userId: ME, amount: 5 }] }),
        expense({ category: 'rent', splitWith: [{ userId: ME, amount: 900 }] }),
      ],
      ME
    );
    expect(slices).toEqual([
      { category: 'rent', label: 'Rent', total: 900, count: 1 },
      { category: 'dining', label: 'Dining', total: 25, count: 2 },
    ]);
  });

  it('omits categories the user has no share in', () => {
    const slices = totalsByCategory(
      [expense({ category: 'travel', splitWith: [{ userId: ALICE, amount: 100 }] })],
      ME
    );
    expect(slices).toEqual([]);
  });

  it('breaks ties alphabetically so the order is stable across renders', () => {
    const slices = totalsByCategory(
      [
        expense({ category: 'travel', splitWith: [{ userId: ME, amount: 10 }] }),
        expense({ category: 'dining', splitWith: [{ userId: ME, amount: 10 }] }),
      ],
      ME
    );
    expect(slices.map((s) => s.category)).toEqual(['dining', 'travel']);
  });

  it('excludes deleted and settlement rows', () => {
    const slices = totalsByCategory(
      [
        expense({ category: 'settlement', splitWith: [{ userId: ME, amount: 500 }] }),
        expense({ deletedAt: '2026-07-11T00:00:00.000Z' }),
      ],
      ME
    );
    expect(slices).toEqual([]);
  });
});

describe('percentageShares', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('sums to 100 where independent rounding would round every share down to 99', () => {
    // 33.33% three times: rounding each in isolation prints 33/33/33 = 99.
    expect(percentageShares([10, 10, 10], 30)).toEqual([34, 33, 33]);
    expect(sum(percentageShares([10, 10, 10], 30))).toBe(100);
  });

  it('sums to 100 where independent rounding would round every share up to 102', () => {
    // 16.66% six times: rounding each in isolation prints 17 six times = 102.
    const shares = percentageShares([1, 1, 1, 1, 1, 1], 6);
    expect(shares).toEqual([17, 17, 17, 17, 16, 16]);
    expect(sum(shares)).toBe(100);
  });

  it('gives a single category the whole 100%', () => {
    expect(percentageShares([42.5], 42.5)).toEqual([100]);
  });

  it('leaves already-whole percentages alone, including exact halves', () => {
    expect(percentageShares([50, 50], 100)).toEqual([50, 50]);
    expect(percentageShares([25, 25, 25, 25], 100)).toEqual([25, 25, 25, 25]);
    expect(percentageShares([90, 10], 100)).toEqual([90, 10]);
  });

  it('returns zeroes rather than NaN when there is no spend', () => {
    expect(percentageShares([0, 0], 0)).toEqual([0, 0]);
    expect(percentageShares([], 0)).toEqual([]);
    // A negative or missing denominator must not produce -Infinity% either.
    expect(percentageShares([5], -1)).toEqual([0]);
    expect(percentageShares([5], NaN)).toEqual([0]);
  });

  it('breaks equal remainders by input order, so the display cannot flicker', () => {
    // Two identical remainders, one point to hand out: it goes to the earlier
    // index every time. Same input => same output, run to run.
    const values = [1, 1, 1];
    const first = percentageShares(values, 3);
    expect(first).toEqual([34, 33, 33]);
    for (let i = 0; i < 5; i++) {
      expect(percentageShares(values, 3)).toEqual(first);
    }
  });

  it('is a pure function of order, so re-ranked input re-ranks the percentages', () => {
    // Same multiset, different order: the extra point follows the tie-break to
    // whichever equal-remainder row comes first, and nothing else moves.
    expect(percentageShares([7, 1, 1], 9)).toEqual([78, 11, 11]);
    expect(percentageShares([1, 7, 1], 9)).toEqual([11, 78, 11]);
  });

  it('hands leftover points to the largest fractional parts first', () => {
    // Exact: 47.5 / 47.5 / 5. Floors 47/47/5 = 99, one point to hand out, and
    // the two .5 remainders tie => earlier index wins.
    expect(percentageShares([95, 95, 10], 200)).toEqual([48, 47, 5]);
    // Exact: 66.6 / 33.3. Floors 66/33 = 99; .6 beats .3.
    expect(percentageShares([200, 100], 300)).toEqual([67, 33]);
  });

  it('does not inflate a subset to 100%', () => {
    // Callers that pass only part of the spend get the honest figure: the
    // apportionment target is the rounded exact sum, not always 100.
    expect(percentageShares([25, 25], 100)).toEqual([25, 25]);
    expect(sum(percentageShares([10, 10, 10], 100))).toBe(30);
  });

  it('sums to 100 end to end, over the figures totalsByCategory really produces', () => {
    // Awkward cents on purpose: this is the shape that produced 101% before.
    const expenses = [
      expense({ category: 'rent', splitWith: [{ userId: ME, amount: 899.99 }] }),
      expense({ category: 'dining', splitWith: [{ userId: ME, amount: 137.41 }] }),
      expense({ category: 'travel', splitWith: [{ userId: ME, amount: 61.33 }] }),
      expense({ category: 'groceries', splitWith: [{ userId: ME, amount: 212.07 }] }),
      expense({ category: 'utilities', splitWith: [{ userId: ME, amount: 7.5 }] }),
    ];
    const slices = totalsByCategory(expenses, ME);
    // The page passes summarizeSpend().total as the denominator.
    const { total } = summarizeSpend(expenses, ME);
    const shares = percentageShares(
      slices.map((s) => s.total),
      total
    );
    expect(sum(shares)).toBe(100);
    // The dollar figures are untouched by the apportionment.
    expect(slices.map((s) => s.total)).toEqual([899.99, 212.07, 137.41, 61.33, 7.5]);
  });
});

describe('totalsByMonth', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  it('returns the trailing window oldest-first, zero-filling empty months', () => {
    const slices = totalsByMonth(
      [expense({ date: '2026-07-10T12:00:00.000Z', splitWith: [{ userId: ME, amount: 40 }] })],
      ME,
      3,
      now
    );
    expect(slices.map((s) => s.key)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(slices.map((s) => s.total)).toEqual([0, 0, 40]);
    expect(slices.map((s) => s.count)).toEqual([0, 0, 1]);
  });

  it('ignores expenses outside the window', () => {
    const slices = totalsByMonth(
      [expense({ date: '2025-01-05T12:00:00.000Z', splitWith: [{ userId: ME, amount: 999 }] })],
      ME,
      3,
      now
    );
    expect(slices.every((s) => s.total === 0)).toBe(true);
  });

  it('crosses a year boundary and stamps the year on January', () => {
    const slices = totalsByMonth([], ME, 3, new Date('2026-01-15T12:00:00.000Z'));
    expect(slices.map((s) => s.key)).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(slices.map((s) => s.label)).toEqual(['Nov', 'Dec', "Jan '26"]);
  });

  it('accumulates several expenses into one month', () => {
    const slices = totalsByMonth(
      [
        expense({ date: '2026-07-01T00:00:00.000Z', splitWith: [{ userId: ME, amount: 10 }] }),
        expense({ date: '2026-07-31T23:59:59.000Z', splitWith: [{ userId: ME, amount: 2.5 }] }),
      ],
      ME,
      1,
      now
    );
    expect(slices).toEqual([{ key: '2026-07', label: 'Jul', total: 12.5, count: 2 }]);
  });
});

describe('summarizeSpend', () => {
  it('totals, counts, averages and finds the largest single share', () => {
    const summary = summarizeSpend(
      [
        expense({ description: 'Coffee', splitWith: [{ userId: ME, amount: 5 }] }),
        expense({ description: 'Flights', splitWith: [{ userId: ME, amount: 300 }] }),
      ],
      ME
    );
    expect(summary.total).toBe(305);
    expect(summary.expenseCount).toBe(2);
    expect(summary.average).toBe(152.5);
    expect(summary.largest).toEqual({ description: 'Flights', amount: 300 });
  });

  it('reports the largest by the user share, not by the expense face value', () => {
    const summary = summarizeSpend(
      [
        // Face value 1000 but the user only bears 10.
        expense({ description: 'Group villa', amount: 1000, splitWith: [{ userId: ME, amount: 10 }] }),
        expense({ description: 'Lunch', amount: 40, splitWith: [{ userId: ME, amount: 40 }] }),
      ],
      ME
    );
    expect(summary.largest).toEqual({ description: 'Lunch', amount: 40 });
  });

  it('is zeroed and null-safe with no qualifying expenses', () => {
    expect(summarizeSpend([], ME)).toEqual({
      total: 0,
      expenseCount: 0,
      average: 0,
      largest: null,
    });
  });
});

describe('category labels', () => {
  it('labels every real category and excludes settlement from the list', () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(10);
    expect(EXPENSE_CATEGORIES).not.toContain('settlement');
    for (const category of EXPENSE_CATEGORIES) {
      expect(categoryLabel(category)).toBeTruthy();
    }
  });

  it('still labels settlement, since old rows carry it', () => {
    expect(categoryLabel('settlement')).toBe('Settlement');
  });

  it('falls back rather than rendering undefined for an unknown category', () => {
    expect(categoryLabel('nonsense' as ExpenseCategory)).toBe('Other');
  });
});
