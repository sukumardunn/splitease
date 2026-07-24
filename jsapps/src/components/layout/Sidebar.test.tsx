/**
 * Phase 4b: the sidebar's "Overall Balance" card used to render a hardcoded
 * $355.00 regardless of state. These tests pin it to real balances.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Friend } from '../../types';

const balances: { friend: Friend; balance: number }[] = [];

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ getBalances: () => balances }),
}));

import Sidebar from './Sidebar';

function friend(id: string): Friend {
  return { id, name: id, email: `${id}@example.com`, avatar: 'a.png' };
}

function renderSidebar(entries: { friend: Friend; balance: number }[]) {
  balances.length = 0;
  balances.push(...entries);
  return render(
    // Opt into the v7 behaviours the router otherwise warns about, so this
    // suite doesn't reintroduce the stderr noise Phase 4b cleaned up.
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Sidebar />
    </MemoryRouter>
  );
}

beforeEach(() => {
  balances.length = 0;
});

describe('Sidebar overall balance', () => {
  it('sums what friends owe the user', () => {
    renderSidebar([
      { friend: friend('a'), balance: 30 },
      { friend: friend('b'), balance: 12.5 },
    ]);
    expect(screen.getByText('You are owed')).toBeInTheDocument();
    expect(screen.getByText('$42.50')).toBeInTheDocument();
    expect(screen.queryByText('You owe')).not.toBeInTheDocument();
  });

  it('sums what the user owes friends', () => {
    renderSidebar([{ friend: friend('a'), balance: -18.75 }]);
    expect(screen.getByText('You owe')).toBeInTheDocument();
    expect(screen.getByText('$18.75')).toBeInTheDocument();
    expect(screen.queryByText('You are owed')).not.toBeInTheDocument();
  });

  it('shows both sides when the user is owed and owes', () => {
    renderSidebar([
      { friend: friend('a'), balance: 50 },
      { friend: friend('b'), balance: -20 },
    ]);
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  it('shows the settled-up state instead of a zero amount', () => {
    renderSidebar([{ friend: friend('a'), balance: 0 }]);
    expect(screen.getByText(/all settled up/i)).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('shows the settled-up state when there are no friends at all', () => {
    renderSidebar([]);
    expect(screen.getByText(/all settled up/i)).toBeInTheDocument();
  });

  it('never renders the old hardcoded placeholder', () => {
    renderSidebar([{ friend: friend('a'), balance: 7 }]);
    expect(screen.queryByText('$355.00')).not.toBeInTheDocument();
  });
});
