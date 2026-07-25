/**
 * Phase 6 follow-up: editing an expense.
 *
 * `updateExpense` has existed in both `AppContext` and `supabaseStore` since
 * Phase 4a with no UI caller at all, so nothing in the app could change an
 * expense after creation — including the notes Phase 6A added. These tests pin
 * the new caller: that the form unpacks an existing expense faithfully, that it
 * patches rather than inserts, and that a split survives the round trip.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Expense, Friend, Group, User } from '../../types';
import { resolveSplit } from '../../services/splitEngine';

const ME: User = { id: 'me', name: 'Me', email: 'me@example.com', avatar: 'a.png' };
const ALICE: Friend = { id: 'alice', name: 'Alice', email: 'alice@example.com', avatar: 'b.png' };
const BOB: Friend = { id: 'bob', name: 'Bob', email: 'bob@example.com', avatar: 'c.png' };

const addExpense = vi.fn();
const updateExpense = vi.fn();
const deleteExpense = vi.fn();
const restoreExpense = vi.fn();
let groups: Group[] = [];

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    friends: [ALICE, BOB],
    groups,
    currentUser: ME,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    receipts: {},
    attachReceipt: vi.fn(),
    removeReceipt: vi.fn(),
    loadReceipt: vi.fn(),
    getGroupById: (id: string) => groups.find((g) => g.id === id),
  }),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import AddExpenseModal from './AddExpenseModal';
import { deriveFormSeed, resolvePaidBy } from './expenseFormSeed';
import ExpenseItem from './ExpenseItem';

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    description: 'Dinner',
    amount: 40,
    paidBy: ME.id,
    splitWith: [
      { userId: ME.id, amount: 20 },
      { userId: ALICE.id, amount: 20 },
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
  deleteExpense.mockClear();
  restoreExpense.mockClear();
  groups = [];
});

describe('deriveFormSeed', () => {
  it('is blank for a new expense, with the current user as the sole payer', () => {
    const seed = deriveFormSeed(ME.id);
    expect(seed).toMatchObject({
      description: '',
      amount: '',
      category: 'other',
      groupId: null,
      notes: '',
      payerIds: [ME.id],
      splitMode: 'equal',
      selectedFriends: [],
    });
  });

  it('unpacks every field of an existing expense', () => {
    // Asserted exhaustively (not toMatchObject) so a field silently dropped
    // from FormSeed fails here rather than surfacing as a blank input.
    const seed = deriveFormSeed(
      ME.id,
      expense({ groupId: 'g1', notes: 'Alice skipped wine', category: 'groceries' })
    );
    expect(seed).toEqual({
      description: 'Dinner',
      amount: '40',
      category: 'groceries',
      groupId: 'g1',
      notes: 'Alice skipped wine',
      payerIds: [ME.id],
      payerValues: {},
      splitMode: 'equal',
      selectedFriends: [ALICE.id],
      splitValues: {},
    });
  });

  it('treats a missing note as an empty string, not undefined', () => {
    // The textarea is a controlled input; undefined would make it uncontrolled.
    expect(deriveFormSeed(ME.id, expense()).notes).toBe('');
  });

  it('recovers equal mode when the stored splits are an equal split', () => {
    // Worth recovering specifically because it keeps the split rebalancing if
    // the amount is edited — see the assertion further down.
    const seed = deriveFormSeed(ME.id, expense());
    expect(seed.splitMode).toBe('equal');
    expect(seed.splitValues).toEqual({});
  });

  it('recovers equal mode even when the split had an odd remainder cent', () => {
    // $10 three ways is 3.34/3.33/3.33 — asserted via resolveSplit rather than
    // hardcoded, so this tests the round trip and not the remainder policy.
    const participants = [ME.id, ALICE.id, BOB.id];
    const splitWith = resolveSplit({
      totalAmount: 10,
      participants,
      mode: 'equal',
      values: {},
    });
    expect(new Set(splitWith.map((s) => s.amount)).size).toBe(2); // precondition
    expect(deriveFormSeed(ME.id, expense({ amount: 10, splitWith })).splitMode).toBe('equal');
  });

  it('falls back to exact mode for an uneven split, preserving the amounts', () => {
    const seed = deriveFormSeed(
      ME.id,
      expense({
        splitWith: [
          { userId: ME.id, amount: 30 },
          { userId: ALICE.id, amount: 10 },
        ],
      })
    );
    expect(seed.splitMode).toBe('exact');
    expect(seed.splitValues).toEqual({ me: '30', alice: '10' });
  });

  it('falls back to exact mode when the current user has no share', () => {
    // The form hardcodes the current user into the split list, so it cannot
    // claim this was an equal split of the people actually on it.
    const seed = deriveFormSeed(
      ME.id,
      expense({ splitWith: [{ userId: ALICE.id, amount: 40 }] })
    );
    expect(seed.splitMode).toBe('exact');
  });

  it('seeds the real payer, not the current user, when a friend paid', () => {
    expect(deriveFormSeed(ME.id, expense({ paidBy: ALICE.id })).payerIds).toEqual([ALICE.id]);
  });

  it('adds the current user at $0 when they were not on the expense', () => {
    // Pinning a known, deliberate limitation rather than leaving it implicit:
    // the form structurally cannot represent "I am not on this expense", so a
    // save puts the current user on it with a zero share. Balance-neutral, but
    // it is a stored-data change — documented in docs/ROADMAP.md.
    const notMine = expense({ splitWith: [{ userId: ALICE.id, amount: 40 }] });
    render(<AddExpenseModal isOpen expense={notMine} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(updateExpense.mock.calls[0][1].splitWith).toEqual([
      { userId: ME.id, amount: 0 },
      { userId: ALICE.id, amount: 40 },
    ]);
  });

  it('seeds multi-payer contributions', () => {
    const seed = deriveFormSeed(
      ME.id,
      expense({
        payers: [
          { userId: ME.id, amount: 25 },
          { userId: ALICE.id, amount: 15 },
        ],
      })
    );
    expect(seed.payerIds).toEqual([ME.id, ALICE.id]);
    expect(seed.payerValues).toEqual({ me: '25', alice: '15' });
  });
});

describe('resolvePaidBy', () => {
  it('keeps the previously recorded payer when they are still a payer', () => {
    expect(resolvePaidBy([ALICE.id, ME.id], ME.id)).toBe(ME.id);
  });

  it('falls back to the first payer when the recorded one was removed', () => {
    expect(resolvePaidBy([ALICE.id], ME.id)).toBe(ALICE.id);
  });

  it('uses the first payer for a new expense, which has no previous one', () => {
    expect(resolvePaidBy([ME.id], undefined)).toBe(ME.id);
  });
});

describe('AddExpenseModal in edit mode', () => {
  const save = () => fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  // Everyone can appear twice — once as a possible payer, once as a split
  // participant — so "Alice" is an ambiguous label. Address the checkboxes by
  // the ids the form already assigns them.
  const payerBox = (id: string) => document.getElementById(`payer-${id}`) as HTMLInputElement;
  const splitBox = (id: string) => document.getElementById(`friend-${id}`) as HTMLInputElement;

  it('announces itself as an edit, not an add', () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Edit Expense' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^add expense$/i })).toBeNull();
  });

  it('prefills the form from the expense', () => {
    render(
      <AddExpenseModal isOpen expense={expense({ notes: 'Alice skipped wine' })} onClose={vi.fn()} />
    );
    expect(screen.getByLabelText('Description')).toHaveValue('Dinner');
    expect(screen.getByLabelText('Amount')).toHaveValue(40);
    expect(screen.getByLabelText('Category')).toHaveValue('dining');
    expect(screen.getByLabelText('Notes (Optional)')).toHaveValue('Alice skipped wine');
    // Alice was on the split, Bob was not.
    expect(splitBox(ALICE.id)).toBeChecked();
    expect(splitBox(BOB.id)).not.toBeChecked();
    expect(payerBox(ME.id)).toBeChecked();
  });

  it('patches the existing expense instead of inserting a new one', () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Lunch' } });
    save();

    expect(addExpense).not.toHaveBeenCalled();
    expect(updateExpense).toHaveBeenCalledTimes(1);
    const [id, patch] = updateExpense.mock.calls[0];
    expect(id).toBe('e1');
    expect(patch.description).toBe('Lunch');
  });

  it('rebalances an equal split when the amount changes', () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '60' } });
    save();

    const [, patch] = updateExpense.mock.calls[0];
    expect(patch.amount).toBe(60);
    expect(patch.splitWith).toEqual([
      { userId: ME.id, amount: 30 },
      { userId: ALICE.id, amount: 30 },
    ]);
  });

  it('round-trips an uneven split untouched when nothing is edited', () => {
    const uneven = expense({
      splitWith: [
        { userId: ME.id, amount: 30 },
        { userId: ALICE.id, amount: 10 },
      ],
    });
    render(<AddExpenseModal isOpen expense={uneven} onClose={vi.fn()} />);
    save();

    const [, patch] = updateExpense.mock.calls[0];
    expect(patch.splitWith).toEqual(uneven.splitWith);
  });

  it('clears a note to undefined rather than an empty string', () => {
    // '' would persist an empty note; the mapper only writes SQL NULL for
    // undefined. The key must still be PRESENT — `updateExpense` spreads the
    // patch onto the stored expense, so omitting it would keep the old note.
    render(<AddExpenseModal isOpen expense={expense({ notes: 'old note' })} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Notes (Optional)'), { target: { value: '' } });
    save();

    const [, patch] = updateExpense.mock.calls[0];
    expect('notes' in patch).toBe(true);
    expect(patch.notes).toBeUndefined();
  });

  it('keeps a lone payer row rather than deleting it', () => {
    // A Phase 5A import records exactly one payer. Sending `payers: undefined`
    // here would delete that row on an otherwise no-op save.
    const imported = expense({
      payers: [{ userId: ME.id, amount: 40 }],
      importBatchId: 'b1',
    });
    render(<AddExpenseModal isOpen expense={imported} onClose={vi.fn()} />);
    save();

    const [, patch] = updateExpense.mock.calls[0];
    expect(patch.payers).toEqual([{ userId: ME.id, amount: 40 }]);
  });

  it('keeps the recorded payer when one is unchecked and re-checked', () => {
    // payerIds order is not stable — it comes from an unordered select, and
    // re-checking appends — so paidBy must not simply be payerIds[0].
    const multi = expense({
      paidBy: ME.id,
      payers: [
        { userId: ME.id, amount: 25 },
        { userId: ALICE.id, amount: 15 },
      ],
    });
    render(<AddExpenseModal isOpen expense={multi} onClose={vi.fn()} />);
    fireEvent.click(payerBox(ME.id)); // uncheck me → [alice]
    fireEvent.click(payerBox(ME.id)); // re-check me → [alice, me]
    save();

    const [, patch] = updateExpense.mock.calls[0];
    expect(patch.paidBy).toBe(ME.id);
  });

  it('drops back to a single payer by clearing payers, not omitting them', () => {
    // `updateExpense` patches onto the stored expense, so an omitted key would
    // leave the old multi-payer rows in place.
    const multi = expense({
      payers: [
        { userId: ME.id, amount: 25 },
        { userId: ALICE.id, amount: 15 },
      ],
    });
    render(<AddExpenseModal isOpen expense={multi} onClose={vi.fn()} />);
    expect(payerBox(ALICE.id)).toBeChecked();
    fireEvent.click(payerBox(ALICE.id)); // uncheck — back to a single payer
    save();

    const [, patch] = updateExpense.mock.calls[0];
    expect('payers' in patch).toBe(true);
    expect(patch.payers).toBeUndefined();
  });

  it('does not send date or importBatchId, so neither is disturbed by an edit', () => {
    render(<AddExpenseModal isOpen expense={expense({ importBatchId: 'b1' })} onClose={vi.fn()} />);
    save();

    const [, patch] = updateExpense.mock.calls[0];
    expect('date' in patch).toBe(false);
    expect('importBatchId' in patch).toBe(false);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<AddExpenseModal isOpen expense={expense()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    render(<AddExpenseModal isOpen={false} expense={expense()} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ExpenseItem edit affordance', () => {
  it('opens the edit form prefilled for that expense', () => {
    render(<ExpenseItem expense={expense({ description: 'Taxi' })} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit "Taxi"' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('Taxi');
  });

  it('offers no edit button for a settlement', () => {
    // The category picker excludes `settlement`, so saving one through this
    // form would silently recategorise it.
    render(<ExpenseItem expense={expense({ category: 'settlement' })} />);
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Delete/ })).toBeInTheDocument();
  });
});
