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
import { Expense, Friend, Group, ImportBatch, Settlement, User } from '../types';
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
type ImportBatchRow = Tables['import_batches']['Row'];

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

/**
 * `importBatchId` tags a row as created by a bulk import (Phase 5a) so the whole
 * import can be undone later. Null/omitted for anything the user hand-entered.
 */
export function friendToRow(
  ownerId: string,
  f: Friend,
  importBatchId: string | null = null
): Tables['friends']['Insert'] {
  return {
    id: f.id,
    owner_id: ownerId,
    name: f.name,
    email: f.email,
    avatar: f.avatar,
    import_batch_id: importBatchId,
  };
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
      import_batch_id: e.importBatchId ?? null,
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
    importBatchId: row.import_batch_id,
  };
}

export function importBatchFromRow(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    source: row.source,
    filename: row.filename,
    expenseCount: row.expense_count,
    friendCount: row.friend_count,
    undoneAt: row.undone_at ? new Date(row.undone_at).toISOString() : row.undone_at,
    createdAt: new Date(row.created_at).toISOString(),
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
  importBatches: ImportBatch[];
}

export async function fetchAll(userId: string): Promise<RemoteState> {
  const [profile, friends, groups, members, expenses, payers, splits, settlements, events, batches] =
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
      supabase.from('import_batches').select('*').order('created_at', { ascending: false }),
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
  if (batches.error) fail('fetch import_batches', batches.error.message);

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
    importBatches: batches.data.map(importBatchFromRow),
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

/**
 * Edit an expense: upsert the parent and *replace* its payer/split rows.
 *
 * Done in one `update_expense_with_children` RPC rather than four REST calls
 * (upsert, delete payers, delete splits, re-insert). Each REST call is its own
 * transaction, so a failure landing after the deletes left the expense with zero
 * splits while AppContext rolled back only its in-memory snapshot and told the
 * user the change "was undone" — the debt then vanished on the next fetchAll.
 * The function body is a single transaction, so the replace is all-or-nothing.
 *
 * The function is `security invoker`, so the same RLS policies that gate direct
 * writes still apply: it cannot reach another owner's expense (see the
 * 20260725000002 migration for why definer would be a cross-tenant hole).
 *
 * Signature is unchanged from the four-call version on purpose — AppContext
 * calls this the same way.
 */
export async function updateExpense(ownerId: string, e: Expense): Promise<void> {
  const bundle = expenseToRow(ownerId, e);
  const { data, error } = await supabase.rpc('update_expense_with_children', {
    p_expense: bundle.expense as unknown as Json,
    // Always sent, empty included: an empty array is how a caller clears the
    // stale children of an expense that no longer has payers.
    p_payers: bundle.payers as unknown as Json,
    p_splits: bundle.splits as unknown as Json,
  });
  if (error) fail('update expense', error.message);
  // Same guard as `expectRowsAffected`, adapted to an RPC: the function returns
  // the id it wrote, and returns null if the upsert matched nothing. Anything
  // other than the id we asked for means our write did not land.
  if (data !== e.id) {
    fail('update expense', 'no rows affected — row is missing or not permitted by row-level security');
  }
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

// ---------- CSV import batches (Phase 5a) ----------

export interface CsvImportPayload {
  /** Friends the import creates. Already carry fresh uuids. */
  friends: Friend[];
  /** Expenses to create. Their `importBatchId` is set here, not by the caller. */
  expenses: Expense[];
  source?: string;
  filename?: string;
}

/**
 * Write a CSV import as one undoable batch: the batch row first (the FK target),
 * then its friends, then its expenses and their payer/split children.
 *
 * Postgres transactions aren't reachable over the REST API, so a mid-way failure
 * would otherwise leave a half-applied import behind. Every row created here
 * carries the batch id, which makes the cleanup path exact: on failure we undo
 * the batch we just started and rethrow, so the caller sees a clean error and
 * the account is left as it was.
 */
export async function importCsvBatch(
  ownerId: string,
  batchId: string,
  payload: CsvImportPayload
): Promise<ImportBatch> {
  const batchRow: Tables['import_batches']['Insert'] = {
    id: batchId,
    owner_id: ownerId,
    source: payload.source ?? 'csv',
    filename: payload.filename ?? '',
    expense_count: payload.expenses.length,
    friend_count: payload.friends.length,
  };
  const inserted = await supabase.from('import_batches').insert(batchRow).select('*').single();
  if (inserted.error) fail('insert import_batch', inserted.error.message);

  try {
    if (payload.friends.length > 0) {
      const { error } = await supabase
        .from('friends')
        .insert(payload.friends.map((f) => friendToRow(ownerId, f, batchId)));
      if (error) fail('import batch friends', error.message);
    }
    const bundles = payload.expenses.map((e) =>
      expenseToRow(ownerId, { ...e, importBatchId: batchId })
    );
    if (bundles.length > 0) {
      const { error } = await supabase.from('expenses').insert(bundles.map((b) => b.expense));
      if (error) fail('import batch expenses', error.message);
      const payers = bundles.flatMap((b) => b.payers);
      if (payers.length > 0) {
        const { error: pe } = await supabase.from('expense_payers').insert(payers);
        if (pe) fail('import batch expense_payers', pe.message);
      }
      const splits = bundles.flatMap((b) => b.splits);
      if (splits.length > 0) {
        const { error: se } = await supabase.from('expense_splits').insert(splits);
        if (se) fail('import batch expense_splits', se.message);
      }
    }
  } catch (err) {
    // Best-effort cleanup. If it also fails, the original error is what the user
    // needs to see, and the batch stays on record so undo remains available.
    await undoImportBatch(batchId).catch((cleanupErr: unknown) => {
      console.warn('SplitEase: could not clean up a failed import batch', cleanupErr);
    });
    throw err;
  }

  return importBatchFromRow(inserted.data);
}

export interface UndoImportResult {
  expensesRemoved: number;
  friendsRemoved: number;
  /** Batch friends left in place because something outside the batch still uses them. */
  friendsKept: number;
}

/**
 * Undo an import wholesale: hard-delete the expenses it created (their payer and
 * split rows go with them by FK cascade), then remove the friends it created.
 *
 * Two deliberate asymmetries:
 *
 *  - Expenses are hard-deleted, not soft-deleted. An import is a bulk mechanical
 *    action, and dropping hundreds of rows into Recently Deleted would bury the
 *    individually-deleted expenses that view exists to show. The batch record is
 *    the audit trail instead.
 *  - A batch friend is only removed if nothing outside the batch references
 *    them. Once the user splits a hand-entered expense with an imported contact,
 *    or adds them to a group, deleting them would leave those rows pointing at a
 *    person who no longer exists (`person_id` has no FK — see the 4a migration,
 *    so Postgres would not stop us).
 *
 * The batch row itself survives, stamped `undone_at`. Idempotent: undoing an
 * already-undone batch removes nothing and succeeds.
 */
export async function undoImportBatch(batchId: string): Promise<UndoImportResult> {
  // Zero rows is a legitimate outcome here (an already-undone batch, or one
  // whose expenses the user purged by hand), so this is not row-count checked.
  const expenses = await supabase
    .from('expenses')
    .delete()
    .eq('import_batch_id', batchId)
    .select('id');
  if (expenses.error) fail('undo import expenses', expenses.error.message);

  const batchFriends = await supabase.from('friends').select('id').eq('import_batch_id', batchId);
  if (batchFriends.error) fail('undo import friends lookup', batchFriends.error.message);

  let friendsRemoved = 0;
  let friendsKept = 0;
  if (batchFriends.data.length > 0) {
    // Run AFTER the expense delete above, so shares that just went away don't
    // count as references and needlessly preserve a friend.
    const [splits, payers, settlements, members] = await Promise.all([
      supabase.from('expense_splits').select('person_id'),
      supabase.from('expense_payers').select('person_id'),
      supabase.from('settlements').select('from_person_id, to_person_id'),
      supabase.from('group_members').select('person_id'),
    ]);
    if (splits.error) fail('undo import splits lookup', splits.error.message);
    if (payers.error) fail('undo import payers lookup', payers.error.message);
    if (settlements.error) fail('undo import settlements lookup', settlements.error.message);
    if (members.error) fail('undo import group members lookup', members.error.message);

    const referenced = new Set<string>([
      ...splits.data.map((s) => s.person_id),
      ...payers.data.map((p) => p.person_id),
      ...settlements.data.flatMap((s) => [s.from_person_id, s.to_person_id]),
      ...members.data.map((m) => m.person_id),
    ]);
    const removable = batchFriends.data.map((f) => f.id).filter((id) => !referenced.has(id));
    friendsKept = batchFriends.data.length - removable.length;

    if (removable.length > 0) {
      const { data, error } = await supabase.from('friends').delete().in('id', removable).select('id');
      if (error) fail('undo import friends', error.message);
      friendsRemoved = data?.length ?? 0;
    }
  }

  await expectRowsAffected(
    'stamp import batch undone',
    supabase
      .from('import_batches')
      .update({ undone_at: new Date().toISOString() })
      .eq('id', batchId)
      .select('id')
  );

  return { expensesRemoved: expenses.data?.length ?? 0, friendsRemoved, friendsKept };
}
