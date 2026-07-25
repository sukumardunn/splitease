/**
 * Phase 6: expense notes.
 *
 * `notes` existed on the schema, the domain type, and both row mappers since
 * Phase 4a, but nothing in the UI ever wrote or read it. These tests pin the two
 * new ends of that wire: the modal sends it, and the row shows it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Expense, Friend, Group, User } from '../../types';

const ME: User = { id: 'me', name: 'Me', email: 'me@example.com', avatar: 'a.png' };
const ALICE: Friend = { id: 'alice', name: 'Alice', email: 'alice@example.com', avatar: 'b.png' };

const addExpense = vi.fn();
const deleteExpense = vi.fn();
let groups: Group[] = [];

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    friends: [ALICE],
    groups,
    currentUser: ME,
    addExpense,
    deleteExpense,
    getGroupById: (id: string) => groups.find((g) => g.id === id),
  }),
}));

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import AddExpenseModal from './AddExpenseModal';
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
  deleteExpense.mockClear();
  groups = [];
});

describe('AddExpenseModal notes field', () => {
  const fillRequired = () => {
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Dinner' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '40' } });
  };

  const submit = () =>
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));

  it('sends the note the user typed', () => {
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    fillRequired();
    fireEvent.change(screen.getByLabelText('Notes (Optional)'), {
      target: { value: 'Split the tasting menu, Alice skipped wine' },
    });
    submit();

    expect(addExpense).toHaveBeenCalledTimes(1);
    expect(addExpense.mock.calls[0][0].notes).toBe(
      'Split the tasting menu, Alice skipped wine'
    );
  });

  it('sends undefined rather than an empty string when left blank', () => {
    // The mapper turns undefined into SQL NULL; '' would persist an empty note
    // and make `expense.notes && …` render an empty line downstream.
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    fillRequired();
    submit();

    expect(addExpense).toHaveBeenCalledTimes(1);
    expect(addExpense.mock.calls[0][0].notes).toBeUndefined();
  });

  it('treats a whitespace-only note as no note', () => {
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    fillRequired();
    fireEvent.change(screen.getByLabelText('Notes (Optional)'), {
      target: { value: '   \n  ' },
    });
    submit();

    expect(addExpense.mock.calls[0][0].notes).toBeUndefined();
  });

  it('does not block submission — notes are optional', () => {
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    fillRequired();
    expect(screen.getByRole('button', { name: /add expense/i })).not.toBeDisabled();
  });

  it('offers every real category and never the synthetic settlement one', () => {
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    const options = screen
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('dining');
    expect(options).toContain('other');
    expect(options).not.toContain('settlement');
  });
});

describe('ExpenseItem notes display', () => {
  it('shows the note under the description', () => {
    render(<ExpenseItem expense={expense({ notes: 'Alice skipped wine' })} />);
    expect(screen.getByText('Alice skipped wine')).toBeInTheDocument();
  });

  it('exposes the full note via title, since the line is truncated', () => {
    const long = 'A note far too long to fit on one row of an expense list, truncated in the UI';
    render(<ExpenseItem expense={expense({ notes: long })} />);
    expect(screen.getByTitle(long)).toBeInTheDocument();
  });

  it('renders no note line when there is no note', () => {
    const { container } = render(<ExpenseItem expense={expense()} />);
    expect(container.querySelector('.italic')).toBeNull();
  });

  it('renders no note line for an empty-string note', () => {
    const { container } = render(<ExpenseItem expense={expense({ notes: '' })} />);
    expect(container.querySelector('.italic')).toBeNull();
  });
});
