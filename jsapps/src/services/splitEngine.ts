import { Split } from '../types';

export type SplitMode = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';

export interface ResolveSplitInput {
  totalAmount: number;
  participants: string[];
  mode: SplitMode;
  values?: Record<string, number>;
}

export interface SplitValidation {
  valid: boolean;
  sum: number;
  difference: number;
  message?: string;
}

export interface Payer {
  userId: string;
  amount: number;
}

export interface BalanceExpense {
  amount: number;
  splitWith: Split[];
  paidBy?: string;
  payers?: Payer[];
}

export interface SettlementRecord {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/** Round a dollar amount to the nearest cent. */
function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Distribute `totalDollars` across `participants` using each participant's
 * unrounded "exact" dollar target, with leftover pennies (after flooring each
 * target to the cent) assigned to the largest fractional remainders first,
 * ties broken by participant order (array index).
 */
function applyLargestRemainder(
  participants: string[],
  exactDollarValues: number[],
  totalDollars: number
): Split[] {
  const totalCentsTarget = Math.round(totalDollars * 100);
  const rawCents = exactDollarValues.map((v) => v * 100);
  const floors = rawCents.map((c) => Math.floor(c + 1e-7));
  const sumFloors = floors.reduce((a, b) => a + b, 0);
  const remainder = totalCentsTarget - sumFloors;
  const fracs = rawCents.map((c, i) => c - floors[i]);
  const order = participants.map((_, i) => i);

  if (remainder > 0) {
    const sorted = [...order].sort((a, b) => fracs[b] - fracs[a] || a - b);
    for (let k = 0; k < remainder; k++) {
      floors[sorted[k % sorted.length]] += 1;
    }
  } else if (remainder < 0) {
    const sorted = [...order].sort((a, b) => fracs[a] - fracs[b] || a - b);
    for (let k = 0; k < -remainder; k++) {
      floors[sorted[k % sorted.length]] -= 1;
    }
  }

  return participants.map((userId, i) => ({
    userId,
    amount: roundToCents(floors[i] / 100),
  }));
}

function splitEqualDollars(participants: string[], totalAmount: number): Split[] {
  const exact = participants.map(() => totalAmount / participants.length);
  return applyLargestRemainder(participants, exact, totalAmount);
}

/**
 * Resolve an expense's split intent into concrete per-user dollar amounts
 * that always sum exactly to totalAmount (except 'exact' mode, which is
 * taken verbatim and validated separately via validateSplits).
 */
export function resolveSplit(input: ResolveSplitInput): Split[] {
  const { totalAmount, participants, mode, values = {} } = input;

  if (participants.length === 0) return [];

  if (mode === 'exact') {
    return participants.map((userId) => ({
      userId,
      amount: roundToCents(values[userId] ?? 0),
    }));
  }

  if (mode === 'equal') {
    return splitEqualDollars(participants, totalAmount);
  }

  if (mode === 'percentage') {
    const exactValues = participants.map(
      (id) => ((values[id] ?? 0) / 100) * totalAmount
    );
    return applyLargestRemainder(participants, exactValues, totalAmount);
  }

  if (mode === 'shares') {
    const weights = participants.map((id) => values[id] ?? 0);
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    if (sumWeights <= 0) {
      return splitEqualDollars(participants, totalAmount);
    }
    const exactValues = weights.map((w) => (totalAmount * w) / sumWeights);
    return applyLargestRemainder(participants, exactValues, totalAmount);
  }

  // 'adjustment': everyone pays an equal base of (total - sumAdjustments)/n,
  // then + their own adjustment. Remainder reconciled on the base part only.
  const adjustments = participants.map((id) => roundToCents(values[id] ?? 0));
  const sumAdjustments = adjustments.reduce((a, b) => a + b, 0);
  const baseTotalDollars = totalAmount - sumAdjustments;
  const n = participants.length;
  const exactBaseValues = participants.map(() => baseTotalDollars / n);
  const baseSplits = applyLargestRemainder(
    participants,
    exactBaseValues,
    baseTotalDollars
  );
  return baseSplits.map((s, i) => ({
    userId: s.userId,
    amount: roundToCents(s.amount + adjustments[i]),
  }));
}

function validateSum(
  label: string,
  totalAmount: number,
  sum: number
): SplitValidation {
  const roundedSum = roundToCents(sum);
  const difference = roundToCents(roundedSum - totalAmount);
  const valid = Math.abs(difference) <= 0.01;
  return {
    valid,
    sum: roundedSum,
    difference,
    message: valid
      ? undefined
      : `${label} sum to ${roundedSum.toFixed(2)}, expected ${totalAmount.toFixed(
          2
        )} (difference ${difference.toFixed(2)})`,
  };
}

export function validateSplits(
  totalAmount: number,
  splits: Split[]
): SplitValidation {
  return validateSum(
    'Splits',
    totalAmount,
    splits.reduce((a, s) => a + s.amount, 0)
  );
}

export function validatePayers(
  totalAmount: number,
  payers: Payer[]
): SplitValidation {
  return validateSum(
    'Payers',
    totalAmount,
    payers.reduce((a, p) => a + p.amount, 0)
  );
}

/**
 * Net balance of every id in participantIds relative to currentUserId.
 * Positive => that participant owes currentUser; negative => currentUser
 * owes them.
 *
 * For each expense we compute a per-user net contribution
 * (amount paid - split share) over the union of payers + split
 * participants. When currentUser has a nonzero net for that expense, the
 * surplus/deficit is allocated pro-rata across the opposite side (debtors
 * when currentUser is a creditor, creditors when currentUser is a debtor),
 * which reproduces the legacy single-payer pairwise behaviour exactly and
 * generalises sensibly to multi-payer expenses.
 */
export function computeNetBalances(
  currentUserId: string,
  participantIds: string[],
  expenses: BalanceExpense[],
  settlements: SettlementRecord[] = []
): Record<string, number> {
  const balances: Record<string, number> = {};
  participantIds.forEach((id) => {
    balances[id] = 0;
  });

  expenses.forEach((expense) => {
    const payerAmounts: Record<string, number> = {};
    if (expense.payers && expense.payers.length > 0) {
      expense.payers.forEach((p) => {
        payerAmounts[p.userId] = (payerAmounts[p.userId] ?? 0) + p.amount;
      });
    } else if (expense.paidBy) {
      payerAmounts[expense.paidBy] =
        (payerAmounts[expense.paidBy] ?? 0) + expense.amount;
    }

    const shareAmounts: Record<string, number> = {};
    expense.splitWith.forEach((s) => {
      shareAmounts[s.userId] = (shareAmounts[s.userId] ?? 0) + s.amount;
    });

    const allIds = new Set<string>([
      ...Object.keys(payerAmounts),
      ...Object.keys(shareAmounts),
    ]);

    const net: Record<string, number> = {};
    allIds.forEach((id) => {
      net[id] = roundToCents((payerAmounts[id] ?? 0) - (shareAmounts[id] ?? 0));
    });

    const currentUserNet = net[currentUserId] ?? 0;
    if (currentUserNet === 0) return;

    if (currentUserNet > 0) {
      const totalCredit = Array.from(allIds).reduce(
        (a, id) => a + (net[id] > 0 ? net[id] : 0),
        0
      );
      if (totalCredit === 0) return;
      allIds.forEach((id) => {
        if (id === currentUserId) return;
        if (net[id] < 0 && id in balances) {
          const debtAmt = -net[id];
          balances[id] += (debtAmt * currentUserNet) / totalCredit;
        }
      });
    } else {
      const totalCredit = Array.from(allIds).reduce(
        (a, id) => a + (net[id] > 0 ? net[id] : 0),
        0
      );
      if (totalCredit === 0) return;
      allIds.forEach((id) => {
        if (id === currentUserId) return;
        if (net[id] > 0 && id in balances) {
          const creditAmt = net[id];
          balances[id] -= (-currentUserNet * creditAmt) / totalCredit;
        }
      });
    }
  });

  settlements.forEach((s) => {
    if (s.fromUserId === currentUserId && s.toUserId in balances) {
      balances[s.toUserId] += s.amount;
    } else if (s.toUserId === currentUserId && s.fromUserId in balances) {
      balances[s.fromUserId] -= s.amount;
    }
  });

  Object.keys(balances).forEach((id) => {
    balances[id] = roundToCents(balances[id]);
  });

  return balances;
}

/**
 * Absolute net position of every id in participantIds across all expenses and
 * settlements (NOT relative to any one user). Positive => the user is a net
 * creditor (paid/received more than their share); negative => net debtor.
 * A settlement from->to models real cash moving, reducing the payer's debt
 * (net += amount) and the receiver's claim (net -= amount). Feed the result
 * straight into simplifyDebts to get the minimal set of "who pays whom".
 */
export function computeAbsoluteNet(
  participantIds: string[],
  expenses: BalanceExpense[],
  settlements: SettlementRecord[] = []
): Record<string, number> {
  const net: Record<string, number> = {};
  participantIds.forEach((id) => {
    net[id] = 0;
  });

  expenses.forEach((expense) => {
    if (expense.payers && expense.payers.length > 0) {
      expense.payers.forEach((p) => {
        if (p.userId in net) net[p.userId] += p.amount;
      });
    } else if (expense.paidBy && expense.paidBy in net) {
      net[expense.paidBy] += expense.amount;
    }
    expense.splitWith.forEach((s) => {
      if (s.userId in net) net[s.userId] -= s.amount;
    });
  });

  settlements.forEach((s) => {
    if (s.fromUserId in net) net[s.fromUserId] += s.amount;
    if (s.toUserId in net) net[s.toUserId] -= s.amount;
  });

  Object.keys(net).forEach((id) => {
    net[id] = roundToCents(net[id]);
  });

  return net;
}

/**
 * Debt simplification: given a net map (positive => creditor / is owed,
 * negative => debtor / owes), greedily match the largest debtor against the
 * largest creditor until everyone nets to ~0.
 */
export function simplifyDebts(netByUser: Record<string, number>): Transfer[] {
  const EPS = 0.005;
  const ids = Object.keys(netByUser);

  const creditors = ids
    .filter((id) => netByUser[id] > EPS)
    .map((id) => ({ id, amount: roundToCents(netByUser[id]) }));
  const debtors = ids
    .filter((id) => netByUser[id] < -EPS)
    .map((id) => ({ id, amount: roundToCents(-netByUser[id]) }));

  creditors.sort((a, b) => b.amount - a.amount || ids.indexOf(a.id) - ids.indexOf(b.id));
  debtors.sort((a, b) => b.amount - a.amount || ids.indexOf(a.id) - ids.indexOf(b.id));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = roundToCents(Math.min(debtor.amount, creditor.amount));
    if (amount > EPS) {
      transfers.push({
        fromUserId: debtor.id,
        toUserId: creditor.id,
        amount,
      });
    }
    debtor.amount = roundToCents(debtor.amount - amount);
    creditor.amount = roundToCents(creditor.amount - amount);
    if (debtor.amount <= EPS) i++;
    if (creditor.amount <= EPS) j++;
  }

  return transfers;
}

/** Totals across per-friend balances, from the current user's point of view. */
export interface BalanceTotals {
  /** Sum of everything friends owe the user. */
  totalOwed: number;
  /** Sum of everything the user owes friends, as a positive number. */
  totalOwe: number;
}

/**
 * Split per-friend balances into the two headline figures.
 *
 * Shared by the Dashboard cards and the sidebar summary so the two can't drift.
 * Deliberately keeps the sums separate rather than netting them: "you are owed
 * $50 and owe $50" is a different situation from "you are settled up".
 */
export function summarizeBalances(balances: { balance: number }[]): BalanceTotals {
  let totalOwed = 0;
  let totalOwe = 0;
  for (const { balance } of balances) {
    if (balance > 0) totalOwed += balance;
    else if (balance < 0) totalOwe += Math.abs(balance);
  }
  return { totalOwed: roundToCents(totalOwed), totalOwe: roundToCents(totalOwe) };
}
