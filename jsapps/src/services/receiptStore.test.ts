/**
 * The load-bearing property of the receipt design is *what is not fetched*.
 *
 * Image bytes live in Postgres (`expense_receipts`, migration 20260725000005),
 * and the app fetches every expense on startup — so if the receipt index ever
 * selected `data_base64`, every page load would drag every receipt down with it
 * and the separate table would have bought nothing. These tests assert the exact
 * column lists, not just the results.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

interface Recorded {
  table: string;
  op: string;
  columns?: string;
  payload?: unknown;
  options?: unknown;
  filters: [string, string][];
}

let calls: Recorded[];
let nextResult: { data: unknown; error: { message: string } | null };

/**
 * Minimal chainable stand-in for the supabase client, recording what was asked
 * for. Every method returns the same builder, and awaiting it yields
 * `nextResult` — enough for the call shapes this module makes.
 */
function builder(table: string, op: string): Record<string, unknown> {
  const record: Recorded = { table, op, filters: [] };
  calls.push(record);
  const chain: Record<string, unknown> = {
    select: (columns?: string) => {
      record.columns = columns;
      return chain;
    },
    eq: (column: string, value: string) => {
      record.filters.push([column, value]);
      return chain;
    },
    maybeSingle: () => Promise.resolve(nextResult),
    single: () => Promise.resolve(nextResult),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult).then(resolve),
  };
  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns?: string) => {
        const chain = builder(table, 'select');
        (chain.select as (c?: string) => unknown)(columns);
        return chain;
      },
      upsert: (payload: unknown, options: unknown) => {
        const chain = builder(table, 'upsert');
        calls[calls.length - 1].payload = payload;
        calls[calls.length - 1].options = options;
        return chain;
      },
      delete: () => builder(table, 'delete'),
    }),
  },
}));

import {
  deleteReceipt,
  fetchReceipt,
  fetchReceiptIndex,
  receiptMetaFromRow,
  upsertReceipt,
} from './receiptStore';
import type { EncodedReceipt } from './receiptImage';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const EXPENSE = 'bbbbbbbb-0000-4000-8000-000000000001';

const META_ROW = {
  expense_id: EXPENSE,
  mime_type: 'image/jpeg',
  byte_size: 4096,
  created_at: '2026-07-25T10:00:00+00:00',
};

const ENCODED: EncodedReceipt = {
  mimeType: 'image/jpeg',
  byteSize: 4096,
  dataBase64: 'QUJD',
  width: 1600,
  height: 1067,
};

beforeEach(() => {
  calls = [];
  nextResult = { data: [META_ROW], error: null };
});

describe('receiptMetaFromRow', () => {
  it('normalizes +00:00 timestamps to Z-form ISO, like the other mappers', () => {
    expect(receiptMetaFromRow(META_ROW)).toEqual({
      expenseId: EXPENSE,
      mimeType: 'image/jpeg',
      byteSize: 4096,
      createdAt: '2026-07-25T10:00:00.000Z',
    });
  });
});

describe('fetchReceiptIndex', () => {
  it('selects metadata columns only — never the payload', () => {
    // The whole point of the separate table. A `select('*')` here would put every
    // receipt in the startup load.
    void fetchReceiptIndex();
    expect(calls[0].columns).toBe('expense_id, mime_type, byte_size, created_at');
    expect(calls[0].columns).not.toContain('data_base64');
    expect(calls[0].columns).not.toBe('*');
  });

  it('keys the result by expense id', async () => {
    const index = await fetchReceiptIndex();
    expect(index[EXPENSE].byteSize).toBe(4096);
  });

  it('returns an empty index rather than throwing when there are no receipts', async () => {
    nextResult = { data: [], error: null };
    await expect(fetchReceiptIndex()).resolves.toEqual({});
  });

  it('throws a prefixed error so AppContext can log it', async () => {
    nextResult = { data: null, error: { message: 'permission denied' } };
    await expect(fetchReceiptIndex()).rejects.toThrow('fetch receipts: permission denied');
  });
});

describe('fetchReceipt', () => {
  it('is the one query that reads bytes, and reads exactly one row', async () => {
    nextResult = { data: { ...META_ROW, owner_id: OWNER, data_base64: 'QUJD' }, error: null };
    const receipt = await fetchReceipt(EXPENSE);
    expect(calls[0].columns).toBe('*');
    expect(calls[0].filters).toEqual([['expense_id', EXPENSE]]);
    expect(receipt).toEqual({
      expenseId: EXPENSE,
      mimeType: 'image/jpeg',
      byteSize: 4096,
      createdAt: '2026-07-25T10:00:00.000Z',
      dataBase64: 'QUJD',
    });
  });

  it('returns null when the expense has no receipt', async () => {
    nextResult = { data: null, error: null };
    await expect(fetchReceipt(EXPENSE)).resolves.toBeNull();
  });

  it('throws on a query error', async () => {
    nextResult = { data: null, error: { message: 'boom' } };
    await expect(fetchReceipt(EXPENSE)).rejects.toThrow('fetch receipt: boom');
  });
});

describe('upsertReceipt', () => {
  it('writes the row the schema expects and conflicts on the expense id', async () => {
    nextResult = { data: META_ROW, error: null };
    await upsertReceipt(OWNER, EXPENSE, ENCODED);

    expect(calls[0].payload).toEqual({
      expense_id: EXPENSE,
      owner_id: OWNER,
      mime_type: 'image/jpeg',
      byte_size: 4096,
      data_base64: 'QUJD',
    });
    // One receipt per expense: replacing must update, not fail on the PK.
    expect(calls[0].options).toEqual({ onConflict: 'expense_id' });
  });

  it('stores base64 without a data: prefix', async () => {
    nextResult = { data: META_ROW, error: null };
    await upsertReceipt(OWNER, EXPENSE, ENCODED);
    const payload = calls[0].payload as { data_base64: string };
    expect(payload.data_base64.startsWith('data:')).toBe(false);
  });

  it('reads back metadata only, so a save does not echo the payload', async () => {
    nextResult = { data: META_ROW, error: null };
    const meta = await upsertReceipt(OWNER, EXPENSE, ENCODED);
    expect(calls[0].columns).toBe('expense_id, mime_type, byte_size, created_at');
    expect(meta.byteSize).toBe(4096);
  });

  it('surfaces a CHECK or RLS rejection as an error', async () => {
    // e.g. 23514 from `byte_size <= 524288`, or 42501 from the policy.
    nextResult = { data: null, error: { message: 'new row violates check constraint' } };
    await expect(upsertReceipt(OWNER, EXPENSE, ENCODED)).rejects.toThrow(
      'save receipt: new row violates check constraint'
    );
  });

  it('treats a permitted-but-empty result as a failure', async () => {
    nextResult = { data: null, error: null };
    await expect(upsertReceipt(OWNER, EXPENSE, ENCODED)).rejects.toThrow(/no rows affected/);
  });
});

describe('deleteReceipt', () => {
  it('deletes by expense id', async () => {
    nextResult = { data: [], error: null };
    await deleteReceipt(EXPENSE);
    expect(calls[0].op).toBe('delete');
    expect(calls[0].filters).toEqual([['expense_id', EXPENSE]]);
  });

  it('succeeds when there was nothing to delete', async () => {
    // "This expense should have no receipt" is satisfied either way, and the
    // client's index can legitimately be a moment stale.
    nextResult = { data: [], error: null };
    await expect(deleteReceipt(EXPENSE)).resolves.toBeUndefined();
  });

  it('throws on a delete error', async () => {
    nextResult = { data: null, error: { message: 'nope' } };
    await expect(deleteReceipt(EXPENSE)).rejects.toThrow('remove receipt: nope');
  });
});
