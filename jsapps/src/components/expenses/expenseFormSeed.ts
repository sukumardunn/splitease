/**
 * Unpacking an existing expense back into expense-form state.
 *
 * This lives outside `AddExpenseModal.tsx` on purpose: exporting a non-component
 * from a component module trips `react-refresh/only-export-components`, and it
 * keeps the seeding logic testable without a DOM.
 */
import { Expense, ExpenseCategory } from '../../types';
import { resolveSplit, SplitMode } from '../../services/splitEngine';

export interface FormSeed {
  description: string;
  amount: string;
  category: ExpenseCategory;
  groupId: string | null;
  notes: string;
  payerIds: string[];
  payerValues: Record<string, string>;
  splitMode: SplitMode;
  selectedFriends: string[];
  splitValues: Record<string, string>;
}

/**
 * An expense stores its *resolved* per-person amounts, never the mode that
 * produced them, so opening one for edit has to infer a mode. Only `equal` is
 * worth recovering — it keeps the split rebalancing if the amount is changed —
 * and it is claimed only when the stored splits match `resolveSplit`'s equal
 * output cent-for-cent. Everything else seeds `exact`, which round-trips any
 * split losslessly no matter what produced it (percentage, shares, import).
 *
 * The cent-for-cent comparison is `===` on two numbers, which is safe here and
 * not luck: both sides originate from a `numeric(12,2)` column, and
 * `resolveSplit` rounds to cents, so both land on the same double.
 */
export function inferSplitMode(expense: Expense, participants: string[]): SplitMode {
  const stored = new Map(expense.splitWith.map((s) => [s.userId, s.amount]));
  if (stored.size !== participants.length) return 'exact';
  const equal = resolveSplit({
    totalAmount: expense.amount,
    participants,
    mode: 'equal',
    values: {},
  });
  return equal.every((s) => stored.get(s.userId) === s.amount) ? 'equal' : 'exact';
}

/**
 * Initial form state — blank for a new expense, or unpacked from an existing
 * one for an edit.
 */
export function deriveFormSeed(currentUserId: string, expense?: Expense): FormSeed {
  if (!expense) {
    return {
      description: '',
      amount: '',
      category: 'other',
      groupId: null,
      notes: '',
      payerIds: [currentUserId],
      payerValues: {},
      splitMode: 'equal',
      selectedFriends: [],
      splitValues: {},
    };
  }

  // The form always puts the current user first and hardcodes them into the
  // split list, so participants are rebuilt in that order regardless of how the
  // stored splits happen to be sorted.
  const selectedFriends = expense.splitWith
    .map((s) => s.userId)
    .filter((id) => id !== currentUserId);
  const splitMode = inferSplitMode(expense, [currentUserId, ...selectedFriends]);

  const splitValues: Record<string, string> = {};
  if (splitMode === 'exact') {
    for (const s of expense.splitWith) splitValues[s.userId] = String(s.amount);
  }
  const payerValues: Record<string, string> = {};
  for (const p of expense.payers ?? []) payerValues[p.userId] = String(p.amount);

  return {
    description: expense.description,
    amount: String(expense.amount),
    category: expense.category,
    groupId: expense.groupId ?? null,
    notes: expense.notes ?? '',
    // `expense_payers` is selected without an ORDER BY, so this order is not
    // stable across loads — never derive `paidBy` from it. See `resolvePaidBy`.
    payerIds: expense.payers?.length
      ? expense.payers.map((p) => p.userId)
      : [expense.paidBy],
    payerValues,
    splitMode,
    selectedFriends,
    splitValues,
  };
}

/**
 * Which payer to record as the (primary) `paidBy`.
 *
 * Not simply `payerIds[0]`: that order comes from an unordered `expense_payers`
 * select and also changes when a payer is unchecked and re-checked, which would
 * silently reassign who paid. `ExpenseItem` renders "<name> paid" and colours
 * the row from `paidBy`, so a flip is visible even though balances (which read
 * `payers`) are unaffected. Keep the stored payer whenever they are still one.
 */
export function resolvePaidBy(payerIds: string[], previous?: string): string {
  if (previous && payerIds.includes(previous)) return previous;
  return payerIds[0];
}
