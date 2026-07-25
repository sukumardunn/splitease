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
 * Guess the mode behind an expense's stored amounts.
 *
 * **Fallback only.** Since migration 20260725000005 an expense records the mode
 * it was created with (`Expense.splitMode`), and `deriveFormSeed` prefers that.
 * This is what happens when there is nothing to prefer: a row written before
 * that column existed, or a Phase 5A CSV import, which records resolved amounts
 * and no intent.
 *
 * Only `equal` is worth recovering — it keeps the split rebalancing if the
 * amount is changed — and it is claimed only when the stored splits match
 * `resolveSplit`'s equal output cent-for-cent. Everything else seeds `exact`,
 * which round-trips any split losslessly no matter what produced it (percentage,
 * shares, import).
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

function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Refill the per-person *input boxes* for a mode, from the resolved amounts.
 *
 * Only the mode is stored, not the numbers that were typed into it, so the boxes
 * have to be reconstructed. Each mode has an exact or near-exact reconstruction:
 *
 *  - `equal` needs no values at all (the inputs are hidden).
 *  - `exact` is the stored amounts verbatim — lossless.
 *  - `percentage` is `amount / total * 100` to two decimals, with the rounding
 *    residual pushed onto the largest share so the boxes sum to exactly 100 and
 *    the form does not open reporting itself invalid.
 *  - `shares` reuses each amount as its own weight. Weights are normalised by
 *    `resolveSplit`, so amount-as-weight reproduces the same split; what is lost
 *    is only how the weights were *written* (2:1 shows as 20:10), which no
 *    column records.
 *  - `adjustment` is `amount - total/n`, the per-person delta from an equal
 *    share, which is the definition the engine applies in reverse.
 *
 * Percentage and adjustment can land a cent away from the stored amounts on
 * totals that do not divide cleanly; both stay inside the form's own ±$0.01
 * validation tolerance, and the split is re-resolved on save anyway. `exact`
 * remains the only bit-exact mode, which is why the `inferSplitMode` fallback
 * still prefers it when nothing was recorded.
 */
function deriveSplitValues(
  mode: SplitMode,
  expense: Expense,
  participants: string[]
): Record<string, string> {
  const values: Record<string, string> = {};
  const stored = new Map(expense.splitWith.map((s) => [s.userId, s.amount]));
  const amountOf = (id: string) => stored.get(id) ?? 0;

  if (mode === 'equal') return values;

  if (mode === 'exact') {
    for (const s of expense.splitWith) values[s.userId] = String(s.amount);
    return values;
  }

  if (mode === 'shares') {
    for (const id of participants) values[id] = String(amountOf(id));
    return values;
  }

  if (mode === 'adjustment') {
    const equalShare = expense.amount / participants.length;
    for (const id of participants) {
      values[id] = String(roundToCents(amountOf(id) - equalShare));
    }
    return values;
  }

  // percentage
  if (expense.amount <= 0) return values;
  const percents = participants.map((id) => roundToCents((amountOf(id) / expense.amount) * 100));
  const residual = roundToCents(100 - percents.reduce((a, b) => a + b, 0));
  if (residual !== 0) {
    let largest = 0;
    for (let i = 1; i < percents.length; i++) {
      if (percents[i] > percents[largest]) largest = i;
    }
    percents[largest] = roundToCents(percents[largest] + residual);
  }
  participants.forEach((id, i) => {
    values[id] = String(percents[i]);
  });
  return values;
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
  const participants = [currentUserId, ...selectedFriends];
  // Recorded intent wins; `inferSplitMode` is the fallback for rows that carry
  // none (pre-20260725000005, or a CSV import). A 60/40 percentage split used to
  // reopen as `exact` with the right numbers and the intent thrown away.
  const splitMode = expense.splitMode ?? inferSplitMode(expense, participants);

  const splitValues = deriveSplitValues(splitMode, expense, participants);
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
