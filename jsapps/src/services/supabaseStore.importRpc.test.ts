/**
 * `importState` must write all eight tables atomically.
 *
 * The old version issued up to eight sequential REST inserts (friends → groups →
 * group_members → expenses → expense_payers → expense_splits → settlements →
 * activity_events). Each REST call is its own transaction, and there was no
 * try/catch, no compensating delete and no batch tag — so any of seven failure
 * points left a half-imported account with nothing marking which rows had landed.
 * The CSV importer's clean-up-by-batch-id trick cannot rescue this path either,
 * because `activity_events` is append-only (20260724000001) and step 8 therefore
 * cannot be deleted from the client.
 *
 * These tests pin the shape that makes a partial import impossible: ONE request,
 * and it is the `import_state` RPC (whose body is one transaction), carrying every
 * bundle the REST version used to send one-by-one; plus a returned per-table row
 * count that must match what was sent, so a short import reaches the caller as an
 * error rather than as a silent success.
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

import { importState, type ImportPayload } from './supabaseStore';
import type { Expense, Friend, Group, Settlement } from '../types';
import type { ActivityEvent } from './activityLog';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const FRIEND = 'bbbbbbbb-0000-4000-8000-000000000001';
const GROUP = 'cccccccc-0000-4000-8000-000000000001';
const EXPENSE = 'dddddddd-0000-4000-8000-000000000001';
const SETTLEMENT = 'eeeeeeee-0000-4000-8000-000000000001';
const EVENT = 'ffffffff-0000-4000-8000-000000000001';

const A_FRIEND: Friend = { id: FRIEND, name: 'Ana', email: 'a@x.com', avatar: 'a.svg' };
const A_GROUP: Group = {
  id: GROUP,
  name: 'Trip',
  avatar: 'g.svg',
  members: [OWNER, FRIEND],
  deletedAt: null,
};
const AN_EXPENSE: Expense = {
  id: EXPENSE,
  description: 'Dinner',
  amount: 50,
  paidBy: OWNER,
  payers: [{ userId: OWNER, amount: 50 }],
  splitWith: [
    { userId: OWNER, amount: 25 },
    { userId: FRIEND, amount: 25 },
  ],
  date: '2026-03-01T12:00:00.000Z',
  category: 'dining',
  currency: 'USD',
  groupId: GROUP,
  deletedAt: null,
};
const A_SETTLEMENT: Settlement = {
  id: SETTLEMENT,
  fromUserId: FRIEND,
  toUserId: OWNER,
  amount: 25,
  currency: 'USD',
  date: '2026-03-02T12:00:00.000Z',
  groupId: GROUP,
  deletedAt: null,
};
const AN_EVENT: ActivityEvent = {
  id: EVENT,
  actorId: OWNER,
  action: 'expense.create',
  entityType: 'expense',
  entityId: EXPENSE,
  groupId: GROUP,
  before: null,
  after: { description: 'Dinner' },
  createdAt: '2026-03-01T12:00:01.000Z',
};

const FULL: ImportPayload = {
  friends: [A_FRIEND],
  groups: [A_GROUP],
  expenses: [AN_EXPENSE],
  settlements: [A_SETTLEMENT],
  activityEvents: [AN_EVENT],
};

/** Counts the function would return for `FULL` when every row lands. */
const FULL_COUNTS = {
  friends: 1,
  groups: 1,
  group_members: 2,
  expenses: 1,
  expense_payers: 1,
  expense_splits: 2,
  settlements: 1,
  activity_events: 1,
};

const EMPTY: ImportPayload = {
  friends: [],
  groups: [],
  expenses: [],
  settlements: [],
  activityEvents: [],
};

const ZERO_COUNTS = Object.fromEntries(Object.keys(FULL_COUNTS).map((k) => [k, 0]));

function args(): Record<string, Record<string, unknown>[]> {
  return rpcCalls[0].args as Record<string, Record<string, unknown>[]>;
}

beforeEach(() => {
  rpcCalls = [];
  fromCalls = [];
  nextRpcResult = { data: FULL_COUNTS, error: null };
});

describe('importState goes through the atomic RPC', () => {
  it('issues exactly one request, and it is the RPC', async () => {
    await importState(OWNER, FULL);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('import_state');
    expect(fromCalls).toEqual([]);
  });

  it('sends all eight bundles in that single call', async () => {
    await importState(OWNER, FULL);
    expect(Object.keys(args()).sort()).toEqual([
      'p_activity_events',
      'p_expense_payers',
      'p_expense_splits',
      'p_expenses',
      'p_friends',
      'p_group_members',
      'p_groups',
      'p_settlements',
    ]);
  });

  it('stamps every parent row with the owner id', async () => {
    await importState(OWNER, FULL);
    const a = args();
    for (const key of ['p_friends', 'p_groups', 'p_expenses', 'p_settlements', 'p_activity_events']) {
      expect(a[key][0]).toMatchObject({ owner_id: OWNER });
    }
  });

  it('flattens the child rows across parents, each tagged with its parent id', async () => {
    await importState(OWNER, FULL);
    const a = args();
    expect(a.p_group_members).toEqual([
      { group_id: GROUP, person_id: OWNER },
      { group_id: GROUP, person_id: FRIEND },
    ]);
    expect(a.p_expense_payers).toEqual([{ expense_id: EXPENSE, person_id: OWNER, amount: 50 }]);
    expect(a.p_expense_splits).toEqual([
      { expense_id: EXPENSE, person_id: OWNER, amount: 25 },
      { expense_id: EXPENSE, person_id: FRIEND, amount: 25 },
    ]);
  });

  it('sends empty arrays rather than omitting a bundle, so the count check is well defined', async () => {
    nextRpcResult = { data: ZERO_COUNTS, error: null };
    await importState(OWNER, EMPTY);
    expect(rpcCalls).toHaveLength(1);
    for (const value of Object.values(args())) {
      expect(value).toEqual([]);
    }
  });

  // Regression guard for client/SQL drift. `import_state` names every `expenses`
  // column explicitly, so a column the client sends but the function does not name
  // is silently dropped — which is exactly what happened to `split_mode`: it landed
  // one migration after the import function was written, and imported expenses took
  // the column default until 20260725000007 named it. This test pins the client half
  // (the payload really carries the mode); the SQL half is pinned by that migration.
  it('carries split_mode in the expense payload, including a null for unrecorded intent', async () => {
    await importState(OWNER, { ...FULL, expenses: [{ ...AN_EXPENSE, splitMode: 'percentage' }] });
    expect(args().p_expenses[0]).toMatchObject({ split_mode: 'percentage' });

    rpcCalls = [];
    await importState(OWNER, FULL);
    // AN_EXPENSE has no splitMode, and the column's NULL means "intent not
    // recorded" — so this must be an explicit null, never omitted and never ''.
    expect(args().p_expenses[0]).toHaveProperty('split_mode', null);
  });

  it('surfaces an RPC error as a thrown import failure', async () => {
    nextRpcResult = { data: null, error: { message: 'permission denied for table friends' } };
    await expect(importState(OWNER, FULL)).rejects.toThrow(/import: permission denied/);
  });

  it.each([
    ['friends'],
    ['groups'],
    ['group_members'],
    ['expenses'],
    ['expense_payers'],
    ['expense_splits'],
    ['settlements'],
    ['activity_events'],
  ])('throws when the returned %s count is short of what was sent', async (table) => {
    nextRpcResult = { data: { ...FULL_COUNTS, [table]: 0 }, error: null };
    await expect(importState(OWNER, FULL)).rejects.toThrow(
      new RegExp(`import: ${table}: imported 0 row\\(s\\) of \\d+`)
    );
  });

  it('throws when the function returns no counts at all', async () => {
    nextRpcResult = { data: null, error: null };
    await expect(importState(OWNER, FULL)).rejects.toThrow(/imported no row\(s\)/);
  });

  it('throws when a count is missing for a table that had rows', async () => {
    const withoutFriends: Record<string, number> = { ...FULL_COUNTS };
    delete withoutFriends.friends;
    nextRpcResult = { data: withoutFriends, error: null };
    await expect(importState(OWNER, FULL)).rejects.toThrow(/import: friends: imported no row\(s\) of 1/);
  });

  it('resolves when every returned count matches what was sent', async () => {
    await expect(importState(OWNER, FULL)).resolves.toBeUndefined();
  });

  it('resolves for an empty payload when the function reports zeroes', async () => {
    nextRpcResult = { data: ZERO_COUNTS, error: null };
    await expect(importState(OWNER, EMPTY)).resolves.toBeUndefined();
  });
});
