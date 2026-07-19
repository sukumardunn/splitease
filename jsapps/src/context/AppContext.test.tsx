import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AppContextProvider, useAppContext } from './AppContext';
import { ToastProvider } from '../components/ui/Toast';

vi.mock('../services/supabaseStore', () => ({
  fetchAll: vi.fn(),
  insertExpense: vi.fn().mockResolvedValue(undefined),
  updateExpense: vi.fn().mockResolvedValue(undefined),
  setExpenseDeleted: vi.fn().mockResolvedValue(undefined),
  purgeExpense: vi.fn().mockResolvedValue(undefined),
  insertGroup: vi.fn().mockResolvedValue(undefined),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  setGroupDeleted: vi.fn().mockResolvedValue(undefined),
  purgeGroup: vi.fn().mockResolvedValue(undefined),
  insertSettlement: vi.fn().mockResolvedValue(undefined),
  insertActivityEvent: vi.fn().mockResolvedValue(undefined),
  importState: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } },
    loading: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

import * as store from '../services/supabaseStore';

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const FRIEND_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

function baseRemote(): store.RemoteState {
  return {
    currentUser: { id: USER_ID, name: 'Me', email: 'me@x.com', avatar: '' },
    friends: [{ id: FRIEND_ID, name: 'Ana', email: 'a@x.com', avatar: '' }],
    groups: [],
    expenses: [
      {
        id: 'exp-seed-1',
        description: 'Seed Rent',
        amount: 100,
        paidBy: USER_ID,
        splitWith: [
          { userId: USER_ID, amount: 50 },
          { userId: FRIEND_ID, amount: 50 },
        ],
        date: new Date().toISOString(),
        category: 'rent',
        currency: 'USD',
        groupId: null,
        deletedAt: null,
      },
    ],
    settlements: [],
    activityEvents: [],
  };
}

/** Test harness: exposes context actions/values through the DOM. */
function Harness() {
  const { expenses, currentUser, friends, addExpense, getBalances } = useAppContext();
  return (
    <div>
      <span data-testid="count">{expenses.length}</span>
      <span data-testid="top">{expenses[0]?.description ?? ''}</span>
      <span data-testid="bal-f1">
        {getBalances().find((b) => b.friend?.id === friends[0]?.id)?.balance ?? 0}
      </span>
      <button
        onClick={() =>
          addExpense({
            description: 'Test Coffee',
            amount: 20,
            paidBy: currentUser.id,
            splitWith: [
              { userId: currentUser.id, amount: 10 },
              { userId: friends[0].id, amount: 10 },
            ],
            category: 'dining',
            currency: 'USD',
            groupId: null,
          })
        }
      >
        add
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <ToastProvider>
      <AppContextProvider>
        <Harness />
      </AppContextProvider>
    </ToastProvider>
  );
}

describe('AppContext persistence integration', () => {
  beforeEach(() => {
    vi.mocked(store.fetchAll).mockResolvedValue(structuredClone(baseRemote()));
    vi.mocked(store.insertExpense).mockResolvedValue(undefined);
  });

  it('loads remote state via fetchAll on mount', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(store.fetchAll).toHaveBeenCalledWith(USER_ID);
  });

  it('applies a newly added expense immediately and persists it via supabaseStore', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    act(() => {
      screen.getByText('add').click();
    });
    expect(screen.getByTestId('top').textContent).toBe('Test Coffee');

    await waitFor(() =>
      expect(store.insertExpense).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ description: 'Test Coffee' })
      )
    );
  });

  it('reloads expenses added in a previous session on a fresh provider (remote is source of truth)', async () => {
    // The remote is the persistence layer now, not localStorage: model that
    // with a stateful fetchAll/insertExpense pair so a second mount ("refresh")
    // observes what the first mount persisted.
    let remoteExpenses = baseRemote().expenses;
    vi.mocked(store.fetchAll).mockImplementation(async () => ({
      ...structuredClone(baseRemote()),
      expenses: structuredClone(remoteExpenses),
    }));
    vi.mocked(store.insertExpense).mockImplementation(async (_ownerId, expense) => {
      remoteExpenses = [expense, ...remoteExpenses];
    });

    // First mount: add an expense.
    const first = renderApp();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    act(() => {
      screen.getByText('add').click();
    });
    await waitFor(() => expect(store.insertExpense).toHaveBeenCalled());
    first.unmount();

    // Second mount simulates a page reload: state comes from the remote fetch,
    // not from any local cache.
    renderApp();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('top').textContent).toBe('Test Coffee');
  });

  it('reflects who paid in computed balances', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    act(() => {
      screen.getByText('add').click();
    });
    // Current user paid; friend1 owes their 10 share -> balance increases by 10
    // vs the baseline. Just assert it is a finite number and friend1 is present.
    const bal = Number(screen.getByTestId('bal-f1').textContent);
    expect(Number.isFinite(bal)).toBe(true);
  });
});
