import React from 'react';
import { formatCurrency } from '../../utils/helpers';
import { OWED_MARK, OWE_MARK, AXIS, barPercent } from './chartTokens';

export interface BalanceRow {
  id: string;
  name: string;
  /** Positive: they owe you. Negative: you owe them. */
  balance: number;
}

interface BalanceBarsProps {
  rows: BalanceRow[];
}

/**
 * Diverging bar chart of per-friend net balances, centered on zero.
 *
 * Diverging because the data's job is polarity, not magnitude: "who is a
 * creditor and who is a debtor" is the question, and a plain ranked bar chart
 * would bury the sign. Bars grow left for money you owe and right for money
 * owed to you.
 *
 * Polarity is encoded three ways — direction, hue, and the sign on the printed
 * value — so neither a colorblind reader nor a grayscale print loses it. See
 * `chartTokens.ts` for why the poles are teal/red and not the green/red used in
 * body text elsewhere in the app.
 */
const BalanceBars: React.FC<BalanceBarsProps> = ({ rows }) => {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.balance)), 0);

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${OWED_MARK}`} aria-hidden="true" />
          Owed to you
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${OWE_MARK}`} aria-hidden="true" />
          You owe
        </span>
      </div>

      <ul className="space-y-2.5">
        {rows.map((row) => {
          const owed = row.balance > 0;
          const extent = barPercent(row.balance, max);
          return (
            <li key={row.id} className="flex items-center gap-3">
              <span className="w-24 sm:w-32 flex-shrink-0 text-sm text-gray-700 truncate">
                {row.name}
              </span>

              <div className="relative flex-1 flex h-4 items-center">
                {/* Zero axis, sitting between the two arms. */}
                <div
                  className={`absolute left-1/2 top-0 bottom-0 w-px ${AXIS}`}
                  aria-hidden="true"
                />
                <div className="w-1/2 flex justify-end pr-px">
                  {!owed && row.balance !== 0 && (
                    <div
                      className={`h-2.5 rounded-l ${OWE_MARK}`}
                      style={{ width: `${extent}%` }}
                    />
                  )}
                </div>
                <div className="w-1/2 flex justify-start pl-px">
                  {owed && (
                    <div
                      className={`h-2.5 rounded-r ${OWED_MARK}`}
                      style={{ width: `${extent}%` }}
                    />
                  )}
                </div>
              </div>

              <span
                className={`w-20 flex-shrink-0 text-right text-sm font-medium tabular-nums ${
                  row.balance === 0
                    ? 'text-gray-400'
                    : owed
                      ? 'text-teal-700'
                      : 'text-red-700'
                }`}
              >
                {row.balance === 0
                  ? formatCurrency(0)
                  : `${owed ? '+' : '−'}${formatCurrency(Math.abs(row.balance))}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default BalanceBars;
