import { describe, expect, it } from 'vitest';
import { remapLocalState } from './importRemapper';
import { AppState } from '../types';

const PROFILE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function seqGen(): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

function baseState(): AppState {
  return {
    currentUser: { id: 'user_1', name: 'Me', email: 'me@x.com', avatar: '' },
    friends: [
      { id: 'user_2', name: 'Ana', email: 'a@x.com', avatar: '' },
      { id: 'user_3', name: 'Bo', email: 'b@x.com', avatar: '' },
    ],
    groups: [
      { id: 'grp_1', name: 'Trip', members: ['user_1', 'user_2'], avatar: '', deletedAt: null },
    ],
    expenses: [
      {
        id: 'exp_1', description: 'Dinner', amount: 30, paidBy: 'user_1',
        payers: [{ userId: 'user_1', amount: 30 }],
        splitWith: [{ userId: 'user_1', amount: 15 }, { userId: 'user_2', amount: 15 }],
        date: '2026-01-01T00:00:00.000Z', category: 'dining', currency: 'USD',
        groupId: 'grp_1', deletedAt: null, notes: 'yum',
      },
    ],
    settlements: [
      { id: 'set_1', fromUserId: 'user_2', toUserId: 'user_1', amount: 15, currency: 'USD', date: '2026-01-02T00:00:00.000Z', groupId: 'grp_1', deletedAt: null },
    ],
    activityEvents: [
      { id: 'evt_1', actorId: 'user_1', action: 'expense.create', entityType: 'expense', entityId: 'exp_1', groupId: 'grp_1', before: null, after: { description: 'Dinner' }, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
  };
}

describe('remapLocalState', () => {
  it('maps currentUser id to the profile id everywhere it appears', () => {
    const out = remapLocalState(baseState(), PROFILE_ID, seqGen());
    expect(out.expenses[0].paidBy).toBe(PROFILE_ID);
    expect(out.expenses[0].payers![0].userId).toBe(PROFILE_ID);
    expect(out.expenses[0].splitWith[0].userId).toBe(PROFILE_ID);
    expect(out.settlements[0].toUserId).toBe(PROFILE_ID);
    expect(out.groups[0].members).toContain(PROFILE_ID);
    expect(out.activityEvents[0].actorId).toBe(PROFILE_ID);
  });

  it('maps each old id to one stable new uuid across all references', () => {
    const out = remapLocalState(baseState(), PROFILE_ID, seqGen());
    const ana = out.friends[0].id;
    expect(out.expenses[0].splitWith[1].userId).toBe(ana);
    expect(out.settlements[0].fromUserId).toBe(ana);
    expect(out.groups[0].members).toContain(ana);
    const grp = out.groups[0].id;
    expect(out.expenses[0].groupId).toBe(grp);
    expect(out.settlements[0].groupId).toBe(grp);
    expect(out.activityEvents[0].groupId).toBe(grp);
    expect(out.activityEvents[0].entityId).toBe(out.expenses[0].id);
  });

  it('nulls group refs pointing at groups absent from the imported state (FK safety)', () => {
    const s = baseState();
    s.expenses[0].groupId = 'grp_missing';
    s.settlements[0].groupId = 'grp_missing';
    const out = remapLocalState(s, PROFILE_ID, seqGen());
    expect(out.expenses[0].groupId).toBeNull();
    expect(out.settlements[0].groupId).toBeNull();
  });

  it('assigns fresh uuids to dangling person refs instead of leaking old strings', () => {
    const s = baseState();
    s.expenses[0].splitWith.push({ userId: 'user_ghost', amount: 0 });
    const out = remapLocalState(s, PROFILE_ID, seqGen());
    const ghost = out.expenses[0].splitWith[2].userId;
    expect(ghost).toMatch(/^[0-9a-f-]{36}$/);
    expect(ghost).not.toBe('user_ghost');
  });

  it('preserves non-id fields verbatim (amounts, dates, deletedAt, notes)', () => {
    const out = remapLocalState(baseState(), PROFILE_ID, seqGen());
    expect(out.expenses[0].amount).toBe(30);
    expect(out.expenses[0].notes).toBe('yum');
    expect(out.expenses[0].date).toBe('2026-01-01T00:00:00.000Z');
    expect(out.expenses[0].deletedAt).toBeNull();
    expect(out.settlements[0].amount).toBe(15);
  });

  it('is deterministic given the same genId sequence', () => {
    const a = remapLocalState(baseState(), PROFILE_ID, seqGen());
    const b = remapLocalState(baseState(), PROFILE_ID, seqGen());
    expect(a).toEqual(b);
  });

  it('does not mutate the input state', () => {
    const s = baseState();
    const copy = JSON.parse(JSON.stringify(s));
    remapLocalState(s, PROFILE_ID, seqGen());
    expect(s).toEqual(copy);
  });
});
