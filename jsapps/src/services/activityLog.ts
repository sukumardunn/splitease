/**
 * Append-only activity/audit log for SplitEase.
 *
 * Pure builders + formatter only — no React, no persistence side effects.
 * The orchestrator (AppState) is responsible for persisting the events
 * array; this module never touches localStorage/IndexedDB/etc.
 */

export type ActivityAction =
  | 'expense.create'
  | 'expense.update'
  | 'expense.delete'
  | 'expense.restore'
  | 'group.create'
  | 'group.update'
  | 'group.delete'
  | 'group.restore'
  | 'settlement.create'
  | 'friend.add'
  /** Persisted row carried a value this client doesn't recognize. Never
   *  produced by app code — only by `dbValidation` when reading the DB. */
  | 'unknown';

export type ActivityEntityType =
  | 'expense'
  | 'group'
  | 'settlement'
  | 'friend'
  /** See the note on ActivityAction's 'unknown'. */
  | 'unknown';

export interface ActivityEvent {
  id: string;
  actorId: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  groupId?: string | null;
  before?: unknown | null;
  after?: unknown | null;
  createdAt: string;
}

export interface CreateEventInput {
  actorId: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  groupId?: string | null;
  before?: unknown | null;
  after?: unknown | null;
  id?: string;
  createdAt?: string;
}

let sequence = 0;

function generateId(): string {
  sequence += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `evt_${Date.now()}_${sequence}_${random}`;
}

/** Build an ActivityEvent, generating id/createdAt unless overridden. */
export function createActivityEvent(input: CreateEventInput): ActivityEvent {
  return {
    id: input.id ?? generateId(),
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    groupId: input.groupId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Prepend `event` (newest-first) to `events` and cap the resulting array
 * at `max` entries. Never mutates the input array.
 */
export function appendActivityEvent(
  events: ActivityEvent[],
  event: ActivityEvent,
  max = 500
): ActivityEvent[] {
  const next = [event, ...events];
  return next.length > max ? next.slice(0, max) : next;
}

export interface ActivityDescription {
  title: string;
  subtitle?: string;
  tone: 'expense' | 'settlement' | 'group' | 'friend' | 'delete';
}

interface ExpenseSnapshot {
  description?: string;
  amount?: number;
  paidBy?: string;
}

interface GroupSnapshot {
  name?: string;
}

interface SettlementSnapshot {
  id?: string;
  fromUserId?: string;
  toUserId?: string;
  amount?: number;
  date?: string;
}

interface FriendSnapshot {
  id?: string;
  name?: string;
}

function money(amount: unknown): string {
  return typeof amount === 'number' ? `$${amount.toFixed(2)}` : '$0.00';
}

function asExpense(value: unknown): ExpenseSnapshot {
  return (value ?? {}) as ExpenseSnapshot;
}

function asGroup(value: unknown): GroupSnapshot {
  return (value ?? {}) as GroupSnapshot;
}

function asSettlement(value: unknown): SettlementSnapshot {
  return (value ?? {}) as SettlementSnapshot;
}

function asFriend(value: unknown): FriendSnapshot {
  return (value ?? {}) as FriendSnapshot;
}

/**
 * Produce a human-readable description of an ActivityEvent.
 * `nameOf` resolves a userId to a display name; callers decide whether
 * to special-case "You" for the current user before/inside nameOf.
 */
export function describeActivity(
  event: ActivityEvent,
  nameOf: (id: string) => string
): ActivityDescription {
  const actor = nameOf(event.actorId);

  switch (event.action) {
    case 'expense.create': {
      const after = asExpense(event.after);
      const description = after.description ?? event.entityId;
      return {
        title: `${actor} added "${description}"`,
        subtitle:
          after.paidBy !== undefined && after.amount !== undefined
            ? `${nameOf(after.paidBy)} paid ${money(after.amount)}`
            : undefined,
        tone: 'expense',
      };
    }
    case 'expense.update': {
      const after = asExpense(event.after);
      const description = after.description ?? event.entityId;
      return {
        title: `${actor} updated "${description}"`,
        subtitle:
          after.paidBy !== undefined && after.amount !== undefined
            ? `${nameOf(after.paidBy)} paid ${money(after.amount)}`
            : undefined,
        tone: 'expense',
      };
    }
    case 'expense.delete': {
      const before = asExpense(event.before);
      const description = before.description ?? event.entityId;
      return {
        title: `${actor} deleted "${description}"`,
        tone: 'delete',
      };
    }
    case 'expense.restore': {
      const after = asExpense(event.after);
      const description = after.description ?? event.entityId;
      return {
        title: `${actor} restored "${description}"`,
        tone: 'expense',
      };
    }
    case 'group.create': {
      const after = asGroup(event.after);
      const name = after.name ?? event.entityId;
      return {
        title: `${actor} created group "${name}"`,
        tone: 'group',
      };
    }
    case 'group.update': {
      const after = asGroup(event.after);
      const name = after.name ?? event.entityId;
      return {
        title: `${actor} updated group "${name}"`,
        tone: 'group',
      };
    }
    case 'group.delete': {
      const before = asGroup(event.before);
      const name = before.name ?? event.entityId;
      return {
        title: `${actor} deleted group "${name}"`,
        tone: 'delete',
      };
    }
    case 'group.restore': {
      const after = asGroup(event.after);
      const name = after.name ?? event.entityId;
      return {
        title: `${actor} restored group "${name}"`,
        tone: 'group',
      };
    }
    case 'settlement.create': {
      const after = asSettlement(event.after);
      const from = after.fromUserId ?? event.entityId;
      const to = after.toUserId;
      return {
        title: `${nameOf(from)} paid ${to !== undefined ? nameOf(to) : 'someone'}`,
        subtitle: after.amount !== undefined ? money(after.amount) : undefined,
        tone: 'settlement',
      };
    }
    case 'friend.add': {
      const after = asFriend(event.after);
      const friendId = after.id ?? event.entityId;
      return {
        title: `${actor} added ${nameOf(friendId)} as a friend`,
        tone: 'friend',
      };
    }
    case 'unknown': {
      // A persisted action this client version doesn't know. Surfaced rather
      // than hidden so the audit trail stays complete.
      return {
        title: `${actor} performed an unrecognized action`,
        subtitle: event.entityId,
        tone: 'expense',
      };
    }
    default: {
      // Exhaustiveness guard — if a new ActivityAction is added without a
      // case above, TypeScript will flag this assignment as non-`never`.
      const exhaustiveCheck: never = event.action;
      return {
        title: `${actor} performed an action (${String(exhaustiveCheck)})`,
        tone: 'expense',
      };
    }
  }
}
