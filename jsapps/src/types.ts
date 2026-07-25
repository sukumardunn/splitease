import type { ActivityEvent } from './services/activityLog';
import type { SplitMode } from './services/splitEngine';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export type Friend = User;

export interface Split {
  userId: string;
  amount: number;
}

/** One contributor to an expense's cost (multi-payer support, Phase 3). */
export interface Payer {
  userId: string;
  amount: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string; // user ID of the (primary) payer — kept for single-payer compatibility
  /** Multi-payer contributions. When present & non-empty, supersedes `paidBy` for balances. */
  payers?: Payer[];
  splitWith: Split[]; // array of user IDs and amounts
  date: string;
  category: ExpenseCategory;
  currency: string;
  groupId: string | null;
  /** ISO timestamp when soft-deleted; null/undefined means active (Phase 2). */
  deletedAt?: string | null;
  /** Free-text note (Phase 6 forward-compat; optional). */
  notes?: string;
  /**
   * Set when this expense came from a bulk import (Phase 5a), so undoing that
   * import can find it again. Carried on the domain type rather than passed at
   * write time because `updateExpense` upserts the whole row — an edit would
   * otherwise silently detach the expense from its batch.
   */
  importBatchId?: string | null;
  /**
   * How the split was *chosen*, not just what it resolved to (`expenses.split_mode`,
   * migration 20260725000005). Undefined means no intent was recorded — a row
   * written before that migration, or a CSV import — and the edit form falls back
   * to `inferSplitMode`, which can only recover `equal`.
   */
  splitMode?: SplitMode;
}

export interface Group {
  id: string;
  name: string;
  members: string[]; // array of user IDs
  avatar: string;
  /** ISO timestamp when soft-deleted; null/undefined means active (Phase 2). */
  deletedAt?: string | null;
}

/** First-class settle-up record — a real cash transfer, not a fake expense (Phase 3). */
export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  date: string;
  groupId?: string | null;
  deletedAt?: string | null;
}

/**
 * A bulk import (Phase 5a). Every row an import creates carries this id, so the
 * whole thing can be undone at once. The record itself survives an undo — it is
 * stamped `undoneAt` and kept as the audit trail of what was imported.
 */
export interface ImportBatch {
  id: string;
  /** 'csv' today; 'screenshot' when §5.2 phase B lands on the same pipeline. */
  source: string;
  filename: string;
  expenseCount: number;
  friendCount: number;
  undoneAt?: string | null;
  createdAt: string;
}

export type ExpenseCategory =
  | 'groceries'
  | 'rent'
  | 'utilities'
  | 'dining'
  | 'entertainment'
  | 'transportation'
  | 'travel'
  | 'shopping'
  | 'services'
  | 'other'
  | 'settlement';

export interface FormattedBalance {
  friendId: string;
  friendName: string;
  friendAvatar: string;
  amount: number;
  youOwe: boolean;
}

/** The full persistable application state. */
export interface AppState {
  currentUser: User;
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  /** First-class settlements (Phase 3). */
  settlements: Settlement[];
  /** Append-only audit/activity log (Phase 2). */
  activityEvents: ActivityEvent[];
  /** Bulk-import records, newest first (Phase 5a). */
  importBatches: ImportBatch[];
}

// Re-export the activity-log event type so consumers get it from the central
// types module without reaching into services.
export type { ActivityEvent };
// `SplitMode` is declared next to the engine that resolves it, and re-exported
// here because `Expense` now carries one.
export type { SplitMode };