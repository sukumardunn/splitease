/**
 * Phase 5a: the CSV import batch write and its undo.
 *
 * Both are multi-table sequences with no transaction available over the REST API,
 * so what matters is the *order* of the statements and what happens when one of
 * them fails partway. Those are the properties asserted here.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface Call {
  table: string;
  method: string;
  args: unknown[];
  /** Which `from()` builder this call belongs to — one chain is one statement. */
  chain: number;
}

let calls: Call[] = [];
let chainCount = 0;
/** Keyed `table.verb` (the first builder method); the fallback is an empty set. */
let handlers: Record<string, QueryResult> = {};

function resultFor(table: string, methods: string[]): QueryResult {
  const verb = methods[0] ?? 'select';
  const hit = handlers[`${table}.${verb}`] ?? { data: [], error: null };
  if (methods.includes('single')) {
    const rows = Array.isArray(hit.data) ? hit.data : [hit.data];
    return { data: rows[0] ?? null, error: hit.error };
  }
  return hit;
}

/**
 * Stand-in for a PostgrestFilterBuilder, per the pattern in
 * supabaseStore.writes.test.ts but table-aware so a multi-table sequence can be
 * given a different answer per table.
 */
function makeChain(table: string): PromiseLike<QueryResult> {
  const methods: string[] = [];
  const id = ++chainCount;
  const chain: PromiseLike<QueryResult> = new Proxy({} as PromiseLike<QueryResult>, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(resultFor(table, methods)).then(onFulfilled, onRejected);
      }
      return (...args: unknown[]) => {
        methods.push(String(prop));
        calls.push({ table, method: String(prop), args, chain: id });
        return chain;
      };
    },
  });
  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => makeChain(table) },
}));

import { importCsvBatch, undoImportBatch } from './supabaseStore';
import type { Expense, Friend } from '../types';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const BATCH = 'cccccccc-0000-4000-8000-000000000001';
const FRIEND_ID = 'dddddddd-0000-4000-8000-000000000001';

const BATCH_ROW = {
  id: BATCH,
  owner_id: OWNER,
  source: 'csv',
  filename: 'splitwise.csv',
  expense_count: 1,
  friend_count: 1,
  undone_at: null,
  created_at: '2026-07-25T00:00:00+00:00',
};

const NEW_FRIEND: Friend = { id: FRIEND_ID, name: 'Bob', email: '', avatar: 'b.svg' };

const IMPORTED_EXPENSE: Expense = {
  id: 'bbbbbbbb-0000-4000-8000-000000000001',
  description: 'Dinner',
  amount: 50,
  paidBy: OWNER,
  payers: [{ userId: OWNER, amount: 50 }],
  splitWith: [
    { userId: OWNER, amount: 25 },
    { userId: FRIEND_ID, amount: 25 },
  ],
  date: '2026-03-01T12:00:00.000Z',
  category: 'dining',
  currency: 'USD',
  groupId: null,
  deletedAt: null,
};

/**
 * One `table.verb` entry per statement, in the order issued. Only the first
 * method of each chain counts — `.insert(...).select()` is one INSERT, not two.
 */
function sequence(): string[] {
  const seen = new Set<number>();
  return calls
    .filter((c) => !seen.has(c.chain) && (seen.add(c.chain), true))
    .map((c) => `${c.table}.${c.method}`);
}

function payloadFor(table: string, method: string): Record<string, unknown>[] {
  const call = calls.find((c) => c.table === table && c.method === method);
  const arg = call?.args[0];
  return (Array.isArray(arg) ? arg : [arg]) as Record<string, unknown>[];
}

beforeEach(() => {
  calls = [];
  chainCount = 0;
  handlers = {
    'import_batches.insert': { data: [BATCH_ROW], error: null },
    'import_batches.update': { data: [{ id: BATCH }], error: null },
  };
});

describe('importCsvBatch', () => {
  const payload = {
    friends: [NEW_FRIEND],
    expenses: [IMPORTED_EXPENSE],
    filename: 'splitwise.csv',
  };

  it('writes the batch row before the rows that reference it', async () => {
    await importCsvBatch(OWNER, BATCH, payload);
    expect(sequence()).toEqual([
      'import_batches.insert',
      'friends.insert',
      'expenses.insert',
      'expense_payers.insert',
      'expense_splits.insert',
    ]);
  });

  it('tags both the friends and the expenses with the batch id', async () => {
    await importCsvBatch(OWNER, BATCH, payload);
    expect(payloadFor('friends', 'insert')[0]).toMatchObject({
      id: FRIEND_ID,
      owner_id: OWNER,
      import_batch_id: BATCH,
    });
    expect(payloadFor('expenses', 'insert')[0]).toMatchObject({
      description: 'Dinner',
      import_batch_id: BATCH,
    });
  });

  it('records the counts on the batch row and returns the mapped batch', async () => {
    const batch = await importCsvBatch(OWNER, BATCH, payload);
    expect(payloadFor('import_batches', 'insert')[0]).toMatchObject({
      expense_count: 1,
      friend_count: 1,
      filename: 'splitwise.csv',
      source: 'csv',
    });
    expect(batch).toEqual({
      id: BATCH,
      source: 'csv',
      filename: 'splitwise.csv',
      expenseCount: 1,
      friendCount: 1,
      undoneAt: null,
      createdAt: '2026-07-25T00:00:00.000Z',
    });
  });

  it('rolls the batch back and rethrows when a later insert fails', async () => {
    handlers['expenses.insert'] = { data: null, error: { message: 'boom' } };

    await expect(importCsvBatch(OWNER, BATCH, payload)).rejects.toThrow(/boom/);

    // The undo path ran: expenses deleted by batch id, batch stamped undone.
    expect(sequence()).toContain('expenses.delete');
    const deleteCall = calls.findIndex((c) => c.table === 'expenses' && c.method === 'delete');
    expect(calls[deleteCall + 1]).toMatchObject({ method: 'eq', args: ['import_batch_id', BATCH] });
    expect(sequence()).toContain('import_batches.update');
  });

  it('surfaces the original failure even if the rollback also fails', async () => {
    handlers['expenses.insert'] = { data: null, error: { message: 'boom' } };
    handlers['expenses.delete'] = { data: null, error: { message: 'cleanup exploded' } };

    await expect(importCsvBatch(OWNER, BATCH, payload)).rejects.toThrow(/boom/);
  });

  it('throws without touching anything else when the batch row cannot be created', async () => {
    handlers['import_batches.insert'] = { data: null, error: { message: 'denied' } };
    await expect(importCsvBatch(OWNER, BATCH, payload)).rejects.toThrow(/denied/);
    expect(sequence()).toEqual(['import_batches.insert']);
  });

  it('skips the friends insert when the import creates none', async () => {
    await importCsvBatch(OWNER, BATCH, { ...payload, friends: [] });
    expect(sequence()).not.toContain('friends.insert');
  });
});

describe('undoImportBatch', () => {
  it('deletes the batch expenses by batch id and reports the count', async () => {
    handlers['expenses.delete'] = { data: [{ id: 'e1' }, { id: 'e2' }], error: null };
    const result = await undoImportBatch(BATCH);
    expect(result.expensesRemoved).toBe(2);
    const deleteCall = calls.findIndex((c) => c.table === 'expenses' && c.method === 'delete');
    expect(calls[deleteCall + 1]).toMatchObject({ args: ['import_batch_id', BATCH] });
  });

  it('removes a batch friend that nothing else references', async () => {
    handlers['friends.select'] = { data: [{ id: FRIEND_ID }], error: null };
    handlers['friends.delete'] = { data: [{ id: FRIEND_ID }], error: null };

    const result = await undoImportBatch(BATCH);
    expect(result).toMatchObject({ friendsRemoved: 1, friendsKept: 0 });
    const del = calls.find((c) => c.table === 'friends' && c.method === 'in');
    expect(del).toMatchObject({ args: ['id', [FRIEND_ID]] });
  });

  it.each([
    ['an expense split', 'expense_splits.select', { person_id: FRIEND_ID }],
    ['an expense payer', 'expense_payers.select', { person_id: FRIEND_ID }],
    ['a group membership', 'group_members.select', { person_id: FRIEND_ID }],
  ])('keeps a batch friend still referenced by %s', async (_label, key, row) => {
    handlers['friends.select'] = { data: [{ id: FRIEND_ID }], error: null };
    handlers[key] = { data: [row], error: null };

    const result = await undoImportBatch(BATCH);
    expect(result).toMatchObject({ friendsRemoved: 0, friendsKept: 1 });
    expect(calls.some((c) => c.table === 'friends' && c.method === 'delete')).toBe(false);
  });

  it('keeps a batch friend on either side of a settlement', async () => {
    handlers['friends.select'] = { data: [{ id: FRIEND_ID }], error: null };
    handlers['settlements.select'] = {
      data: [{ from_person_id: 'someone', to_person_id: FRIEND_ID }],
      error: null,
    };
    expect(await undoImportBatch(BATCH)).toMatchObject({ friendsKept: 1 });
  });

  it('checks friend references only after deleting the expenses', async () => {
    // Otherwise a share that is about to disappear would still count as a
    // reference, and the friend would be preserved for no reason.
    handlers['friends.select'] = { data: [{ id: FRIEND_ID }], error: null };
    await undoImportBatch(BATCH);

    const expenseDelete = calls.findIndex((c) => c.table === 'expenses' && c.method === 'delete');
    const splitLookup = calls.findIndex((c) => c.table === 'expense_splits');
    expect(expenseDelete).toBeGreaterThanOrEqual(0);
    expect(splitLookup).toBeGreaterThan(expenseDelete);
  });

  it('stamps the batch undone', async () => {
    await undoImportBatch(BATCH);
    const update = calls.find((c) => c.table === 'import_batches' && c.method === 'update');
    expect((update?.args[0] as { undone_at: string }).undone_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
  });

  it('throws when the batch does not exist or is not the caller’s', async () => {
    handlers['import_batches.update'] = { data: [], error: null };
    await expect(undoImportBatch(BATCH)).rejects.toThrow(/no rows affected/);
  });

  it('succeeds with zero counts when there is nothing left to undo', async () => {
    const result = await undoImportBatch(BATCH);
    expect(result).toEqual({ expensesRemoved: 0, friendsRemoved: 0, friendsKept: 0 });
    // No friends in the batch means the reference lookups are skipped entirely.
    expect(calls.some((c) => c.table === 'expense_splits')).toBe(false);
  });

  it('surfaces a DB error from the expense delete', async () => {
    handlers['expenses.delete'] = { data: null, error: { message: 'nope' } };
    await expect(undoImportBatch(BATCH)).rejects.toThrow(/nope/);
  });
});
