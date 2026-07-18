import { describe, it, expect } from 'vitest';
import { resolveSplits, computeBalances, sumSplits } from './splitCalculator';
import { Expense } from '../types';

describe('resolveSplits', () => {
  it('splits equally and sums exactly to the total (no rounding drift)', () => {
    const splits = resolveSplits({
      totalAmount: 100,
      participants: ['a', 'b', 'c'],
      splitType: 'equal',
    });
    expect(splits).toHaveLength(3);
    // 100/3 = 33.33 each, remainder assigned so total is exact
    expect(sumSplits(splits)).toBeCloseTo(100, 5);
    expect(splits.every((s) => s.amount > 0)).toBe(true);
  });

  it('uses custom exact amounts as given', () => {
    const splits = resolveSplits({
      totalAmount: 90,
      participants: ['a', 'b'],
      splitType: 'custom',
      customValues: { a: 60, b: 30 },
    });
    expect(splits).toEqual([
      { userId: 'a', amount: 60 },
      { userId: 'b', amount: 30 },
    ]);
  });

  it('converts percentages into amounts summing to the total', () => {
    const splits = resolveSplits({
      totalAmount: 200,
      participants: ['a', 'b'],
      splitType: 'percentage',
      customValues: { a: 25, b: 75 },
    });
    expect(splits).toEqual([
      { userId: 'a', amount: 50 },
      { userId: 'b', amount: 150 },
    ]);
    expect(sumSplits(splits)).toBeCloseTo(200, 5);
  });

  it('treats a missing custom value as zero', () => {
    const splits = resolveSplits({
      totalAmount: 50,
      participants: ['a', 'b'],
      splitType: 'custom',
      customValues: { a: 50 },
    });
    expect(splits.find((s) => s.userId === 'b')!.amount).toBe(0);
  });
});

describe('computeBalances', () => {
  const you = 'user1';
  const friendIds = ['f1', 'f2'];

  it('is positive when a friend owes you (you paid)', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        description: 'x',
        amount: 30,
        paidBy: 'user1',
        splitWith: [
          { userId: 'user1', amount: 10 },
          { userId: 'f1', amount: 10 },
          { userId: 'f2', amount: 10 },
        ],
        date: '2026-01-01T00:00:00Z',
        category: 'other',
        currency: 'USD',
        groupId: null,
      },
    ];
    const balances = computeBalances(you, friendIds, expenses);
    expect(balances.f1).toBeCloseTo(10, 5);
    expect(balances.f2).toBeCloseTo(10, 5);
  });

  it('is negative when you owe a friend (they paid)', () => {
    const expenses: Expense[] = [
      {
        id: 'e2',
        description: 'y',
        amount: 20,
        paidBy: 'f1',
        splitWith: [
          { userId: 'user1', amount: 10 },
          { userId: 'f1', amount: 10 },
        ],
        date: '2026-01-01T00:00:00Z',
        category: 'other',
        currency: 'USD',
        groupId: null,
      },
    ];
    const balances = computeBalances(you, friendIds, expenses);
    expect(balances.f1).toBeCloseTo(-10, 5);
  });

  it('nets multiple expenses across a friend', () => {
    const expenses: Expense[] = [
      {
        id: 'e1', description: 'x', amount: 20, paidBy: 'user1',
        splitWith: [ { userId: 'user1', amount: 10 }, { userId: 'f1', amount: 10 } ],
        date: '2026-01-01T00:00:00Z', category: 'other', currency: 'USD', groupId: null,
      },
      {
        id: 'e2', description: 'y', amount: 8, paidBy: 'f1',
        splitWith: [ { userId: 'user1', amount: 4 }, { userId: 'f1', amount: 4 } ],
        date: '2026-01-02T00:00:00Z', category: 'other', currency: 'USD', groupId: null,
      },
    ];
    // f1 owes you 10, you owe f1 4 => net f1 owes you 6
    const balances = computeBalances(you, friendIds, expenses);
    expect(balances.f1).toBeCloseTo(6, 5);
  });
});
