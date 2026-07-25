/**
 * Runtime validation for DB strings that the domain types model as unions.
 *
 * Postgres stores `expenses.category`, `activity_events.action`, and
 * `activity_events.entity_type` as plain text. Mapping a row with a bare
 * `as ExpenseCategory` cast tells TypeScript a guarantee the database does not
 * make: a value written by an older/newer client, a manual SQL edit, or a
 * future migration flows straight into the UI as a bogus union member.
 *
 * Each union has one lookup table below. Declaring it as `Record<Union, true>`
 * makes TypeScript check it in *both* directions — a missing key and an extra
 * key are both compile errors — so the table cannot drift from the union it
 * validates.
 *
 * Coercion policy differs by how material the field is:
 *   - `category` is cosmetic (it picks an icon), so an unrecognized value
 *     degrades to 'other'. An expense is never dropped over it: expenses carry
 *     money and drive balances.
 *   - `action` / `entity_type` degrade to 'unknown', which `describeActivity`
 *     renders explicitly. The audit row is kept rather than hidden.
 *   - `split_mode` degrades to `undefined`, i.e. "no intent recorded", which is
 *     exactly what the column's own NULL means and what the edit form already
 *     knows how to handle (it infers a mode instead).
 */
import type { ExpenseCategory } from '../types';
import type { ActivityAction, ActivityEntityType } from './activityLog';
import type { SplitMode } from './splitEngine';

const EXPENSE_CATEGORIES: Record<ExpenseCategory, true> = {
  groceries: true,
  rent: true,
  utilities: true,
  dining: true,
  entertainment: true,
  transportation: true,
  travel: true,
  shopping: true,
  services: true,
  other: true,
  settlement: true,
};

const ACTIVITY_ACTIONS: Record<ActivityAction, true> = {
  'expense.create': true,
  'expense.update': true,
  'expense.delete': true,
  'expense.restore': true,
  'group.create': true,
  'group.update': true,
  'group.delete': true,
  'group.restore': true,
  'settlement.create': true,
  'friend.add': true,
  'import.create': true,
  'import.undo': true,
  unknown: true,
};

const ACTIVITY_ENTITY_TYPES: Record<ActivityEntityType, true> = {
  expense: true,
  group: true,
  settlement: true,
  friend: true,
  import: true,
  unknown: true,
};

const SPLIT_MODES: Record<SplitMode, true> = {
  equal: true,
  exact: true,
  percentage: true,
  shares: true,
  adjustment: true,
};

/** `hasOwnProperty`, not `in` — `in` would accept inherited keys like 'constructor'. */
function isMember(table: Record<string, true>, value: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, value);
}

// Warn once per distinct bad value; a corrupt column could otherwise emit one
// warning per row across a 500-row fetch.
const warned = new Set<string>();

function warnOnce(field: string, value: string, fallback: string): void {
  const key = `${field}:${value}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(
    `SplitEase: unrecognized ${field} "${value}" from the database — treating it as "${fallback}"`
  );
}

/** Reset the warn-once cache. Test seam only. */
export function resetValidationWarnings(): void {
  warned.clear();
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return isMember(EXPENSE_CATEGORIES, value);
}

export function isActivityAction(value: string): value is ActivityAction {
  return isMember(ACTIVITY_ACTIONS, value);
}

export function isActivityEntityType(value: string): value is ActivityEntityType {
  return isMember(ACTIVITY_ENTITY_TYPES, value);
}

export function toExpenseCategory(value: string): ExpenseCategory {
  if (isExpenseCategory(value)) return value;
  warnOnce('expense category', value, 'other');
  return 'other';
}

export function toActivityAction(value: string): ActivityAction {
  if (isActivityAction(value)) return value;
  warnOnce('activity action', value, 'unknown');
  return 'unknown';
}

export function toActivityEntityType(value: string): ActivityEntityType {
  if (isActivityEntityType(value)) return value;
  warnOnce('activity entity type', value, 'unknown');
  return 'unknown';
}

export function isSplitMode(value: string): value is SplitMode {
  return isMember(SPLIT_MODES, value);
}

/**
 * `expenses.split_mode` -> `Expense.splitMode`.
 *
 * NULL is the ordinary case for older rows and CSV imports, so it is not warned
 * about; a *non-null* value outside the union is a real anomaly and warns before
 * degrading to the same "unknown" answer.
 */
export function toSplitMode(value: string | null): SplitMode | undefined {
  if (value === null) return undefined;
  if (isSplitMode(value)) return value;
  warnOnce('split mode', value, 'unrecorded');
  return undefined;
}
