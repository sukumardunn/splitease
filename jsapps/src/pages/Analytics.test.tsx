/**
 * Phase 6: the Analytics page.
 *
 * The aggregation math is covered in `services/analytics.test.ts`; these tests
 * cover what the page is responsible for — that it reports the user's *share*
 * rather than expense face value, that the period filter and the table toggle
 * actually change what's rendered, and that each card degrades to a sensible
 * empty state instead of an axis with nothing on it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Expense, Friend, User } from '../types';

const ME: User = { id: 'me', name: 'Me', email: 'me@example.com', avatar: 'a.png' };

let expenses: Expense[] = [];
let balances: { friend: Friend; balance: number }[] = [];

vi.mock('../context/AppContext', () => ({
  useAppContext: () => ({
    expenses,
    currentUser: ME,
    getBalances: () => balances,
  }),
}));

import Analytics from './Analytics';

function friend(id: string, name: string): Friend {
  return { id, name, email: `${id}@example.com`, avatar: 'a.png' };
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    description: 'Thing',
    amount: 100,
    paidBy: ME.id,
    splitWith: [
      { userId: ME.id, amount: 50 },
      { userId: 'alice', amount: 50 },
    ],
    date: '2026-07-10T12:00:00.000Z',
    category: 'dining',
    currency: 'USD',
    groupId: null,
    deletedAt: null,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Analytics />
    </MemoryRouter>
  );
}

/** A stat tile, by its label — the same figure can appear in several tiles. */
const tile = (label: string) => within(screen.getByRole('group', { name: label }));

/** A chart card, by its heading. */
const card = (name: string) => within(screen.getByRole('region', { name }));

beforeEach(() => {
  expenses = [];
  balances = [];
  // The page pins `new Date()` at mount; freeze it so the trailing windows and
  // period cutoffs are the same on every machine and in every month.
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Analytics empty state', () => {
  it('offers a way forward when there are no expenses at all', () => {
    renderPage();
    expect(screen.getByText('Nothing to chart yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to expenses/i })).toHaveAttribute(
      'href',
      '/expenses'
    );
    // No stat tiles or charts should render in this state.
    expect(screen.queryByText('Your spend')).not.toBeInTheDocument();
  });
});

describe('Analytics headline figures', () => {
  it("reports the user's own share, not the expense face value", () => {
    // $100 expense, split evenly => the user's spend is $50, not $100.
    expenses = [expense({ amount: 100 })];
    renderPage();
    expect(tile('Your spend').getByText('$50.00')).toBeInTheDocument();
    expect(screen.queryByText('$100.00')).not.toBeInTheDocument();
  });

  it('counts expenses, averages them, and names the largest by share', () => {
    expenses = [
      expense({ description: 'Coffee', splitWith: [{ userId: ME.id, amount: 5 }] }),
      expense({ description: 'Flights', splitWith: [{ userId: ME.id, amount: 305 }] }),
    ];
    renderPage();
    expect(tile('Your spend').getByText('$310.00')).toBeInTheDocument();
    expect(tile('Expenses').getByText('2')).toBeInTheDocument();
    expect(tile('Average').getByText('$155.00')).toBeInTheDocument();
    expect(tile('Largest').getByText('$305.00')).toBeInTheDocument();
    expect(tile('Largest').getByText('Flights')).toBeInTheDocument();
  });

  it('excludes expenses the user bears no share of', () => {
    expenses = [
      expense({ description: 'For Alice only', splitWith: [{ userId: 'alice', amount: 80 }] }),
    ];
    renderPage();
    // The page renders (there IS an expense) but nothing counts as the user's spend.
    expect(screen.getByText(/no spending in/i)).toBeInTheDocument();
  });
});

describe('Analytics category breakdown', () => {
  it('ranks categories by the user share and shows a share-of-total percentage', () => {
    expenses = [
      expense({ category: 'rent', splitWith: [{ userId: ME.id, amount: 750 }] }),
      expense({ category: 'dining', splitWith: [{ userId: ME.id, amount: 250 }] }),
    ];
    renderPage();
    const categoryCard = card('Spending by category');
    expect(categoryCard.getByText('Rent')).toBeInTheDocument();
    expect(categoryCard.getByText('$750.00')).toBeInTheDocument();
    expect(categoryCard.getByText('75%')).toBeInTheDocument();
    expect(categoryCard.getByText('25%')).toBeInTheDocument();
  });

  it('does not count settlements as spending', () => {
    expenses = [
      expense({ category: 'settlement', splitWith: [{ userId: ME.id, amount: 500 }] }),
    ];
    renderPage();
    expect(screen.getByText(/no spending in/i)).toBeInTheDocument();
    expect(screen.queryByText('$500.00')).not.toBeInTheDocument();
  });
});

describe('Analytics period filter', () => {
  it('narrows the figures to the selected window', () => {
    expenses = [
      expense({ date: '2026-07-20T12:00:00.000Z', splitWith: [{ userId: ME.id, amount: 10 }] }),
      expense({ date: '2026-02-01T12:00:00.000Z', splitWith: [{ userId: ME.id, amount: 900 }] }),
    ];
    renderPage();

    // Default is 90 days: the February expense is already out.
    expect(tile('Your spend').getByText('$10.00')).toBeInTheDocument();
    expect(tile('Expenses').getByText('1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Time period'), { target: { value: 'all' } });
    expect(tile('Your spend').getByText('$910.00')).toBeInTheDocument();
    expect(tile('Expenses').getByText('2')).toBeInTheDocument();
  });
});

describe('Analytics table view', () => {
  it('swaps the charts for real tables carrying the same numbers', () => {
    expenses = [expense({ category: 'rent', splitWith: [{ userId: ME.id, amount: 400 }] })];
    balances = [{ friend: friend('alice', 'Alice'), balance: 25 }];
    renderPage();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(3); // category, monthly, balances
    expect(within(tables[0]).getByText('Rent')).toBeInTheDocument();
    expect(within(tables[0]).getByRole('columnheader', { name: 'Your share' })).toBeInTheDocument();
    expect(within(tables[2]).getByText('Alice')).toBeInTheDocument();

    // Toggling back returns to the charts.
    fireEvent.click(screen.getByRole('button', { name: 'Charts' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Analytics balances card', () => {
  it('labels both poles and signs each value', () => {
    expenses = [expense()];
    balances = [
      { friend: friend('alice', 'Alice'), balance: 40 },
      { friend: friend('bob', 'Bob'), balance: -15 },
    ];
    renderPage();
    expect(screen.getByText('Owed to you')).toBeInTheDocument();
    expect(screen.getByText('You owe')).toBeInTheDocument();
    // Sign is a second channel alongside hue and bar direction.
    expect(screen.getByText('+$40.00')).toBeInTheDocument();
    expect(screen.getByText('−$15.00')).toBeInTheDocument();
  });

  it('says so when everyone is settled instead of drawing empty bars', () => {
    expenses = [expense()];
    balances = [{ friend: friend('alice', 'Alice'), balance: 0 }];
    renderPage();
    expect(screen.getByText('All settled up with everyone.')).toBeInTheDocument();
  });

  it('prompts to add a friend when there are none', () => {
    expenses = [expense()];
    balances = [];
    renderPage();
    expect(screen.getByText(/no friends yet/i)).toBeInTheDocument();
  });
});
