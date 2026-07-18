import { describe, expect, it } from 'vitest';
import {
  appendActivityEvent,
  createActivityEvent,
  describeActivity,
  type ActivityEvent,
} from './activityLog';

const nameOf = (id: string): string => {
  const names: Record<string, string> = {
    user1: 'You',
    friend1: 'Alice',
    friend2: 'Bob',
  };
  return names[id] ?? id;
};

describe('createActivityEvent', () => {
  it('generates a unique id and an ISO createdAt when not provided', () => {
    const before = Date.now();
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'expense.create',
      entityType: 'expense',
      entityId: 'exp1',
      after: { description: 'Coffee', amount: 5, paidBy: 'user1' },
    });

    expect(event.id).toMatch(/^evt_/);
    expect(new Date(event.createdAt).toISOString()).toBe(event.createdAt);
    expect(new Date(event.createdAt).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('produces different ids across two calls', () => {
    const e1 = createActivityEvent({
      actorId: 'user1',
      action: 'friend.add',
      entityType: 'friend',
      entityId: 'friend1',
      after: { id: 'friend1' },
    });
    const e2 = createActivityEvent({
      actorId: 'user1',
      action: 'friend.add',
      entityType: 'friend',
      entityId: 'friend2',
      after: { id: 'friend2' },
    });
    expect(e1.id).not.toBe(e2.id);
  });

  it('honors id and createdAt overrides for determinism', () => {
    const event = createActivityEvent({
      id: 'evt_fixed',
      createdAt: '2024-01-01T00:00:00.000Z',
      actorId: 'user1',
      action: 'group.create',
      entityType: 'group',
      entityId: 'group1',
      after: { name: 'Trip' },
    });
    expect(event.id).toBe('evt_fixed');
    expect(event.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('defaults groupId/before/after to null when omitted', () => {
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'friend.add',
      entityType: 'friend',
      entityId: 'friend1',
    });
    expect(event.groupId).toBeNull();
    expect(event.before).toBeNull();
    expect(event.after).toBeNull();
  });
});

describe('appendActivityEvent', () => {
  const makeEvent = (id: string): ActivityEvent => ({
    id,
    actorId: 'user1',
    action: 'friend.add',
    entityType: 'friend',
    entityId: id,
    createdAt: '2024-01-01T00:00:00.000Z',
  });

  it('prepends the new event (newest-first)', () => {
    const existing = [makeEvent('e1')];
    const result = appendActivityEvent(existing, makeEvent('e2'));
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('does not mutate the input array', () => {
    const existing = [makeEvent('e1')];
    const result = appendActivityEvent(existing, makeEvent('e2'));
    expect(existing).toHaveLength(1);
    expect(result).not.toBe(existing);
  });

  it('caps the log at max entries', () => {
    const existing = [makeEvent('e1'), makeEvent('e2'), makeEvent('e3')];
    const result = appendActivityEvent(existing, makeEvent('e4'), 3);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual(['e4', 'e1', 'e2']);
  });

  it('defaults max to 500', () => {
    const existing = Array.from({ length: 500 }, (_, i) => makeEvent(`e${i}`));
    const result = appendActivityEvent(existing, makeEvent('new'));
    expect(result).toHaveLength(500);
    expect(result[0].id).toBe('new');
  });
});

describe('describeActivity', () => {
  it('describes expense.create', () => {
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'expense.create',
      entityType: 'expense',
      entityId: 'exp1',
      after: { description: 'Dinner', amount: 42.5, paidBy: 'friend1' },
    });
    const result = describeActivity(event, nameOf);
    expect(result.title).toBe('You added "Dinner"');
    expect(result.subtitle).toBe('Alice paid $42.50');
    expect(result.tone).toBe('expense');
  });

  it('describes expense.update', () => {
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'expense.update',
      entityType: 'expense',
      entityId: 'exp1',
      after: { description: 'Dinner (edited)', amount: 50, paidBy: 'user1' },
    });
    const result = describeActivity(event, nameOf);
    expect(result.title).toBe('You updated "Dinner (edited)"');
    expect(result.subtitle).toBe('You paid $50.00');
    expect(result.tone).toBe('expense');
  });

  it('describes expense.delete using the before snapshot', () => {
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'expense.delete',
      entityType: 'expense',
      entityId: 'exp1',
      before: { description: 'Old dinner', amount: 30, paidBy: 'user1' },
    });
    const result = describeActivity(event, nameOf);
    expect(result.title).toBe('You deleted "Old dinner"');
    expect(result.tone).toBe('delete');
  });

  it('describes expense.restore', () => {
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'expense.restore',
      entityType: 'expense',
      entityId: 'exp1',
      after: { description: 'Old dinner', amount: 30, paidBy: 'user1' },
    });
    const result = describeActivity(event, nameOf);
    expect(result.title).toBe('You restored "Old dinner"');
    expect(result.tone).toBe('expense');
  });

  it('describes group.create/update/delete/restore', () => {
    const create = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'group.create',
        entityType: 'group',
        entityId: 'group1',
        after: { name: 'Trip' },
      }),
      nameOf
    );
    expect(create.title).toBe('You created group "Trip"');
    expect(create.tone).toBe('group');

    const update = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'group.update',
        entityType: 'group',
        entityId: 'group1',
        after: { name: 'Trip 2024' },
      }),
      nameOf
    );
    expect(update.title).toBe('You updated group "Trip 2024"');

    const del = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'group.delete',
        entityType: 'group',
        entityId: 'group1',
        before: { name: 'Trip' },
      }),
      nameOf
    );
    expect(del.title).toBe('You deleted group "Trip"');
    expect(del.tone).toBe('delete');

    const restore = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'group.restore',
        entityType: 'group',
        entityId: 'group1',
        after: { name: 'Trip' },
      }),
      nameOf
    );
    expect(restore.title).toBe('You restored group "Trip"');
  });

  it('describes settlement.create', () => {
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'settlement.create',
      entityType: 'settlement',
      entityId: 'settle1',
      after: {
        id: 'settle1',
        fromUserId: 'friend1',
        toUserId: 'friend2',
        amount: 20,
        date: '2024-01-01',
      },
    });
    const result = describeActivity(event, nameOf);
    expect(result.title).toBe('Alice paid Bob');
    expect(result.subtitle).toBe('$20.00');
    expect(result.tone).toBe('settlement');
  });

  it('describes friend.add', () => {
    const event = createActivityEvent({
      actorId: 'user1',
      action: 'friend.add',
      entityType: 'friend',
      entityId: 'friend1',
      after: { id: 'friend1', name: 'Alice' },
    });
    const result = describeActivity(event, nameOf);
    expect(result.title).toBe('You added Alice as a friend');
    expect(result.tone).toBe('friend');
  });

  it('falls back to entityId when snapshots are missing', () => {
    const missingCreate = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'expense.create',
        entityType: 'expense',
        entityId: 'exp-unknown',
      }),
      nameOf
    );
    expect(missingCreate.title).toBe('You added "exp-unknown"');
    expect(missingCreate.subtitle).toBeUndefined();

    const missingDelete = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'expense.delete',
        entityType: 'expense',
        entityId: 'exp-unknown',
      }),
      nameOf
    );
    expect(missingDelete.title).toBe('You deleted "exp-unknown"');

    const missingSettlement = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'settlement.create',
        entityType: 'settlement',
        entityId: 'settle-unknown',
      }),
      nameOf
    );
    expect(missingSettlement.title).toBe('settle-unknown paid someone');
    expect(missingSettlement.subtitle).toBeUndefined();

    const missingFriend = describeActivity(
      createActivityEvent({
        actorId: 'user1',
        action: 'friend.add',
        entityType: 'friend',
        entityId: 'friend-unknown',
      }),
      nameOf
    );
    expect(missingFriend.title).toBe('You added friend-unknown as a friend');
  });
});
