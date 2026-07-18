import type { ActivityEvent } from './services/activityLog';

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
}

// Re-export the activity-log event type so consumers get it from the central
// types module without reaching into services.
export type { ActivityEvent };