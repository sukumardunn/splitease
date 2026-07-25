/**
 * Wave 3: an expense records the *intent* behind its split, not only the
 * resolved amounts (`expenses.split_mode`, migration 20260725000005).
 *
 * Before this, reopening a 60/40 percentage split showed `exact` with the right
 * dollars and the intent thrown away — edit the total and the split no longer
 * meant 60/40. These tests pin: the stored mode wins over the guess, the per-
 * person input boxes are rebuilt for every mode, the mode is written on both
 * create and edit, and `inferSplitMode` still covers rows that recorded nothing
 * (pre-migration rows and CSV imports).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Expense, Friend, User } from '../../types';
import { resolveSplit, validateSplits } from '../../services/splitEngine';

const ME: User = { id: 'me', name: 'Me', email: 'me@example.com', avatar: 'a.png' };
const ALICE: Friend = { id: 'alice', name: 'Alice', email: 'alice@example.com', avatar: 'b.png' };
const BOB: Friend = { id: 'bob', name: 'Bob', email: 'bob@example.com', avatar: 'c.png' };

const addExpense = vi.fn();
const updateExpense = vi.fn();

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    friends: [ALICE, BOB],
    groups: [],
    currentUser: ME,
    addExpense,
    updateExpense,
    deleteExpense: vi.fn(),
    restoreExpense: vi.fn(),
    receipts: {},
    attachReceipt: vi.fn(),
    removeReceipt: vi.fn(),
    loadReceipt: vi.fn(),
    getGroupById: () => undefined,
  }),
}));

vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import AddExpenseModal from './AddExpenseModal';
import { deriveFormSeed, inferSplitMode } from './expenseFormSeed';

/** A 60/40 split of $100 — identical rows whatever mode produced them. */
function sixtyForty(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    description: 'Dinner',
    amount: 100,
    paidBy: ME.id,
    splitWith: [
      { userId: ME.id, amount: 60 },
      { userId: ALICE.id, amount: 40 },
    ],
    date: '2026-07-10T12:00:00.000Z',
    category: 'dining',
    currency: 'USD',
    groupId: null,
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  addExpense.mockClear();
  updateExpense.mockClear();
});

describe('a stored split mode beats guessing', () => {
  it('reopens a 60/40 percentage split as percentage, with the percentages back in the boxes', () => {
    const seed = deriveFormSeed(ME.id, sixtyForty({ splitMode: 'percentage' }));
    expect(seed.splitMode).toBe('percentage');
    expect(seed.splitValues).toEqual({ me: '60', alice: '40' });
  });

  it('would have guessed exact for those same rows — which is the bug', () => {
    // The identical expense with no recorded mode: same amounts, intent gone.
    const seed = deriveFormSeed(ME.id, sixtyForty());
    expect(seed.splitMode).toBe('exact');
  });

  it('honours a stored mode even when the amounts happen to look equal', () => {
    // A 50/50 percentage split resolves to the same cents as an equal split, so
    // inference would claim `equal`; the recorded intent says otherwise.
    const fifty = sixtyForty({
      splitMode: 'percentage',
      splitWith: [
        { userId: ME.id, amount: 50 },
        { userId: ALICE.id, amount: 50 },
      ],
    });
    expect(deriveFormSeed(ME.id, fifty).splitMode).toBe('percentage');
    expect(inferSplitMode(fifty, [ME.id, ALICE.id])).toBe('equal');
  });

  it('needs no values for a stored equal split', () => {
    const seed = deriveFormSeed(ME.id, sixtyForty({ splitMode: 'equal' }));
    expect(seed.splitValues).toEqual({});
  });

  it('takes exact amounts verbatim', () => {
    const seed = deriveFormSeed(ME.id, sixtyForty({ splitMode: 'exact' }));
    expect(seed.splitValues).toEqual({ me: '60', alice: '40' });
  });
});

describe('rebuilt input values reproduce the stored split', () => {
  // Only the mode is recorded, never the numbers typed into it, so the boxes are
  // reconstructed from the resolved amounts. Feeding them back through the engine
  // must land on the same money.
  const CASES: { mode: 'percentage' | 'shares' | 'adjustment'; expense: Expense }[] = [
    { mode: 'percentage', expense: sixtyForty({ splitMode: 'percentage' }) },
    { mode: 'shares', expense: sixtyForty({ splitMode: 'shares' }) },
    { mode: 'adjustment', expense: sixtyForty({ splitMode: 'adjustment' }) },
  ];

  for (const { mode, expense } of CASES) {
    it(`round-trips a ${mode} split through resolveSplit`, () => {
      const seed = deriveFormSeed(ME.id, expense);
      expect(seed.splitMode).toBe(mode);
      const values: Record<string, number> = {};
      for (const [id, v] of Object.entries(seed.splitValues)) values[id] = parseFloat(v);
      const resolved = resolveSplit({
        totalAmount: expense.amount,
        participants: [ME.id, ALICE.id],
        mode,
        values,
      });
      expect(resolved).toEqual(expense.splitWith);
    });
  }

  it('makes percentages sum to exactly 100 even when the split does not divide evenly', () => {
    // $10 three ways is 3.34/3.33/3.33 -> 33.4/33.3/33.3, which sums to 100.0
    // only because the residual is pushed onto the largest share. Without that
    // the form would open reporting itself invalid.
    const participants = [ME.id, ALICE.id, BOB.id];
    const splitWith = resolveSplit({ totalAmount: 10, participants, mode: 'equal', values: {} });
    const seed = deriveFormSeed(
      ME.id,
      sixtyForty({ splitMode: 'percentage', amount: 10, splitWith })
    );
    const percents = participants.map((id) => parseFloat(seed.splitValues[id]));
    expect(percents.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    // And the form's own validation agrees, which is what the user sees.
    expect(
      validateSplits(100, participants.map((id) => ({ userId: id, amount: parseFloat(seed.splitValues[id]) })))
        .valid
    ).toBe(true);
  });

  it('leaves percentage boxes empty for a zero-amount expense rather than dividing by zero', () => {
    const seed = deriveFormSeed(
      ME.id,
      sixtyForty({
        splitMode: 'percentage',
        amount: 0,
        splitWith: [{ userId: ME.id, amount: 0 }],
      })
    );
    expect(seed.splitValues).toEqual({});
  });
});

describe('inferSplitMode is still the fallback', () => {
  it('recovers equal for a row that recorded no mode', () => {
    // Pre-migration rows and 5A CSV imports both arrive with splitMode undefined.
    const equal = sixtyForty({
      splitWith: [
        { userId: ME.id, amount: 50 },
        { userId: ALICE.id, amount: 50 },
      ],
    });
    expect(equal.splitMode).toBeUndefined();
    expect(deriveFormSeed(ME.id, equal).splitMode).toBe('equal');
  });
});

describe('the form writes the mode it was using', () => {
  it('records the mode on create', () => {
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Taxi' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
    // The split-with checkbox is labelled with the friend's avatar + name.
    fireEvent.click(document.getElementById(`friend-${ALICE.id}`) as HTMLInputElement);
    fireEvent.click(screen.getByRole('button', { name: /percentage/i }));
    fireEvent.change(screen.getByLabelText('Your share (%)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText("Alice's share (%)"), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /^add expense$/i }));

    expect(addExpense).toHaveBeenCalledTimes(1);
    expect(addExpense.mock.calls[0][0]).toMatchObject({
      splitMode: 'percentage',
      splitWith: [
        { userId: ME.id, amount: 60 },
        { userId: ALICE.id, amount: 40 },
      ],
    });
  });

  it('reopens a stored percentage split in percentage mode and saves it back as one', () => {
    render(<AddExpenseModal isOpen expense={sixtyForty({ splitMode: 'percentage' })} onClose={vi.fn()} />);

    // The unit label on the inputs is the visible proof of which mode is active.
    expect(screen.getByLabelText('Your share (%)')).toHaveValue(60);
    expect(screen.getByLabelText("Alice's share (%)")).toHaveValue(40);

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(updateExpense.mock.calls[0][1]).toMatchObject({
      splitMode: 'percentage',
      splitWith: [
        { userId: ME.id, amount: 60 },
        { userId: ALICE.id, amount: 40 },
      ],
    });
  });

  it('records a mode the user switches to, replacing the stored one', () => {
    render(<AddExpenseModal isOpen expense={sixtyForty({ splitMode: 'percentage' })} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^equal$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateExpense.mock.calls[0][1]).toMatchObject({
      splitMode: 'equal',
      splitWith: [
        { userId: ME.id, amount: 50 },
        { userId: ALICE.id, amount: 50 },
      ],
    });
  });
});
