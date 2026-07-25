/**
 * `updateGroup` must replace a group's members atomically.
 *
 * Same bug as the expense edit, one table over: the old three-call version
 * (upsert the group, delete `group_members`, re-insert) could fail between the
 * delete and the insert and leave the group alive with zero members. Every balance
 * derived from that group then emptied out on the next fetchAll, while AppContext
 * had restored only its in-memory snapshot and reported "it was undone". These
 * tests pin the shape that makes that impossible: one RPC, whose body is one
 * transaction, and a failure that reaches the caller as an error rather than as a
 * silent success.
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

import { insertGroup, updateGroup } from './supabaseStore';
import type { Group } from '../types';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const FRIEND = 'cccccccc-0000-4000-8000-000000000001';

const GROUP: Group = {
  id: ID,
  name: 'Trip',
  avatar: 'a.png',
  members: [OWNER, FRIEND],
  deletedAt: null,
};

beforeEach(() => {
  rpcCalls = [];
  fromCalls = [];
  nextRpcResult = { data: ID, error: null };
});

describe('updateGroup goes through the atomic RPC', () => {
  it('issues exactly one request, and it is the RPC', async () => {
    await updateGroup(OWNER, GROUP);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('update_group_with_members');
    expect(fromCalls).toEqual([]);
  });

  it('sends the parent row and the member array in that single call', async () => {
    await updateGroup(OWNER, GROUP);
    const { p_group, p_members } = rpcCalls[0].args as {
      p_group: Record<string, unknown>;
      p_members: unknown[];
    };
    expect(p_group).toMatchObject({
      id: ID,
      owner_id: OWNER,
      name: 'Trip',
      avatar: 'a.png',
      deleted_at: null,
    });
    expect(p_members).toEqual([
      { group_id: ID, person_id: OWNER },
      { group_id: ID, person_id: FRIEND },
    ]);
  });

  it('sends an empty member array rather than omitting it, so a group can be emptied', async () => {
    await updateGroup(OWNER, { ...GROUP, members: [] });
    const args = rpcCalls[0].args as { p_members: unknown[] };
    expect(args.p_members).toEqual([]);
  });

  it('resolves when the function returns the id it wrote', async () => {
    await expect(updateGroup(OWNER, GROUP)).resolves.toBeUndefined();
  });
});

describe('updateGroup surfaces failures instead of silently succeeding', () => {
  it('rejects with the DB error message when the RPC errors', async () => {
    nextRpcResult = { data: null, error: { message: 'boom' } };
    await expect(updateGroup(OWNER, GROUP)).rejects.toThrow(/update group: boom/);
  });

  it('rejects when the RPC reports a permission failure rather than dropping the edit', async () => {
    nextRpcResult = {
      data: null,
      error: { message: 'new row violates row-level security policy for table "groups"' },
    };
    await expect(updateGroup(OWNER, GROUP)).rejects.toThrow(/row-level security/);
  });

  it('rejects when the function returns null — the upsert matched nothing', async () => {
    nextRpcResult = { data: null, error: null };
    await expect(updateGroup(OWNER, GROUP)).rejects.toThrow(/no rows affected/);
  });

  it('rejects when the function returns some other group id', async () => {
    nextRpcResult = { data: 'dddddddd-0000-4000-8000-000000000001', error: null };
    await expect(updateGroup(OWNER, GROUP)).rejects.toThrow(/no rows affected/);
  });
});

describe('insertGroup goes through the same atomic RPC', () => {
  // The third instance of this bug: create was `insert groups` then a separate
  // `insert group_members`, so a failure between them left a group with no
  // members. It now shares the edit path, since the function upserts.
  it('issues exactly one request, and it is the RPC', async () => {
    await insertGroup(OWNER, GROUP);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('update_group_with_members');
    expect(fromCalls).toEqual([]);
  });

  it('sends the parent row and the members together', async () => {
    await insertGroup(OWNER, GROUP);
    const { p_group, p_members } = rpcCalls[0].args as {
      p_group: Record<string, unknown>;
      p_members: unknown[];
    };
    expect(p_group).toMatchObject({ id: ID, owner_id: OWNER, name: 'Trip' });
    expect(p_members).toEqual([
      { group_id: ID, person_id: OWNER },
      { group_id: ID, person_id: FRIEND },
    ]);
  });

  it('reports failures under its own context, not the edit path\'s', async () => {
    nextRpcResult = { data: null, error: { message: 'boom' } };
    await expect(insertGroup(OWNER, GROUP)).rejects.toThrow(/insert group: boom/);
  });

  it('rejects when the function returns null rather than reporting a phantom create', async () => {
    nextRpcResult = { data: null, error: null };
    await expect(insertGroup(OWNER, GROUP)).rejects.toThrow(/insert group: no rows affected/);
  });
});
