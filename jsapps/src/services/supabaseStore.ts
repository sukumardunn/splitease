/**
 * Typed async persistence layer over the local Supabase stack (Phase 4a).
 * Maps DB rows (snake_case) <-> domain types (camelCase). Owner-scoped:
 * every query relies on RLS (owner_id = auth.uid()) for isolation.
 * Throws Error on any failure — callers (AppContext) roll back + toast.
 */
import { supabase } from '../lib/supabase';
import type { Database, Json } from '../lib/database.types';
import { ActivityEvent } from './activityLog';
import { toActivityAction, toActivityEntityType, toExpenseCategory } from './dbValidation';
import { Expense, Friend, Group, Settlement, User } from '../types';
import { generateAvatar } from '../utils/avatar';

type Tables = Database['public']['Tables'];
type ProfileRow = Tables['profiles']['Row'];
type FriendRow = Tables['friends']['Row'];
type GroupRow = Tables['groups']['Row'];
type GroupMemberRow = Tables['group_members']['Row'];
type ExpenseRow = Tables['expenses']['Row'];
type ExpensePayerRow = Tables['expense_payers']['Row'];
type ExpenseSplitRow = Tables['expense_splits']['Row'];
type SettlementRow = Tables['settlements']['Row'];
type ActivityEventRow = Tables['activity_events']['Row'];

// ---------- pure mappers (exported for unit tests) ----------

/**
 * `profiles.avatar` and `friends.avatar` both default to '' in the schema, and the
 * UI renders the value straight into `<img src>` in ~15 places — an empty string
 * there shows a broken-image icon. Falling back at the mapper boundary fixes every
 * render site at once, including rows written before avatars were generated.
 */
function avatarOr(stored: string, name: string): string {
  return stored.trim() ? stored : generateAvatar(name);
}

export function profileFromRow(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: avatarOr(row.avatar, row.name || row.email),
  };
}

export function friendToRow(ownerId: string, f: Friend): Tables['friends']['Insert'] {
  return { id: f.id, owner_id: ownerId, name: f.name, email: f.email, avatar: f.avatar };
}
export function friendFromRow(row: FriendRow): Friend {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: avatarOr(row.avatar, row.name || row.email),
  };
}

export interface GroupRowBundle {
  group: Tables['groups']['Insert'];
  members: Tables['group_members']['Insert'][];
}
export function groupToRow(ownerId: string, g: Group): GroupRowBundle {
  return {
    group: { id: g.id, owner_id: ownerId, name: g.name, avatar: g.avatar, deleted_at: g.deletedAt ?? null },
    members: g.members.map((personId) => ({ group_id: g.id, person_id: personId })),
  };
}
export function groupFromRow(row: GroupRow, memberRows: GroupMemberRow[]): Group {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    members: memberRows.map((m) => m.person_id),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : row.deleted_at,
  };
}

export interface ExpenseRowBundle {
  expense: Tables['expenses']['Insert'];
  payers: Tables['expense_payers']['Insert'][];
  splits: Tables['expense_splits']['Insert'][];
}
export function expenseToRow(ownerId: string, e: Expense): ExpenseRowBundle {
  return {
    expense: {
      id: e.id,
      owner_id: ownerId,
      description: e.description,
      amount: e.amount,
      paid_by: e.paidBy,
      date: e.date,
      category: e.category,
      currency: e.currency,
      group_id: e.groupId,
      notes: e.notes ?? null,
      deleted_at: e.deletedAt ?? null,
    },
    payers: (e.payers ?? []).map((p) => ({ expense_id: e.id, person_id: p.userId, amount: p.amount })),
    splits: e.splitWith.map((s) => ({ expense_id: e.id, person_id: s.userId, amount: s.amount })),
  };
}
export function expenseFromRow(
  row: ExpenseRow,
  payerRows: ExpensePayerRow[],
  splitRows: ExpenseSplitRow[]
): Expense {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    paidBy: row.paid_by,
    payers:
      payerRows.length > 0
        ? payerRows.map((p) => ({ userId: p.person_id, amount: Number(p.amount) }))
        : undefined,
    splitWith: splitRows.map((s) => ({ userId: s.person_id, amount: Number(s.amount) })),
    date: new Date(row.date).toISOString(),
    category: toExpenseCategory(row.category),
    currency: row.currency,
    groupId: row.group_id,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : row.deleted_at,
    notes: row.notes ?? undefined,
  };
}

export function settlementToRow(ownerId: string, s: Settlement): Tables['settlements']['Insert'] {
  return {
    id: s.id,
    owner_id: ownerId,
    from_person_id: s.fromUserId,
    to_person_id: s.toUserId,
    amount: s.amount,
    currency: s.currency,
    date: s.date,
    group_id: s.groupId ?? null,
    deleted_at: s.deletedAt ?? null,
  };
}
export function settlementFromRow(row: SettlementRow): Settlement {
  return {
    id: row.id,
    fromUserId: row.from_person_id,
    toUserId: row.to_person_id,
    amount: Number(row.amount),
    currency: row.currency,
    date: new Date(row.date).toISOString(),
    groupId: row.group_id,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : row.deleted_at,
  };
}

export function activityEventToRow(ownerId: string, ev: ActivityEvent): Tables['activity_events']['Insert'] {
  return {
    id: ev.id,
    owner_id: ownerId,
    actor_id: ev.actorId,
    action: ev.action,
    entity_type: ev.entityType,
    entity_id: ev.entityId,
    group_id: ev.groupId ?? null,
    before: (ev.before ?? null) as Json,
    after: (ev.after ?? null) as Json,
    created_at: ev.createdAt,
  };
}
export function activityEventFromRow(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: toActivityAction(row.action),
    entityType: toActivityEntityType(row.entity_type),
    entityId: row.entity_id,
    groupId: row.group_id,
    before: row.before,
    after: row.after,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ---------- helpers ----------

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

/**
 * Await a write that must touch at least one row; throw if it touched none.
 *
 * An UPDATE or DELETE whose WHERE clause matches nothing is a *success* in
 * Postgres, and RLS makes non-owned rows invisible rather than an error — so a
 * write silently rejected by policy is indistinguishable from one that worked
 * unless we ask the DB which rows it actually changed. Appending `.select()`
 * makes it return them, turning a silent no-op into a thrown error that
 * AppContext rolls back and surfaces as a toast.
 *
 * Plain INSERTs don't need this: an RLS `with check` violation raises 42501,
 * which the existing `error` checks already catch.
 */
async function expectRowsAffected(
  context: string,
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<void> {
  const { data, error } = await query;
  if (error) fail(context, error.message);
  if (!data || data.length === 0) {
    fail(context, 'no rows affected — row is missing or not permitted by row-level security');
  }
}

// ---------- reads ----------

export interface RemoteState {
  currentUser: User;
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activityEvents: ActivityEvent[];
}

export async function fetchAll(userId: string): Promise<RemoteState> {
  const [profile, friends, groups, members, expenses, payers, splits, settlements, events] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('friends').select('*').is('deleted_at', null).order('created_at'),
      supabase.from('groups').select('*').order('created_at'),
      supabase.from('group_members').select('*'),
      supabase.from('expenses').select('*').order('date', { ascending: false }),
      supabase.from('expense_payers').select('*'),
      supabase.from('expense_splits').select('*'),
      supabase.from('settlements').select('*').order('date', { ascending: false }),
      supabase.from('activity_events').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
  if (profile.error) fail('fetch profile', profile.error.message);
  if (friends.error) fail('fetch friends', friends.error.message);
  if (groups.error) fail('fetch groups', groups.error.message);
  if (members.error) fail('fetch group_members', members.error.message);
  if (expenses.error) fail('fetch expenses', expenses.error.message);
  if (payers.error) fail('fetch expense_payers', payers.error.message);
  if (splits.error) fail('fetch expense_splits', splits.error.message);
  if (settlements.error) fail('fetch settlements', settlements.error.message);
  if (events.error) fail('fetch activity_events', events.error.message);

  const payersByExpense = new Map<string, ExpensePayerRow[]>();
  for (const p of payers.data) {
    const list = payersByExpense.get(p.expense_id) ?? [];
    list.push(p);
    payersByExpense.set(p.expense_id, list);
  }
  const splitsByExpense = new Map<string, ExpenseSplitRow[]>();
  for (const s of splits.data) {
    const list = splitsByExpense.get(s.expense_id) ?? [];
    list.push(s);
    splitsByExpense.set(s.expense_id, list);
  }
  const membersByGroup = new Map<string, GroupMemberRow[]>();
  for (const m of members.data) {
    const list = membersByGroup.get(m.group_id) ?? [];
    list.push(m);
    membersByGroup.set(m.group_id, list);
  }

  return {
    currentUser: profileFromRow(profile.data),
    friends: friends.data.map(friendFromRow),
    groups: groups.data.map((g) => groupFromRow(g, membersByGroup.get(g.id) ?? [])),
    expenses: expenses.data.map((e) =>
      expenseFromRow(e, payersByExpense.get(e.id) ?? [], splitsByExpense.get(e.id) ?? [])
    ),
    settlements: settlements.data.map(settlementFromRow),
    activityEvents: events.data.map(activityEventFromRow),
  };
}

// ---------- expense writes ----------

async function writeExpenseChildren(bundle: ExpenseRowBundle): Promise<void> {
  if (bundle.payers.length > 0) {
    const { error } = await supabase.from('expense_payers').insert(bundle.payers);
    if (error) fail('insert expense_payers', error.message);
  }
  if (bundle.splits.length > 0) {
    const { error } = await supabase.from('expense_splits').insert(bundle.splits);
    if (error) fail('insert expense_splits', error.message);
  }
}

export async function insertExpense(ownerId: string, e: Expense): Promise<void> {
  const bundle = expenseToRow(ownerId, e);
  const { error } = await supabase.from('expenses').insert(bundle.expense);
  if (error) fail('insert expense', error.message);
  await writeExpenseChildren(bundle);
}

export async function updateExpense(ownerId: string, e: Expense): Promise<void> {
  const bundle = expenseToRow(ownerId, e);
  await expectRowsAffected(
    'update expense',
    supabase.from('expenses').upsert(bundle.expense).select('id')
  );
  // The child deletes below may legitimately affect zero rows (an expense with
  // no recorded payers), so they are not row-count checked.
  const del1 = await supabase.from('expense_payers').delete().eq('expense_id', e.id);
  if (del1.error) fail('replace expense_payers', del1.error.message);
  const del2 = await supabase.from('expense_splits').delete().eq('expense_id', e.id);
  if (del2.error) fail('replace expense_splits', del2.error.message);
  await writeExpenseChildren(bundle);
}

export async function setExpenseDeleted(id: string, deletedAt: string | null): Promise<void> {
  await expectRowsAffected(
    'set expense deleted',
    supabase.from('expenses').update({ deleted_at: deletedAt }).eq('id', id).select('id')
  );
}

export async function purgeExpense(id: string): Promise<void> {
  await expectRowsAffected(
    'purge expense',
    supabase.from('expenses').delete().eq('id', id).select('id')
  );
}

// ---------- friend writes ----------

export async function insertFriend(ownerId: string, f: Friend): Promise<void> {
  const { error } = await supabase.from('friends').insert(friendToRow(ownerId, f));
  if (error) fail('insert friend', error.message);
}

export async function setFriendDeleted(id: string, deletedAt: string | null): Promise<void> {
  await expectRowsAffected(
    'set friend deleted',
    supabase.from('friends').update({ deleted_at: deletedAt }).eq('id', id).select('id')
  );
}

// ---------- group writes ----------

export async function insertGroup(ownerId: string, g: Group): Promise<void> {
  const bundle = groupToRow(ownerId, g);
  const { error } = await supabase.from('groups').insert(bundle.group);
  if (error) fail('insert group', error.message);
  if (bundle.members.length > 0) {
    const { error: me } = await supabase.from('group_members').insert(bundle.members);
    if (me) fail('insert group_members', me.message);
  }
}

export async function updateGroup(ownerId: string, g: Group): Promise<void> {
  const bundle = groupToRow(ownerId, g);
  await expectRowsAffected(
    'update group',
    supabase.from('groups').upsert(bundle.group).select('id')
  );
  // May legitimately affect zero rows (a group with no members yet).
  const del = await supabase.from('group_members').delete().eq('group_id', g.id);
  if (del.error) fail('replace group_members', del.error.message);
  if (bundle.members.length > 0) {
    const { error: me } = await supabase.from('group_members').insert(bundle.members);
    if (me) fail('insert group_members', me.message);
  }
}

export async function setGroupDeleted(id: string, deletedAt: string | null): Promise<void> {
  await expectRowsAffected(
    'set group deleted',
    supabase.from('groups').update({ deleted_at: deletedAt }).eq('id', id).select('id')
  );
}

export async function purgeGroup(id: string): Promise<void> {
  await expectRowsAffected(
    'purge group',
    supabase.from('groups').delete().eq('id', id).select('id')
  );
}

// ---------- settlements / activity ----------

export async function insertSettlement(ownerId: string, s: Settlement): Promise<void> {
  const { error } = await supabase.from('settlements').insert(settlementToRow(ownerId, s));
  if (error) fail('insert settlement', error.message);
}

export async function insertActivityEvent(ownerId: string, ev: ActivityEvent): Promise<void> {
  const { error } = await supabase.from('activity_events').insert(activityEventToRow(ownerId, ev));
  if (error) fail('insert activity_event', error.message);
}

// ---------- one-time import ----------

export interface ImportPayload {
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  activityEvents: ActivityEvent[];
}

/** Batch-insert an already-remapped local state. Parents before children. */
export async function importState(ownerId: string, payload: ImportPayload): Promise<void> {
  if (payload.friends.length > 0) {
    const { error } = await supabase.from('friends').insert(payload.friends.map((f) => friendToRow(ownerId, f)));
    if (error) fail('import friends', error.message);
  }
  const groupBundles = payload.groups.map((g) => groupToRow(ownerId, g));
  if (groupBundles.length > 0) {
    const { error } = await supabase.from('groups').insert(groupBundles.map((b) => b.group));
    if (error) fail('import groups', error.message);
    const members = groupBundles.flatMap((b) => b.members);
    if (members.length > 0) {
      const { error: me } = await supabase.from('group_members').insert(members);
      if (me) fail('import group_members', me.message);
    }
  }
  const expenseBundles = payload.expenses.map((e) => expenseToRow(ownerId, e));
  if (expenseBundles.length > 0) {
    const { error } = await supabase.from('expenses').insert(expenseBundles.map((b) => b.expense));
    if (error) fail('import expenses', error.message);
    const payers = expenseBundles.flatMap((b) => b.payers);
    if (payers.length > 0) {
      const { error: pe } = await supabase.from('expense_payers').insert(payers);
      if (pe) fail('import expense_payers', pe.message);
    }
    const splits = expenseBundles.flatMap((b) => b.splits);
    if (splits.length > 0) {
      const { error: se } = await supabase.from('expense_splits').insert(splits);
      if (se) fail('import expense_splits', se.message);
    }
  }
  if (payload.settlements.length > 0) {
    const { error } = await supabase.from('settlements').insert(payload.settlements.map((s) => settlementToRow(ownerId, s)));
    if (error) fail('import settlements', error.message);
  }
  if (payload.activityEvents.length > 0) {
    const { error } = await supabase.from('activity_events').insert(payload.activityEvents.map((ev) => activityEventToRow(ownerId, ev)));
    if (error) fail('import activity_events', error.message);
  }
}
