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

const REMOTE: store.RemoteState = {
  currentUser: { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Me', email: 'me@x.com', avatar: '' },
  friends: [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Ana', email: 'a@x.com', avatar: '' }],
  groups: [],
  expenses: [],
  settlements: [],
  activityEvents: [],
};

/**
 * Phase 2/3 behaviour: soft-delete + restore, append-only activity logging,
 * first-class settlements — exercised through real context. Phase 4a adds
 * optimistic-apply + rollback-on-persist-failure over the same context.
 */
function Harness() {
  const {
    expenses,
    deletedExpenses,
    activityEvents,
    settlements,
    currentUser,
    friends,
    addExpense,
    deleteExpense,
    restoreExpense,
    settleDebt,
  } = useAppContext();

  const newest = expenses[0];
  const newestDeleted = deletedExpenses[0];

  return (
    <div>
      <span data-testid="active">{expenses.length}</span>
      <span data-testid="deleted">{deletedExpenses.length}</span>
      <span data-testid="events">{activityEvents.length}</span>
      <span data-testid="settlements">{settlements.length}</span>
      <span data-testid="last">{activityEvents[0]?.action ?? ''}</span>
      <span data-testid="top">{newest?.description ?? ''}</span>
      <button
        data-testid="add"
        onClick={() =>
          addExpense({
            description: 'Coffee',
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
      <button data-testid="del" onClick={() => newest && deleteExpense(newest.id)}>
        del
      </button>
      <button
        data-testid="res"
        onClick={() => newestDeleted && restoreExpense(newestDeleted.id)}
      >
        res
      </button>
      <button
        data-testid="settle"
        onClick={() => settleDebt(friends[0].id, currentUser.id, 10)}
      >
        settle
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

/** Render and wait past the initial async `fetchAll` load (LoadingScreen). */
async function renderReady() {
  const utils = renderApp();
  await waitFor(() => expect(screen.getByTestId('active')).toBeTruthy());
  return utils;
}

const num = (id: string) => Number(screen.getByTestId(id).textContent);
const click = (id: string) => act(() => screen.getByTestId(id).click());

describe('AppContext Phase 2/3 behaviour', () => {
  beforeEach(() => {
    vi.mocked(store.fetchAll).mockResolvedValue(structuredClone(REMOTE));
  });

  it('soft-deletes and restores expenses, logging every mutation', async () => {
    await renderReady();
    const activeStart = num('active');
    expect(num('deleted')).toBe(0);
    expect(num('events')).toBe(0);

    click('add');
    expect(num('active')).toBe(activeStart + 1);
    expect(screen.getByTestId('last').textContent).toBe('expense.create');

    click('del'); // soft-delete the just-added (newest) expense
    expect(num('active')).toBe(activeStart);
    expect(num('deleted')).toBe(1);
    expect(screen.getByTestId('last').textContent).toBe('expense.delete');

    click('res'); // undo
    expect(num('active')).toBe(activeStart + 1);
    expect(num('deleted')).toBe(0);
    expect(screen.getByTestId('last').textContent).toBe('expense.restore');

    // Audit log is append-only: create + delete + restore = 3 events.
    expect(num('events')).toBe(3);
  });

  it('records settlements as first-class entries, not fake expenses', async () => {
    await renderReady();
    const activeStart = num('active');
    click('settle');
    expect(num('settlements')).toBe(1);
    expect(num('active')).toBe(activeStart); // no phantom expense created
    expect(screen.getByTestId('last').textContent).toBe('settlement.create');
  });

  it('applies addExpense optimistically, keeps it when persist succeeds', async () => {
    await renderReady();
    click('add');
    // Applied immediately, before the (mocked) persist promise has settled.
    expect(screen.getByTestId('top').textContent).toBe('Coffee');
    await waitFor(() => expect(store.insertExpense).toHaveBeenCalled());
    // ...and it stays, since persist resolved.
    expect(screen.getByTestId('top').textContent).toBe('Coffee');
    expect(num('active')).toBe(1);
  });

  it('rolls back the expense and shows a toast when persist rejects', async () => {
    vi.mocked(store.insertExpense).mockRejectedValueOnce(new Error('down'));
    await renderReady();
    click('add');
    // Applied optimistically first.
    expect(screen.getByTestId('top').textContent).toBe('Coffee');
    await waitFor(() => expect(num('active')).toBe(0));
    expect(screen.getByText(/Couldn.t save your change/)).toBeTruthy();
  });
});
