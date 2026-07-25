import React from 'react';
import { CategorySlice, categoryTotal, percentageShares } from '../../services/analytics';
import { formatCurrency } from '../../utils/helpers';
import { SPEND_MARK, TRACK, barPercent } from './chartTokens';

interface CategoryBarsProps {
  slices: CategorySlice[];
}

/**
 * Ranked horizontal bar list of spend per category.
 *
 * Horizontal because category names are long — rotated x-axis labels are the
 * thing this form exists to avoid. Single series, so no legend: the card title
 * names the measure. Every value is directly labeled, which makes this readable
 * without hover and gives screen readers the numbers as ordinary text.
 */
const CategoryBars: React.FC<CategoryBarsProps> = ({ slices }) => {
  const max = slices.length > 0 ? slices[0].total : 0;
  // The denominator is derived from the slices, never passed in. A caller-
  // supplied total (this card used to take `summarizeSpend().total`) is a second
  // independently computed aggregate: if it ever drifts from the slices, the
  // percentages stop summing to 100 and nothing in the rendered card reveals it.
  //
  // So the percentages mean **share of the categories shown in this card**.
  // Today that is identical to the period's total spend, because every expense
  // that counts as spending falls in exactly one category — see `categoryTotal`
  // for why the two aggregates cannot diverge. If this card is ever handed a
  // subset of the breakdown (a category filter, a top-N cut), the identity
  // breaks and the column means share-of-shown: relabel the card, don't restore
  // a second aggregate.
  const total = categoryTotal(slices);
  // Apportioned across the whole column rather than rounded row by row, so the
  // percentages sum to 100 instead of to 99 or 101. Index-aligned with
  // `slices`, which `totalsByCategory` already orders stably.
  const percentages = percentageShares(
    slices.map((slice) => slice.total),
    total
  );

  return (
    <ul className="space-y-3">
      {slices.map((slice, i) => (
        <li key={slice.category}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-sm text-gray-700 truncate">{slice.label}</span>
            <span className="text-sm font-medium text-gray-900 tabular-nums flex-shrink-0">
              {formatCurrency(slice.total)}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {percentages[i]}%
              </span>
            </span>
          </div>
          <div className={`h-2 w-full rounded ${TRACK} overflow-hidden`}>
            <div
              className={`h-full rounded ${SPEND_MARK}`}
              style={{ width: `${barPercent(slice.total, max)}%` }}
              title={`${slice.label}: ${formatCurrency(slice.total)} across ${
                slice.count
              } ${slice.count === 1 ? 'expense' : 'expenses'}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

export default CategoryBars;
