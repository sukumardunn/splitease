/**
 * Phase 6A follow-up: the category breakdown used to print percentages that
 * summed to 99 or 101, because each row rounded its own share in isolation.
 *
 * `percentageShares` is unit-tested in `services/analytics.test.ts`; these tests
 * pin the *rendered* column, which is the thing a reader actually adds up, and
 * guard the invariant that only the percentages were re-apportioned — the dollar
 * figures beside them are exact and must not move.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CategoryBars from './CategoryBars';
import { CategorySlice } from '../../services/analytics';

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

describe('CategoryBars percentage column', () => {
  it('prints percentages that sum to exactly 100', () => {
    // Thirds: three rows that each round to 33% and used to print 99%.
    const slices = [
      slice({ category: 'rent', label: 'Rent', total: 10 }),
      slice({ category: 'dining', label: 'Dining', total: 10 }),
      slice({ category: 'travel', label: 'Travel', total: 10 }),
    ];
    const { container } = render(<CategoryBars slices={slices} total={30} />);
    const percents = renderedPercents(container);
    expect(percents).toEqual([34, 33, 33]);
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('leaves the dollar figures exactly as given while re-apportioning percents', () => {
    const slices = [
      slice({ category: 'rent', label: 'Rent', total: 899.99 }),
      slice({ category: 'dining', label: 'Dining', total: 137.41 }),
      slice({ category: 'travel', label: 'Travel', total: 61.33 }),
    ];
    const { container } = render(<CategoryBars slices={slices} total={1098.73} />);
    expect(renderedPercents(container).reduce((a, b) => a + b, 0)).toBe(100);
    expect(screen.getByText(/899\.99/)).toBeInTheDocument();
    expect(screen.getByText(/137\.41/)).toBeInTheDocument();
    expect(screen.getByText(/61\.33/)).toBeInTheDocument();
  });

  it('gives a lone category 100%', () => {
    const { container } = render(
      <CategoryBars slices={[slice({ total: 42.5 })]} total={42.5} />
    );
    expect(renderedPercents(container)).toEqual([100]);
  });

  it('renders 0%, not NaN%, when there is no spend', () => {
    const { container } = render(
      <CategoryBars slices={[slice({ total: 0 })]} total={0} />
    );
    expect(renderedPercents(container)).toEqual([0]);
    expect(container.textContent).not.toContain('NaN');
  });

  it('renders nothing at all for an empty breakdown', () => {
    const { container } = render(<CategoryBars slices={[]} total={0} />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('keeps the percentage aligned with its own row after a re-render', () => {
    // Percentages are computed as one array and read by index, so a stale index
    // would silently attach a number to the wrong category.
    const slices = [
      slice({ category: 'rent', label: 'Rent', total: 200 }),
      slice({ category: 'dining', label: 'Dining', total: 100 }),
    ];
    const { container, rerender } = render(
      <CategoryBars slices={slices} total={300} />
    );
    const first = renderedPercents(container);
    expect(first).toEqual([67, 33]);
    rerender(<CategoryBars slices={slices} total={300} />);
    expect(renderedPercents(container)).toEqual(first);

    const rows = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(rows[0]).toContain('Rent');
    expect(rows[0]).toContain('67%');
    expect(rows[1]).toContain('Dining');
    expect(rows[1]).toContain('33%');
  });
});
