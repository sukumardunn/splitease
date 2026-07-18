import { Expense, Split } from '../types';

export type SplitType = 'equal' | 'custom' | 'percentage';

export interface ResolveSplitsParams {
  totalAmount: number;
  participants: string[];
  splitType: SplitType;
  /** For 'custom': exact dollar amounts. For 'percentage': percent values (0-100). */
  customValues?: Record<string, number | string>;
}

/** Round to cents. */
function toCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumSplits(splits: Split[]): number {
  return toCents(splits.reduce((acc, s) => acc + s.amount, 0));
}

/**
 * Resolve a split intent into concrete per-user amounts.
 * Equal splits assign the rounding remainder to the last participant so the
 * splits always sum exactly to the total (no penny drift).
 */
export function resolveSplits(params: ResolveSplitsParams): Split[] {
  const { totalAmount, participants, splitType, customValues = {} } = params;

  if (participants.length === 0) return [];

  if (splitType === 'equal') {
    const per = toCents(totalAmount / participants.length);
    const splits = participants.map((userId) => ({ userId, amount: per }));
    // Correct rounding drift on the last participant.
    const drift = toCents(totalAmount - per * participants.length);
    if (drift !== 0) {
      splits[splits.length - 1].amount = toCents(
        splits[splits.length - 1].amount + drift
      );
    }
    return splits;
  }

  if (splitType === 'percentage') {
    return participants.map((userId) => {
      const pct = Number(customValues[userId] ?? 0);
      return { userId, amount: toCents((pct / 100) * totalAmount) };
    });
  }

  // custom exact amounts
  return participants.map((userId) => ({
    userId,
    amount: toCents(Number(customValues[userId] ?? 0)),
  }));
}

/**
 * Net balance of each friend relative to the current user.
 * Positive = the friend owes the current user; negative = the user owes them.
 * Pure: takes ids + expenses, returns a plain record keyed by friend id.
 */
export function computeBalances(
  currentUserId: string,
  friendIds: string[],
  expenses: Expense[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  friendIds.forEach((id) => {
    balances[id] = 0;
  });

  expenses.forEach((expense) => {
    if (expense.paidBy === currentUserId) {
      // Current user paid; each other participant owes their split.
      expense.splitWith.forEach((split) => {
        if (split.userId !== currentUserId && split.userId in balances) {
          balances[split.userId] += split.amount;
        }
      });
    } else if (
      expense.splitWith.some((split) => split.userId === currentUserId)
    ) {
      // Someone else paid and the current user has a share; the user owes them.
      const userSplit = expense.splitWith.find(
        (split) => split.userId === currentUserId
      );
      if (userSplit && expense.paidBy in balances) {
        balances[expense.paidBy] -= userSplit.amount;
      }
    }
  });

  Object.keys(balances).forEach((id) => {
    balances[id] = toCents(balances[id]);
  });

  return balances;
}
