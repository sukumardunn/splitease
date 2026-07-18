import { describe, it, expect } from 'vitest';
import {
  resolveSplit,
  validateSplits,
  validatePayers,
  computeNetBalances,
  computeAbsoluteNet,
  simplifyDebts,
  BalanceExpense,
} from './splitEngine';

function sum(amounts: number[]): number {
  return Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
}

describe('resolveSplit - equal', () => {
  it('splits evenly and sums exactly for a clean division', () => {
    const splits = resolveSplit({
      totalAmount: 90,
      participants: ['a', 'b', 'c'],
      mode: 'equal',
    });
    expect(splits).toEqual([
      { userId: 'a', amount: 30 },
      { userId: 'b', amount: 30 },
      { userId: 'c', amount: 30 },
    ]);
  });

  it('reconciles pennies for 100/3, giving the extra cent to the first tied participant', () => {
    const splits = resolveSplit({
      totalAmount: 100,
      participants: ['a', 'b', 'c'],
      mode: 'equal',
    });
    expect(sum(splits.map((s) => s.amount))).toBe(100);
    expect(splits).toEqual([
      { userId: 'a', amount: 33.34 },
      { userId: 'b', amount: 33.33 },
      { userId: 'c', amount: 33.33 },
    ]);
  });

  it('reconciles pennies for 0.10/3', () => {
    const splits = resolveSplit({
      totalAmount: 0.1,
      participants: ['a', 'b', 'c'],
      mode: 'equal',
    });
    expect(sum(splits.map((s) => s.amount))).toBe(0.1);
    expect(splits).toEqual([
      { userId: 'a', amount: 0.04 },
      { userId: 'b', amount: 0.03 },
      { userId: 'c', amount: 0.03 },
    ]);
  });
});

describe('resolveSplit - exact', () => {
  it('uses given values verbatim, missing => 0, no normalisation', () => {
    const splits = resolveSplit({
      totalAmount: 90,
      participants: ['a', 'b', 'c'],
      mode: 'exact',
      values: { a: 60, b: 30 },
    });
    expect(splits).toEqual([
      { userId: 'a', amount: 60 },
      { userId: 'b', amount: 30 },
      { userId: 'c', amount: 0 },
    ]);
    // sum happens to differ from a hypothetical wrong total but matches here
    expect(sum(splits.map((s) => s.amount))).toBe(90);
  });
});

describe('resolveSplit - percentage', () => {
  it('converts percentages and reconciles rounding', () => {
    const splits = resolveSplit({
      totalAmount: 10,
      participants: ['a', 'b', 'c'],
      mode: 'percentage',
      values: { a: 33.33, b: 33.33, c: 33.34 },
    });
    expect(sum(splits.map((s) => s.amount))).toBe(10);
  });

  it('missing value treated as 0 percent (percentages sum to 100)', () => {
    const splits = resolveSplit({
      totalAmount: 200,
      participants: ['a', 'b'],
      mode: 'percentage',
      values: { a: 100 },
    });
    expect(splits).toEqual([
      { userId: 'a', amount: 200 },
      { userId: 'b', amount: 0 },
    ]);
    expect(sum(splits.map((s) => s.amount))).toBe(200);
  });
});

describe('resolveSplit - shares', () => {
  it('splits proportional to share weights', () => {
    const splits = resolveSplit({
      totalAmount: 100,
      participants: ['a', 'b'],
      mode: 'shares',
      values: { a: 1, b: 3 },
    });
    expect(splits).toEqual([
      { userId: 'a', amount: 25 },
      { userId: 'b', amount: 75 },
    ]);
  });

  it('falls back to equal split when all weights are zero', () => {
    const splits = resolveSplit({
      totalAmount: 100,
      participants: ['a', 'b'],
      mode: 'shares',
      values: { a: 0, b: 0 },
    });
    expect(splits).toEqual([
      { userId: 'a', amount: 50 },
      { userId: 'b', amount: 50 },
    ]);
  });

  it('reconciles rounding remainder for uneven shares', () => {
    const splits = resolveSplit({
      totalAmount: 100,
      participants: ['a', 'b', 'c'],
      mode: 'shares',
      values: { a: 1, b: 1, c: 1 },
    });
    expect(sum(splits.map((s) => s.amount))).toBe(100);
  });
});

describe('resolveSplit - adjustment', () => {
  it('applies equal base plus per-user adjustment', () => {
    const splits = resolveSplit({
      totalAmount: 90,
      participants: ['a', 'b', 'c'],
      mode: 'adjustment',
      values: { a: 15 },
    });
    // base = (90 - 15) / 3 = 25 each; a gets 25+15=40, b/c get 25 each
    expect(splits).toEqual([
      { userId: 'a', amount: 40 },
      { userId: 'b', amount: 25 },
      { userId: 'c', amount: 25 },
    ]);
    expect(sum(splits.map((s) => s.amount))).toBe(90);
  });

  it('reconciles remainder on the base part with uneven division', () => {
    const splits = resolveSplit({
      totalAmount: 100,
      participants: ['a', 'b', 'c'],
      mode: 'adjustment',
      values: { a: 10 },
    });
    // base pool = 90 across 3 => 30 each exactly, a = 30+10=40
    expect(sum(splits.map((s) => s.amount))).toBe(100);
    expect(splits.find((s) => s.userId === 'a')!.amount).toBe(40);
  });
});

describe('validateSplits', () => {
  it('is valid when splits sum to the total', () => {
    const result = validateSplits(100, [
      { userId: 'a', amount: 50 },
      { userId: 'b', amount: 50 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.sum).toBe(100);
    expect(result.difference).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it('is invalid when splits do not sum to the total, with a helpful message', () => {
    const result = validateSplits(100, [
      { userId: 'a', amount: 50 },
      { userId: 'b', amount: 40 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.sum).toBe(90);
    expect(result.difference).toBe(-10);
    expect(result.message).toBeDefined();
  });

  it('tolerates a sub-cent difference', () => {
    const result = validateSplits(100, [
      { userId: 'a', amount: 50.005 },
      { userId: 'b', amount: 50 },
    ]);
    expect(result.valid).toBe(true);
  });
});

describe('validatePayers', () => {
  it('is valid when payer contributions sum to the total', () => {
    const result = validatePayers(75, [
      { userId: 'a', amount: 25 },
      { userId: 'b', amount: 50 },
    ]);
    expect(result.valid).toBe(true);
    expect(result.difference).toBe(0);
  });

  it('is invalid when payer contributions fall short', () => {
    const result = validatePayers(75, [
      { userId: 'a', amount: 25 },
      { userId: 'b', amount: 25 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.difference).toBe(-25);
    expect(result.message).toContain('Payers');
  });
});

describe('computeNetBalances - single-payer parity with legacy computeBalances', () => {
  const you = 'user1';
  const friendIds = ['f1', 'f2'];

  it('is positive when a friend owes you (you paid)', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 30,
        paidBy: 'user1',
        splitWith: [
          { userId: 'user1', amount: 10 },
          { userId: 'f1', amount: 10 },
          { userId: 'f2', amount: 10 },
        ],
      },
    ];
    const balances = computeNetBalances(you, friendIds, expenses);
    expect(balances.f1).toBeCloseTo(10, 5);
    expect(balances.f2).toBeCloseTo(10, 5);
  });

  it('is negative when you owe a friend (they paid)', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 20,
        paidBy: 'f1',
        splitWith: [
          { userId: 'user1', amount: 10 },
          { userId: 'f1', amount: 10 },
        ],
      },
    ];
    const balances = computeNetBalances(you, friendIds, expenses);
    expect(balances.f1).toBeCloseTo(-10, 5);
  });

  it('nets multiple expenses across a friend', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 20,
        paidBy: 'user1',
        splitWith: [
          { userId: 'user1', amount: 10 },
          { userId: 'f1', amount: 10 },
        ],
      },
      {
        amount: 8,
        paidBy: 'f1',
        splitWith: [
          { userId: 'user1', amount: 4 },
          { userId: 'f1', amount: 4 },
        ],
      },
    ];
    const balances = computeNetBalances(you, friendIds, expenses);
    expect(balances.f1).toBeCloseTo(6, 5);
  });
});

describe('computeNetBalances - multi-payer', () => {
  it('allocates a shared payment pro-rata across payers', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 90,
        payers: [
          { userId: 'user1', amount: 60 },
          { userId: 'f1', amount: 30 },
        ],
        splitWith: [
          { userId: 'user1', amount: 30 },
          { userId: 'f1', amount: 30 },
          { userId: 'f2', amount: 30 },
        ],
      },
    ];
    const balances = computeNetBalances('user1', ['f1', 'f2'], expenses);
    // user1 net = 60-30=30 (creditor); f1 net = 30-30=0 (breakeven);
    // f2 net = 0-30=-30 (debtor) -> owes user1 the full 30.
    expect(balances.f1).toBeCloseTo(0, 5);
    expect(balances.f2).toBeCloseTo(30, 5);
  });
});

describe('computeNetBalances - settlements', () => {
  it('a friend paying the current user back reduces what the friend owes', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 30,
        paidBy: 'user1',
        splitWith: [
          { userId: 'user1', amount: 10 },
          { userId: 'f1', amount: 20 },
        ],
      },
    ];
    const balances = computeNetBalances('user1', ['f1'], expenses, [
      { fromUserId: 'f1', toUserId: 'user1', amount: 4 },
    ]);
    expect(balances.f1).toBeCloseTo(16, 5);
  });

  it('the current user paying a friend back reduces what the user owes', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 20,
        paidBy: 'f1',
        splitWith: [
          { userId: 'user1', amount: 10 },
          { userId: 'f1', amount: 10 },
        ],
      },
    ];
    const balances = computeNetBalances('user1', ['f1'], expenses, [
      { fromUserId: 'user1', toUserId: 'f1', amount: 4 },
    ]);
    expect(balances.f1).toBeCloseTo(-6, 5);
  });
});

describe('simplifyDebts', () => {
  it('produces a single transfer for a 2-person imbalance', () => {
    const transfers = simplifyDebts({ a: 10, b: -10 });
    expect(transfers).toEqual([{ fromUserId: 'b', toUserId: 'a', amount: 10 }]);
  });

  it('settles a 3-person fan-in with two transfers', () => {
    const transfers = simplifyDebts({ a: 5, b: 3, c: -8 });
    expect(transfers).toEqual([
      { fromUserId: 'c', toUserId: 'a', amount: 5 },
      { fromUserId: 'c', toUserId: 'b', amount: 3 },
    ]);
  });

  it('produces no transfers when everyone is already settled', () => {
    const transfers = simplifyDebts({ a: 0, b: 0 });
    expect(transfers).toEqual([]);
  });

  it('every transfer set nets each participant back to zero', () => {
    const net = { a: 12, b: -5, c: -7 };
    const transfers = simplifyDebts(net);
    const totals: Record<string, number> = { a: 0, b: 0, c: 0 };
    transfers.forEach((t) => {
      totals[t.fromUserId] -= t.amount;
      totals[t.toUserId] += t.amount;
    });
    expect(Math.round((totals.a - net.a) * 100)).toBe(0);
    expect(Math.round((totals.b - net.b) * 100)).toBe(0);
    expect(Math.round((totals.c - net.c) * 100)).toBe(0);
  });
});

describe('computeAbsoluteNet + simplifyDebts round-trip', () => {
  it('nets a single-payer expense: payer is creditor, others debtors', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 30,
        paidBy: 'a',
        splitWith: [
          { userId: 'a', amount: 10 },
          { userId: 'b', amount: 10 },
          { userId: 'c', amount: 10 },
        ],
      },
    ];
    const net = computeAbsoluteNet(['a', 'b', 'c'], expenses);
    expect(net.a).toBeCloseTo(20, 5); // paid 30, share 10
    expect(net.b).toBeCloseTo(-10, 5);
    expect(net.c).toBeCloseTo(-10, 5);
    // whole system nets to zero
    expect(net.a + net.b + net.c).toBeCloseTo(0, 5);
  });

  it('handles multi-payer contributions', () => {
    const expenses: BalanceExpense[] = [
      {
        amount: 100,
        payers: [
          { userId: 'a', amount: 60 },
          { userId: 'b', amount: 40 },
        ],
        splitWith: [
          { userId: 'a', amount: 50 },
          { userId: 'b', amount: 50 },
        ],
      },
    ];
    const net = computeAbsoluteNet(['a', 'b'], expenses);
    expect(net.a).toBeCloseTo(10, 5); // paid 60 - share 50
    expect(net.b).toBeCloseTo(-10, 5);
  });

  it('a settlement reduces the debtor/creditor gap toward zero', () => {
    const expenses: BalanceExpense[] = [
      { amount: 20, paidBy: 'a', splitWith: [ { userId: 'a', amount: 10 }, { userId: 'b', amount: 10 } ] },
    ];
    const before = computeAbsoluteNet(['a', 'b'], expenses);
    expect(before.b).toBeCloseTo(-10, 5);
    const after = computeAbsoluteNet(['a', 'b'], expenses, [
      { fromUserId: 'b', toUserId: 'a', amount: 10 },
    ]);
    expect(after.a).toBeCloseTo(0, 5);
    expect(after.b).toBeCloseTo(0, 5);
  });

  it('simplifyDebts settles the computed net with valid transfers', () => {
    const expenses: BalanceExpense[] = [
      { amount: 30, paidBy: 'a', splitWith: [ { userId: 'a', amount: 10 }, { userId: 'b', amount: 10 }, { userId: 'c', amount: 10 } ] },
    ];
    const net = computeAbsoluteNet(['a', 'b', 'c'], expenses);
    const transfers = simplifyDebts(net);
    // apply transfers back and confirm everyone nets to ~0
    const applied = { ...net };
    transfers.forEach((t) => {
      applied[t.fromUserId] += t.amount;
      applied[t.toUserId] -= t.amount;
    });
    Object.values(applied).forEach((v) => expect(Math.abs(v)).toBeLessThanOrEqual(0.01));
    // all transfers point at creditor 'a'
    expect(transfers.every((t) => t.toUserId === 'a')).toBe(true);
  });

  it('produces no transfers when everyone is settled', () => {
    expect(simplifyDebts({ a: 0, b: 0, c: 0 })).toEqual([]);
  });
});
