import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppContextProvider, useAppContext } from './AppContext';

/**
 * Phase 2/3 behaviour: soft-delete + restore, append-only activity logging,
 * and first-class settlements — exercised through the real context.
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
    <AppContextProvider>
      <Harness />
    </AppContextProvider>
  );
}

const num = (id: string) => Number(screen.getByTestId(id).textContent);
const click = (id: string) => act(() => screen.getByTestId(id).click());

describe('AppContext Phase 2/3 behaviour', () => {
  beforeEach(() => localStorage.clear());

  it('soft-deletes and restores expenses, logging every mutation', () => {
    renderApp();
    const activeStart = num('active'); // 6 demo expenses
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

  it('records settlements as first-class entries, not fake expenses', () => {
    renderApp();
    const activeStart = num('active');
    click('settle');
    expect(num('settlements')).toBe(1);
    expect(num('active')).toBe(activeStart); // no phantom expense created
    expect(screen.getByTestId('last').textContent).toBe('settlement.create');
  });
});
