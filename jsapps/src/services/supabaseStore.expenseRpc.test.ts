/**
 * Writing an expense and its children must be atomic — on create as well as edit.
 *
 * `updateExpense`'s old four-call version (upsert, delete payers, delete splits,
 * re-insert) could fail between the deletes and the insert; `insertExpense`'s old
 * two-call version could fail between the parent insert and the child insert.
 * Either way the expense survived with zero split rows — an invisible data loss,
 * because AppContext restores only its in-memory snapshot and reports "it was
 * undone". These tests pin the shape that makes that impossible: one RPC per
 * write, whose body is one transaction, and a failure that reaches the caller as
 * an error rather than as a silent success.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

let nextRpcResult: RpcResult;
let rpcCalls: { fn: string; args: Record<string, unknown> }[];
let fromCalls: string[];

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(nextRpcResult);
    },
    // Present only so an accidental REST path is observable instead of a TypeError.
    from: (table: string) => {
      fromCalls.push(table);
      throw new Error(`unexpected REST call to ${table}`);
    },
  },
}));

import { insertExpense, updateExpense } from './supabaseStore';
import type { Expense } from '../types';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const FRIEND = 'cccccccc-0000-4000-8000-000000000001';

const EXPENSE: Expense = {
  id: ID,
  description: 'Dinner',
  amount: 30,
  paidBy: OWNER,
  payers: [{ userId: OWNER, amount: 30 }],
  splitWith: [
    { userId: OWNER, amount: 15 },
    { userId: FRIEND, amount: 15 },
  ],
  date: '2026-01-01T00:00:00.000Z',
  category: 'dining',
  currency: 'USD',
  groupId: null,
  deletedAt: null,
};

beforeEach(() => {
  rpcCalls = [];
  fromCalls = [];
  nextRpcResult = { data: ID, error: null };
});

/**
 * Create and edit share the store helper *and* the SQL function: the function
 * upserts, so a fresh id takes its insert path and an existing id its update path.
 * Only the error prefix differs, so both are held to the same contract here.
 */
const WRITERS: { name: string; prefix: string; run: (e: Expense) => Promise<void> }[] = [
  { name: 'insertExpense', prefix: 'insert expense', run: (e) => insertExpense(OWNER, e) },
  { name: 'updateExpense', prefix: 'update expense', run: (e) => updateExpense(OWNER, e) },
];

for (const { name, prefix, run } of WRITERS) {
  describe(`${name} goes through the atomic RPC`, () => {
    it('issues exactly one request, and it is the RPC', async () => {
      await run(EXPENSE);
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0].fn).toBe('update_expense_with_children');
      expect(fromCalls).toEqual([]);
    });

    it('sends the parent row and both child arrays in that single call', async () => {
      await run(EXPENSE);
      const { p_expense, p_payers, p_splits } = rpcCalls[0].args as {
        p_expense: Record<string, unknown>;
        p_payers: unknown[];
        p_splits: unknown[];
      };
      expect(p_expense).toMatchObject({
        id: ID,
        owner_id: OWNER,
        description: 'Dinner',
        amount: 30,
        paid_by: OWNER,
        category: 'dining',
        currency: 'USD',
        group_id: null,
      });
      expect(p_payers).toEqual([{ expense_id: ID, person_id: OWNER, amount: 30 }]);
      expect(p_splits).toEqual([
        { expense_id: ID, person_id: OWNER, amount: 15 },
        { expense_id: ID, person_id: FRIEND, amount: 15 },
      ]);
    });

    it('sends an empty payers array rather than omitting it, so stale payers are cleared', async () => {
      await run({ ...EXPENSE, payers: undefined });
      const args = rpcCalls[0].args as { p_payers: unknown[] };
      expect(args.p_payers).toEqual([]);
    });

    it('resolves when the function returns the id it wrote', async () => {
      await expect(run(EXPENSE)).resolves.toBeUndefined();
    });
  });

  describe(`${name} surfaces failures instead of silently succeeding`, () => {
    it('rejects with the DB error message when the RPC errors', async () => {
      nextRpcResult = { data: null, error: { message: 'boom' } };
      await expect(run(EXPENSE)).rejects.toThrow(new RegExp(`${prefix}: boom`));
    });

    it('rejects when the RPC reports a permission failure rather than dropping the write', async () => {
      nextRpcResult = {
        data: null,
        error: { message: 'new row violates row-level security policy for table "expenses"' },
      };
      await expect(run(EXPENSE)).rejects.toThrow(/row-level security/);
    });

    it('rejects when the function returns null — the upsert matched nothing', async () => {
      nextRpcResult = { data: null, error: null };
      await expect(run(EXPENSE)).rejects.toThrow(/no rows affected/);
    });

    it('rejects when the function returns some other expense id', async () => {
      nextRpcResult = { data: 'dddddddd-0000-4000-8000-000000000001', error: null };
      await expect(run(EXPENSE)).rejects.toThrow(/no rows affected/);
    });
  });
}
