import React from 'react';
import { CategorySlice, percentageShares } from '../../services/analytics';
import { formatCurrency } from '../../utils/helpers';
import { SPEND_MARK, TRACK, barPercent } from './chartTokens';

interface CategoryBarsProps {
  slices: CategorySlice[];
  /** Sum of all slices, used for the share-of-total column. */
  total: number;
}

/**
 * Ranked horizontal bar list of spend per category.
 *
 * Horizontal because category names are long — rotated x-axis labels are the
 * thing this form exists to avoid. Single series, so no legend: the card title
 * names the measure. Every value is directly labeled, which makes this readable
 * without hover and gives screen readers the numbers as ordinary text.
 */
const CategoryBars: React.FC<CategoryBarsProps> = ({ slices, total }) => {
  const max = slices.length > 0 ? slices[0].total : 0;
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
