/**
 * Phase 6A follow-up: the category breakdown used to print percentages that
 * summed to 99 or 101, because each row rounded its own share in isolation.
 *
 * `percentageShares` is unit-tested in `services/analytics.test.ts`; these tests
 * pin the *rendered* column, which is the thing a reader actually adds up, and
 * guard the invariant that only the percentages were re-apportioned — the dollar
 * figures beside them are exact and must not move.
 *
 * They also pin the fix for the follow-on hazard: the card no longer accepts a
 * `total` prop. Its denominator is the sum of the slices it was handed, so the
 * percentages are shares of what is on screen by construction and cannot be
 * knocked out of sync by a second aggregate computed elsewhere.
 */
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import CategoryBars from './CategoryBars';
import { CategorySlice, EXPENSE_CATEGORIES } from '../../services/analytics';

function slice(over: Partial<CategorySlice> = {}): CategorySlice {
  return { category: 'dining', label: 'Dining', total: 10, count: 1, ...over };
}

/** Every `NN%` label in the rendered card, in document order. */
function renderedPercents(container: HTMLElement): number[] {
  return [...container.querySelectorAll('span')]
    .map((el) => el.textContent ?? '')
    .filter((text) => /^\d+%$/.test(text))
    .map((text) => parseInt(text, 10));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('CategoryBars percentage column', () => {
  it('prints percentages that sum to exactly 100', () => {
    // Thirds: three rows that each round to 33% and used to print 99%.
    const slices = [
      slice({ category: 'rent', label: 'Rent', total: 10 }),
      slice({ category: 'dining', label: 'Dining', total: 10 }),
      slice({ category: 'travel', label: 'Travel', total: 10 }),
    ];
    const { container } = render(<CategoryBars slices={slices} />);
    const percents = renderedPercents(container);
    expect(percents).toEqual([34, 33, 33]);
    expect(sum(percents)).toBe(100);
  });

  it('leaves the dollar figures exactly as given while re-apportioning percents', () => {
    const slices = [
      slice({ category: 'rent', label: 'Rent', total: 899.99 }),
      slice({ category: 'dining', label: 'Dining', total: 137.41 }),
      slice({ category: 'travel', label: 'Travel', total: 61.33 }),
    ];
    const { container } = render(<CategoryBars slices={slices} />);
    expect(sum(renderedPercents(container))).toBe(100);
    expect(screen.getByText(/899\.99/)).toBeInTheDocument();
    expect(screen.getByText(/137\.41/)).toBeInTheDocument();
    expect(screen.getByText(/61\.33/)).toBeInTheDocument();
  });

  it('gives a lone category 100%', () => {
    const { container } = render(<CategoryBars slices={[slice({ total: 42.5 })]} />);
    expect(renderedPercents(container)).toEqual([100]);
  });

  it('renders 0%, not NaN%, when there is no spend', () => {
    const { container } = render(<CategoryBars slices={[slice({ total: 0 })]} />);
    expect(renderedPercents(container)).toEqual([0]);
    expect(container.textContent).not.toContain('NaN');
  });

  it('renders nothing at all for an empty breakdown', () => {
    const { container } = render(<CategoryBars slices={[]} />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('keeps the percentage aligned with its own row after a re-render', () => {
    // Percentages are computed as one array and read by index, so a stale index
    // would silently attach a number to the wrong category.
    const slices = [
      slice({ category: 'rent', label: 'Rent', total: 200 }),
      slice({ category: 'dining', label: 'Dining', total: 100 }),
    ];
    const { container, rerender } = render(<CategoryBars slices={slices} />);
    const first = renderedPercents(container);
    expect(first).toEqual([67, 33]);
    rerender(<CategoryBars slices={slices} />);
    expect(renderedPercents(container)).toEqual(first);

    const rows = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(rows[0]).toContain('Rent');
    expect(rows[0]).toContain('67%');
    expect(rows[1]).toContain('Dining');
    expect(rows[1]).toContain('33%');
  });
});

describe('CategoryBars denominator', () => {
  const slices = [
    slice({ category: 'rent', label: 'Rent', total: 899.99 }),
    slice({ category: 'groceries', label: 'Groceries', total: 212.07 }),
    slice({ category: 'dining', label: 'Dining', total: 137.41 }),
    slice({ category: 'travel', label: 'Travel', total: 61.33 }),
    slice({ category: 'utilities', label: 'Utilities', total: 7.5 }),
  ];

  it('ignores a caller-supplied total that disagrees with the slices', () => {
    // The regression this guards. The card used to take `total` from a second
    // aggregate (`summarizeSpend`) that walked the same list with the same
    // predicates — equal only by convention, with nothing enforcing it. Force a
    // wildly wrong total through anyway: the column must still sum to 100,
    // because the denominator now comes from the slices themselves. Passing this
    // prop is a type error, hence the cast; the cast IS the assertion that no
    // caller can reintroduce the hazard without deliberately defeating the type.
    const props = { slices, total: 12_345 } as unknown as ComponentProps<
      typeof CategoryBars
    >;
    const { container } = render(<CategoryBars {...props} />);
    expect(sum(renderedPercents(container))).toBe(100);
    // …and a stale denominator cannot bend an individual row either: these are
    // the shares of $1,318.30, the sum of the five slices.
    expect(renderedPercents(container)).toEqual([68, 16, 10, 5, 1]);
  });

  it('prints the same dollar figures whatever denominator a caller imagines', () => {
    // The figures are exact and belong to the slices; only the percentages were
    // ever a function of the denominator.
    const expected = ['$899.99', '$212.07', '$137.41', '$61.33', '$7.50'];
    const dollars = (container: HTMLElement) =>
      [...container.querySelectorAll('li')].map(
        (li) => (li.textContent ?? '').match(/\$[\d,]+\.\d{2}/)?.[0] ?? ''
      );

    const { container } = render(<CategoryBars slices={slices} />);
    expect(dollars(container)).toEqual(expected);

    const withStaleTotal = { slices, total: 1 } as unknown as ComponentProps<
      typeof CategoryBars
    >;
    const forced = render(<CategoryBars {...withStaleTotal} />);
    expect(dollars(forced.container)).toEqual(expected);
  });

  it('sums to 100 for any breakdown, since the denominator is the breakdown', () => {
    // Awkward totals across differing row counts: there is no input shape left
    // where the printed column can miss 100, because `values` sum to `total` by
    // construction.
    const cases = [[1], [1, 2], [0.01, 0.01, 0.01], [3.33, 3.33, 3.34], [1, 1, 1, 1, 1, 1, 1]];
    for (const totals of cases) {
      const { container, unmount } = render(
        <CategoryBars
          slices={totals.map((total, i) =>
            slice({ category: EXPENSE_CATEGORIES[i], label: EXPENSE_CATEGORIES[i], total })
          )}
        />
      );
      expect(sum(renderedPercents(container))).toBe(100);
      unmount();
    }
  });
});
