import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AppContextProvider, useAppContext } from './AppContext';
import { ToastProvider } from '../components/ui/Toast';
import { captureConsoleWarn } from '../test/console';

vi.mock('../services/supabaseStore', () => ({
  fetchAll: vi.fn(),
  insertFriend: vi.fn().mockResolvedValue(undefined),
  setFriendDeleted: vi.fn().mockResolvedValue(undefined),
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
// Mutable so a test can sign the user out mid-flight. `vi.hoisted` runs before
// the hoisted `vi.mock` factory, so the factory can safely close over it.
const authState = vi.hoisted(() => ({
  session: { user: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } } as {
    user: { id: string };
  } | null,
}));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    session: authState.session,
    loading: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock('../services/localStore', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/localStore')>();
  return { ...mod, loadState: vi.fn(), clearState: vi.fn() };
});

import * as store from '../services/supabaseStore';
import * as localStore from '../services/localStore';
import { AppState } from '../types';
import { IMPORT_HANDLED_KEY } from '../services/importRemapper';

const REMOTE: store.RemoteState = {
  currentUser: { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Me', email: 'me@x.com', avatar: '' },
  friends: [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Ana', email: 'a@x.com', avatar: '' }],
  groups: [],
  expenses: [],
  settlements: [],
  activityEvents: [],
  importBatches: [],
};

/** Pre-4a localStorage shape, keyed with legacy string ids (user_1, exp_1, ...). */
const LOCAL_LEGACY_STATE: AppState = {
  currentUser: { id: 'user_1', name: 'Legacy Me', email: 'me@x.com', avatar: '' },
  friends: [{ id: 'user_2', name: 'Ana', email: 'a@x.com', avatar: '' }],
  groups: [],
  expenses: [
    {
      id: 'exp_1',
      description: 'Old Dinner',
      amount: 30,
      paidBy: 'user_1',
      splitWith: [
        { userId: 'user_1', amount: 15 },
        { userId: 'user_2', amount: 15 },
      ],
      date: '2025-01-01T00:00:00.000Z',
      category: 'dining',
      currency: 'USD',
      groupId: null,
      deletedAt: null,
    },
  ],
  settlements: [],
  activityEvents: [],
  importBatches: [],
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
    addFriend,
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
      <span data-testid="friends">{friends.length}</span>
      <span data-testid="newestFriend">{friends[friends.length - 1]?.name ?? ''}</span>
      <span data-testid="newestFriendAvatar">{friends[friends.length - 1]?.avatar ?? ''}</span>
      <button
        data-testid="addFriend"
        onClick={() => addFriend({ name: 'Grace Hopper', email: 'grace@x.com' })}
      >
        addFriend
      </button>
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
const clickButton = (name: string | RegExp) =>
  act(() => screen.getByRole('button', { name }).click());

const EMPTY_REMOTE: store.RemoteState = {
  currentUser: REMOTE.currentUser,
  friends: [],
  groups: [],
  expenses: [],
  settlements: [],
  activityEvents: [],
  importBatches: [],
};

const SOME_EXPENSE = {
  id: 'ffffffff-0000-4000-8000-000000000002',
  description: 'Pre-existing',
  amount: 10,
  paidBy: REMOTE.currentUser.id,
  splitWith: [{ userId: REMOTE.currentUser.id, amount: 10 }],
  date: '2026-01-01T00:00:00.000Z',
  category: 'other' as const,
  currency: 'USD',
  groupId: null,
  deletedAt: null,
};

const SIGNED_IN = { user: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } };

describe('AppContext Phase 2/3 behaviour', () => {
  beforeEach(() => {
    authState.session = SIGNED_IN;
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
    const warn = captureConsoleWarn();
    vi.mocked(store.insertExpense).mockRejectedValueOnce(new Error('down'));
    await renderReady();
    click('add');
    // Applied optimistically first.
    expect(screen.getByTestId('top').textContent).toBe('Coffee');
    await waitFor(() => expect(num('active')).toBe(0));
    expect(screen.getByText(/Couldn.t save your change/)).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('persist failed'),
      expect.any(Error)
    );
  });

  it('adds a friend optimistically, with a generated avatar and an activity event', async () => {
    // Pre-4b there was no addFriend at all, so a new user could not add anyone
    // to split with; `friend.add` was an ActivityAction with no producer.
    await renderReady();
    const startCount = num('friends');

    click('addFriend');

    expect(num('friends')).toBe(startCount + 1);
    expect(screen.getByTestId('newestFriend').textContent).toBe('Grace Hopper');
    // Avatar is generated, not the schema's '' default, so the img isn't broken.
    expect(screen.getByTestId('newestFriendAvatar').textContent).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByTestId('last').textContent).toBe('friend.add');

    await waitFor(() => expect(store.insertFriend).toHaveBeenCalled());
    const [ownerId, friend] = vi.mocked(store.insertFriend).mock.calls[0];
    expect(ownerId).toBe(REMOTE.currentUser.id);
    expect(friend).toMatchObject({ name: 'Grace Hopper', email: 'grace@x.com' });
    expect(friend.id).toMatch(/^[0-9a-f-]{36}$/);

    // Survives the persist resolving.
    expect(num('friends')).toBe(startCount + 1);
  });

  it('rolls back the new friend and toasts when the persist fails', async () => {
    const warn = captureConsoleWarn();
    vi.mocked(store.insertFriend).mockRejectedValueOnce(new Error('down'));
    await renderReady();
    const startCount = num('friends');

    click('addFriend');
    expect(num('friends')).toBe(startCount + 1);

    await waitFor(() => expect(num('friends')).toBe(startCount));
    expect(screen.getByText(/Couldn.t save your change/)).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('persist failed'),
      expect.any(Error)
    );
  });

  it('rolls back silently when the user signed out before the write failed', async () => {
    // Regression guard for backlog item 3. ToastProvider sits above the auth
    // gate, so it outlives AppContextProvider on sign-out — without the
    // signed-out check the rollback toast landed on the login screen.
    const warn = captureConsoleWarn();
    let rejectPersist: (err: Error) => void = () => {};
    vi.mocked(store.insertExpense).mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectPersist = reject;
      })
    );

    const { rerender } = await renderReady();
    click('add');
    expect(screen.getByTestId('top').textContent).toBe('Coffee');

    // The user signs out while the write is still in flight.
    authState.session = null;
    rerender(
      <ToastProvider>
        <AppContextProvider>
          <Harness />
        </AppContextProvider>
      </ToastProvider>
    );

    await act(async () => {
      rejectPersist(new Error('down'));
      await Promise.resolve();
    });

    // Still rolled back — just without shouting about it.
    await waitFor(() => expect(num('active')).toBe(0));
    expect(screen.queryByText(/Couldn.t save your change/)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('persist failed'),
      expect.any(Error)
    );
  });
});

/**
 * Phase 4a: one-time localStorage → account import. Offered only when the
 * freshly-fetched remote state is entirely empty and pre-4a local data is
 * present; never re-offered once handled (accepted or dismissed).
 */
describe('AppContext one-time import', () => {
  beforeEach(() => {
    authState.session = SIGNED_IN;
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(store.fetchAll).mockResolvedValue(structuredClone(REMOTE));
    vi.mocked(store.importState).mockResolvedValue(undefined);
    vi.mocked(localStore.loadState).mockReturnValue(null);
  });

  it('offers import when remote is empty and local data exists, imports on accept', async () => {
    vi.mocked(store.fetchAll).mockResolvedValueOnce(structuredClone(EMPTY_REMOTE));
    vi.mocked(localStore.loadState).mockReturnValue(LOCAL_LEGACY_STATE);
    localStorage.removeItem(IMPORT_HANDLED_KEY);

    renderApp();
    expect(await screen.findByText(/import your existing data/i)).toBeTruthy();

    // Refetch after import returns non-empty remote state.
    vi.mocked(store.fetchAll).mockResolvedValueOnce(structuredClone(REMOTE));
    clickButton('Import');

    await waitFor(() => expect(store.importState).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.fetchAll).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(localStorage.getItem(IMPORT_HANDLED_KEY)).toBe('1')
    );
    expect(localStore.clearState).toHaveBeenCalled();
    expect(screen.queryByText(/import your existing data/i)).toBeNull();

    // Remapped payload carries the authenticated userId, not the legacy 'user_1'.
    const [ownerId] = vi.mocked(store.importState).mock.calls[0];
    expect(ownerId).toBe('aaaaaaaa-0000-4000-8000-000000000001');
  });

  it('never re-offers after dismissal', async () => {
    vi.mocked(store.fetchAll).mockResolvedValueOnce(structuredClone(EMPTY_REMOTE));
    vi.mocked(localStore.loadState).mockReturnValue(LOCAL_LEGACY_STATE);
    localStorage.removeItem(IMPORT_HANDLED_KEY);

    renderApp();
    expect(await screen.findByText(/import your existing data/i)).toBeTruthy();

    clickButton('Not now');

    await waitFor(() =>
      expect(screen.queryByText(/import your existing data/i)).toBeNull()
    );
    expect(localStorage.getItem(IMPORT_HANDLED_KEY)).toBe('1');
    expect(store.importState).not.toHaveBeenCalled();
  });

  it('does not offer when remote already has data', async () => {
    vi.mocked(store.fetchAll).mockResolvedValue({
      ...structuredClone(REMOTE),
      expenses: [SOME_EXPENSE],
    });
    vi.mocked(localStore.loadState).mockReturnValue(LOCAL_LEGACY_STATE);
    localStorage.removeItem(IMPORT_HANDLED_KEY);

    await renderReady();
    expect(screen.queryByText(/import your existing data/i)).toBeNull();
  });
});
