import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import {
  activityEventFromRow, activityEventToRow,
  expenseFromRow, expenseToRow,
  friendFromRow, friendToRow,
  groupFromRow, groupToRow,
  settlementFromRow, settlementToRow,
} from './supabaseStore';
import { Expense, Settlement } from '../types';
import { ActivityEvent } from './activityLog';

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('expense mapping', () => {
  const expense: Expense = {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    description: 'Dinner', amount: 30,
    paidBy: OWNER,
    payers: [{ userId: OWNER, amount: 30 }],
    splitWith: [{ userId: OWNER, amount: 15 }],
    date: '2026-01-01T00:00:00.000Z', category: 'dining', currency: 'USD',
    groupId: null, deletedAt: null, notes: 'yum',
  };

  it('round-trips an expense with payers and notes', () => {
    const bundle = expenseToRow(OWNER, expense);
    expect(bundle.expense.owner_id).toBe(OWNER);
    expect(bundle.expense.paid_by).toBe(OWNER);
    expect(bundle.payers).toHaveLength(1);
    expect(bundle.splits).toHaveLength(1);
    const back = expenseFromRow(
      { ...bundle.expense, created_at: 'x' } as never,
      bundle.payers as never[],
      bundle.splits as never[]
    );
    expect(back).toEqual(expense);
  });

  it('maps empty payers to undefined and null notes to undefined', () => {
    const e: Expense = { ...expense, payers: undefined, notes: undefined };
    const bundle = expenseToRow(OWNER, e);
    expect(bundle.payers).toHaveLength(0);
    expect(bundle.expense.notes).toBeNull();
    const back = expenseFromRow({ ...bundle.expense, created_at: 'x' } as never, [], bundle.splits as never[]);
    expect(back.payers).toBeUndefined();
    expect(back.notes).toBeUndefined();
  });
});

describe('group mapping', () => {
  it('round-trips a group with members', () => {
    const g = { id: 'cccccccc-0000-4000-8000-000000000001', name: 'Trip', members: [OWNER], avatar: 'a', deletedAt: null };
    const bundle = groupToRow(OWNER, g);
    expect(bundle.members[0]).toEqual({ group_id: g.id, person_id: OWNER });
    const back = groupFromRow({ ...bundle.group, created_at: 'x' } as never, bundle.members as never[]);
    expect(back).toEqual(g);
  });
});

describe('friend mapping', () => {
  it('round-trips a friend', () => {
    const f = { id: 'dddddddd-0000-4000-8000-000000000001', name: 'Ana', email: 'a@x.com', avatar: '' };
    const back = friendFromRow({ ...friendToRow(OWNER, f), deleted_at: null, created_at: 'x' } as never);
    expect(back).toEqual(f);
  });
});

describe('settlement mapping', () => {
  it('round-trips a settlement', () => {
    const s: Settlement = {
      id: 'eeeeeeee-0000-4000-8000-000000000001',
      fromUserId: OWNER, toUserId: 'ffffffff-0000-4000-8000-000000000001',
      amount: 15, currency: 'USD', date: '2026-01-02T00:00:00.000Z',
      groupId: null, deletedAt: null,
    };
    const back = settlementFromRow({ ...settlementToRow(OWNER, s), created_at: 'x' } as never);
    expect(back).toEqual(s);
  });
});

describe('activity event mapping', () => {
  it('round-trips an event with snapshots', () => {
    const ev: ActivityEvent = {
      id: '99999999-0000-4000-8000-000000000001',
      actorId: OWNER, action: 'expense.create', entityType: 'expense',
      entityId: 'bbbbbbbb-0000-4000-8000-000000000001',
      groupId: null, before: null, after: { description: 'Dinner' },
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const back = activityEventFromRow(activityEventToRow(OWNER, ev) as never);
    expect(back).toEqual(ev);
  });
});
