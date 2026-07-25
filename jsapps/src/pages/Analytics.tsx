import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Table2, LineChart, Users, Receipt } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  filterByPeriod,
  totalsByCategory,
  totalsByMonth,
  summarizeSpend,
  PERIODS,
  Period,
} from '../services/analytics';
import { formatCurrency } from '../utils/helpers';
import CategoryBars from '../components/analytics/CategoryBars';
import MonthlyTrend from '../components/analytics/MonthlyTrend';
import BalanceBars, { BalanceRow } from '../components/analytics/BalanceBars';

/** Trailing window for the monthly trend, independent of the period filter. */
const TREND_MONTHS = 12;

const Card: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, children }) => (
  // A named region per card, so each chart is individually addressable by
  // assistive tech (and by tests) rather than being one undifferentiated blob.
  <section aria-label={title} className="bg-white rounded-xl shadow-sm overflow-hidden">
    <div className="p-6">
      <div className="flex items-start gap-3 mb-4">
        <Icon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-gray-800 leading-tight">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  </section>
);

const StatTile: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div role="group" aria-label={label} className="bg-white rounded-xl shadow-sm p-4">
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
    <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-gray-500 truncate">{hint}</p>}
  </div>
);

const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-gray-500 py-6 text-center">{children}</p>
);

/**
 * Analytics (Phase 6).
 *
 * Every spend figure on this page is **the current user's own share**, not the
 * face value of the expenses — see the header comment in `services/analytics.ts`.
 * The card subtitles say so, because a page of totals that silently means
 * something else is worse than no page.
 *
 * All aggregation lives in `services/analytics.ts` (pure and unit-tested); this
 * file only chooses forms and wires state. Charts are hand-rolled HTML rather
 * than a charting dependency — the repo deliberately runs on five runtime deps.
 */
const Analytics: React.FC = () => {
  const { expenses, currentUser, getBalances } = useAppContext();
  const [period, setPeriod] = useState<Period>('90d');
  const [showTable, setShowTable] = useState(false);

  // Pinned once per mount: a fresh `new Date()` on every render would make the
  // memos below recompute forever.
  const now = useMemo(() => new Date(), []);

  const periodExpenses = useMemo(
    () => filterByPeriod(expenses, period, now),
    [expenses, period, now]
  );
  const categories = useMemo(
    () => totalsByCategory(periodExpenses, currentUser.id),
    [periodExpenses, currentUser.id]
  );
  const summary = useMemo(
    () => summarizeSpend(periodExpenses, currentUser.id),
    [periodExpenses, currentUser.id]
  );
  const months = useMemo(
    () => totalsByMonth(expenses, currentUser.id, TREND_MONTHS, now),
    [expenses, currentUser.id, now]
  );

  const balanceRows: BalanceRow[] = useMemo(
    () =>
      getBalances()
        .map(({ friend, balance }) => ({ id: friend.id, name: friend.name, balance }))
        .sort((a, b) => b.balance - a.balance),
    [getBalances]
  );

  const periodLabel =
    PERIODS.find((p) => p.value === period)?.label.toLowerCase() ?? 'the period';
  const hasSpend = summary.expenseCount > 0;
  const nonZeroBalances = balanceRows.filter((r) => r.balance !== 0);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>

        {/* Filters in one row above the charts. */}
        <div className="flex items-center gap-2">
          <label htmlFor="analytics-period" className="sr-only">
            Time period
          </label>
          <select
            id="analytics-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="text-sm border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {showTable ? (
              <BarChart3 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Table2 className="w-4 h-4" aria-hidden="true" />
            )}
            {showTable ? 'Charts' : 'Table'}
          </button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center">
          <Receipt className="w-8 h-8 text-gray-300 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-gray-800">Nothing to chart yet</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add an expense — or import your Splitwise history — and your spending
            breakdown will show up here.
          </p>
          <Link
            to="/expenses"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Go to Expenses
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Your spend"
              value={formatCurrency(summary.total)}
              hint={periodLabel}
            />
            <StatTile
              label="Expenses"
              value={String(summary.expenseCount)}
              hint={periodLabel}
            />
            <StatTile
              label="Average"
              value={formatCurrency(summary.average)}
              hint="per expense"
            />
            <StatTile
              label="Largest"
              value={summary.largest ? formatCurrency(summary.largest.amount) : '—'}
              hint={summary.largest?.description}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card
              title="Spending by category"
              subtitle={`Your share, ${periodLabel}`}
              icon={BarChart3}
            >
              {!hasSpend ? (
                <EmptyNote>No spending in {periodLabel}.</EmptyNote>
              ) : showTable ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th scope="col" className="py-2 font-medium">Category</th>
                      <th scope="col" className="py-2 font-medium text-right">Expenses</th>
                      <th scope="col" className="py-2 font-medium text-right">Your share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {categories.map((slice) => (
                      <tr key={slice.category}>
                        <td className="py-2 text-gray-700">{slice.label}</td>
                        <td className="py-2 text-right text-gray-500 tabular-nums">
                          {slice.count}
                        </td>
                        <td className="py-2 text-right text-gray-900 font-medium tabular-nums">
                          {formatCurrency(slice.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                /* `CategoryBars` derives its own percentage denominator by
                   summing these slices — deliberately not `summary.total`, so
                   the card cannot print percentages that disagree with the
                   dollar figures beside them. */
                <CategoryBars slices={categories} />
              )}
            </Card>

            <Card
              title="Monthly spend"
              subtitle={`Your share, last ${TREND_MONTHS} months — not affected by the filter`}
              icon={LineChart}
            >
              {showTable ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th scope="col" className="py-2 font-medium">Month</th>
                      <th scope="col" className="py-2 font-medium text-right">Expenses</th>
                      <th scope="col" className="py-2 font-medium text-right">Your share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {months.map((slice) => (
                      <tr key={slice.key}>
                        <td className="py-2 text-gray-700">{slice.key}</td>
                        <td className="py-2 text-right text-gray-500 tabular-nums">
                          {slice.count}
                        </td>
                        <td className="py-2 text-right text-gray-900 font-medium tabular-nums">
                          {formatCurrency(slice.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <MonthlyTrend months={months} />
              )}
            </Card>

            <Card
              title="Who owes whom"
              subtitle="Net balance per person, all time"
              icon={Users}
            >
              {balanceRows.length === 0 ? (
                <EmptyNote>
                  No friends yet — add someone to split with and their balance will
                  appear here.
                </EmptyNote>
              ) : nonZeroBalances.length === 0 ? (
                <EmptyNote>All settled up with everyone.</EmptyNote>
              ) : showTable ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th scope="col" className="py-2 font-medium">Person</th>
                      <th scope="col" className="py-2 font-medium text-right">Net balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {balanceRows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 text-gray-700">{row.name}</td>
                        <td className="py-2 text-right font-medium tabular-nums text-gray-900">
                          {row.balance === 0
                            ? formatCurrency(0)
                            : `${row.balance > 0 ? '+' : '−'}${formatCurrency(
                                Math.abs(row.balance)
                              )}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <BalanceBars rows={balanceRows} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
