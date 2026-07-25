import React, { useState } from 'react';
import { MonthSlice } from '../../services/analytics';
import { formatCurrency } from '../../utils/helpers';
import { SPEND_MARK, GRIDLINE, AXIS, barPercent } from './chartTokens';

interface MonthlyTrendProps {
  months: MonthSlice[];
}

const PLOT_HEIGHT = 'h-40';

/**
 * Column chart of spend per month over a trailing window.
 *
 * Columns rather than a line: the buckets are discrete months, and a line would
 * imply continuous change between them. Single series, so one flat hue and no
 * legend.
 *
 * This is the one chart here without per-mark value labels — twelve of them
 * would collide — so it carries the hover layer instead, plus an `sr-only`
 * reading of every bucket so the data is never hover-only.
 */
const MonthlyTrend: React.FC<MonthlyTrendProps> = ({ months }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = months.reduce((m, s) => Math.max(m, s.total), 0);

  return (
    <div>
      {/* Max gridline, labeled once — a full grid would out-shout the data. */}
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-gray-500 tabular-nums w-14 flex-shrink-0 text-right">
            {max > 0 ? formatCurrency(max) : ''}
          </span>
          <div className={`h-px flex-1 ${GRIDLINE}`} />
        </div>

        <div className="flex items-stretch gap-2">
          <div className="w-14 flex-shrink-0" aria-hidden="true" />
          <div className={`flex-1 flex items-end gap-0.5 ${PLOT_HEIGHT}`}>
            {months.map((slice) => (
              <div
                key={slice.key}
                className="relative flex-1 flex items-end justify-center h-full"
                onMouseEnter={() => setHovered(slice.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(slice.key)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
              >
                {hovered === slice.key && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg pointer-events-none">
                    <span className="font-medium">{formatCurrency(slice.total)}</span>
                    <span className="text-gray-300">
                      {' · '}
                      {slice.count} {slice.count === 1 ? 'expense' : 'expenses'}
                    </span>
                  </div>
                )}
                <div
                  className={`w-full rounded-t ${SPEND_MARK} transition-opacity ${
                    hovered && hovered !== slice.key ? 'opacity-60' : ''
                  }`}
                  style={{ height: `${barPercent(slice.total, max)}%` }}
                />
                <span className="sr-only">
                  {slice.label}: {formatCurrency(slice.total)} across {slice.count}{' '}
                  {slice.count === 1 ? 'expense' : 'expenses'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Zero baseline */}
        <div className="flex items-center gap-2">
          <div className="w-14 flex-shrink-0" aria-hidden="true" />
          <div className={`h-px flex-1 ${AXIS}`} />
        </div>

        <div className="flex items-start gap-2 mt-1">
          <div className="w-14 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 flex gap-0.5">
            {months.map((slice) => (
              <span
                key={slice.key}
                className="flex-1 text-center text-[10px] leading-tight text-gray-500 truncate"
              >
                {slice.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyTrend;
