/**
 * Phase 4b: writes that touch zero rows must throw rather than look successful.
 *
 * Postgres reports an UPDATE/DELETE matching nothing as a success, and RLS hides
 * non-owned rows instead of erroring — so without an affected-row check a write
 * rejected by policy is silently indistinguishable from one that worked.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

let nextResult: QueryResult;
let calls: { method: string; args: unknown[] }[];

/**
 * Stand-in for a PostgrestFilterBuilder: every method returns the chain, and
 * awaiting it yields `nextResult`. A Proxy keeps this to one small object no
 * matter which builder methods the store uses.
 */
function makeChain(): PromiseLike<QueryResult> {
  const chain: PromiseLike<QueryResult> = new Proxy({} as PromiseLike<QueryResult>, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(nextResult).then(onFulfilled, onRejected);
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return chain;
      };
    },
  });
  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return makeChain();
    },
  },
}));

import {
  purgeExpense,
  purgeGroup,
  setExpenseDeleted,
  setGroupDeleted,
  updateExpense,
  updateGroup,
} from './supabaseStore';
import type { Expense, Group } from '../types';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const EXPENSE: Expense = {
  id: ID,
  description: 'Dinner',
  amount: 30,
  paidBy: OWNER,
  splitWith: [{ userId: OWNER, amount: 30 }],
  date: '2026-01-01T00:00:00.000Z',
  category: 'dining',
  currency: 'USD',
  groupId: null,
  deletedAt: null,
};

const GROUP: Group = { id: ID, name: 'Trip', members: [OWNER], avatar: 'a.png', deletedAt: null };

/** Every write whose WHERE clause can silently match nothing. */
const VERIFIED_WRITES: { name: string; run: () => Promise<void> }[] = [
  { name: 'setExpenseDeleted', run: () => setExpenseDeleted(ID, '2026-01-01T00:00:00.000Z') },
  { name: 'purgeExpense', run: () => purgeExpense(ID) },
  { name: 'setGroupDeleted', run: () => setGroupDeleted(ID, '2026-01-01T00:00:00.000Z') },
  { name: 'purgeGroup', run: () => purgeGroup(ID) },
  { name: 'updateExpense', run: () => updateExpense(OWNER, EXPENSE) },
  { name: 'updateGroup', run: () => updateGroup(OWNER, GROUP) },
];

beforeEach(() => {
  calls = [];
  nextResult = { data: [{ id: ID }], error: null };
});

describe('affected-row verification', () => {
  for (const { name, run } of VERIFIED_WRITES) {
    it(`${name} rejects when the write affected no rows`, async () => {
      nextResult = { data: [], error: null };
      await expect(run()).rejects.toThrow(/no rows affected/);
    });

    it(`${name} rejects when the write returned no data at all`, async () => {
      nextResult = { data: null, error: null };
      await expect(run()).rejects.toThrow(/no rows affected/);
    });

    it(`${name} resolves when a row was affected`, async () => {
      await expect(run()).resolves.toBeUndefined();
    });

    it(`${name} asks the DB which rows changed, so the count is knowable`, async () => {
      await run();
      expect(calls.some((c) => c.method === 'select')).toBe(true);
    });

    it(`${name} still surfaces an explicit DB error`, async () => {
      nextResult = { data: null, error: { message: 'boom' } };
      await expect(run()).rejects.toThrow(/boom/);
    });
  }
});
