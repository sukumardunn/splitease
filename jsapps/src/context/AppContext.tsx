import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppState, Expense, Friend, Group, Settlement, User } from '../types';
import { demoData } from '../data/demoData';
import { loadState, saveState } from '../services/localStore';
import {
  computeNetBalances,
  computeAbsoluteNet,
  simplifyDebts,
  Transfer,
} from '../services/splitEngine';
import {
  ActivityEvent,
  CreateEventInput,
  appendActivityEvent,
  createActivityEvent,
} from '../services/activityLog';

interface AppContextType {
  currentUser: User;
  friends: Friend[];
  /** Active (non-soft-deleted) groups. */
  groups: Group[];
  /** Active (non-soft-deleted) expenses. */
  expenses: Expense[];
  /** Active (non-soft-deleted) settlements. */
  settlements: Settlement[];
  /** Append-only audit/activity log, newest first. */
  activityEvents: ActivityEvent[];
  /** Soft-deleted expenses, most-recently-deleted first (for the Recently Deleted view). */
  deletedExpenses: Expense[];
  /** Soft-deleted groups, most-recently-deleted first. */
  deletedGroups: Group[];
  addExpense: (expense: Omit<Expense, 'id' | 'date'>) => void;
  updateExpense: (id: string, expense: Partial<Expense>) => void;
  /** Soft-delete: sets deletedAt; reversible via restoreExpense. */
  deleteExpense: (id: string) => void;
  restoreExpense: (id: string) => void;
  /** Permanent, irreversible removal (explicit user action from Recently Deleted). */
  purgeExpense: (id: string) => void;
  addGroup: (group: Omit<Group, 'id'>) => void;
  updateGroup: (id: string, group: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  restoreGroup: (id: string) => void;
  purgeGroup: (id: string) => void;
  settleDebt: (fromId: string, toId: string, amount: number, groupId?: string | null) => void;
  getBalances: () => { friend: Friend; balance: number }[];
  /** Minimal set of "who pays whom" transfers that settles the given participants
   *  (defaults to the current user + all friends). Powers debt simplification. */
  getSuggestedSettlements: (participantIds?: string[]) => Transfer[];
  getGroupById: (id: string) => Group | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
};

interface AppContextProviderProps {
  children: ReactNode;
}

/** Monotonic-ish unique id generator (avoids Date.now() collisions on rapid calls). */
let idSequence = 0;
function newId(prefix: string): string {
  idSequence += 1;
  return `${prefix}_${Date.now()}_${idSequence}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Load persisted state on first render, seeding from demo data on a fresh device. */
function getInitialState(): AppState {
  const persisted = loadState();
  if (persisted) {
    // Defensive defaults so an older-but-compatible envelope never crashes the app.
    return {
      ...persisted,
      settlements: persisted.settlements ?? [],
      activityEvents: persisted.activityEvents ?? [],
    };
  }
  return {
    currentUser: demoData.currentUser,
    friends: demoData.friends,
    groups: demoData.groups,
    expenses: demoData.expenses,
    settlements: [],
    activityEvents: [],
  };
}

export const AppContextProvider: React.FC<AppContextProviderProps> = ({ children }) => {
  const [state, setState] = useState<AppState>(getInitialState);
  const { currentUser, friends } = state;

  // Persist the whole state to localStorage on every change.
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Derived active/deleted views.
  const expenses = state.expenses.filter((e) => !e.deletedAt);
  const groups = state.groups.filter((g) => !g.deletedAt);
  const settlements = state.settlements.filter((s) => !s.deletedAt);
  const activityEvents = state.activityEvents;
  const deletedExpenses = state.expenses
    .filter((e) => !!e.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  const deletedGroups = state.groups
    .filter((g) => !!g.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

  /** Append an audit event to a log array (pure). */
  const withEvent = (
    log: ActivityEvent[],
    input: Omit<CreateEventInput, 'actorId'> & { actorId?: string }
  ): ActivityEvent[] =>
    appendActivityEvent(
      log,
      createActivityEvent({ actorId: currentUser.id, ...input })
    );

  const addExpense = (expense: Omit<Expense, 'id' | 'date'>) => {
    const newExpense: Expense = {
      ...expense,
      id: newId('exp'),
      date: new Date().toISOString(),
      deletedAt: null,
    };
    setState((prev) => ({
      ...prev,
      expenses: [newExpense, ...prev.expenses],
      activityEvents: withEvent(prev.activityEvents, {
        action: 'expense.create',
        entityType: 'expense',
        entityId: newExpense.id,
        groupId: newExpense.groupId,
        after: newExpense,
      }),
    }));
  };

  const updateExpense = (id: string, updatedExpense: Partial<Expense>) => {
    setState((prev) => {
      const before = prev.expenses.find((e) => e.id === id);
      if (!before) return prev;
      const after = { ...before, ...updatedExpense };
      return {
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? after : e)),
        activityEvents: withEvent(prev.activityEvents, {
          action: 'expense.update',
          entityType: 'expense',
          entityId: id,
          groupId: after.groupId,
          before,
          after,
        }),
      };
    });
  };

  const deleteExpense = (id: string) => {
    setState((prev) => {
      const before = prev.expenses.find((e) => e.id === id && !e.deletedAt);
      if (!before) return prev;
      const deletedAt = new Date().toISOString();
      return {
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deletedAt } : e)),
        activityEvents: withEvent(prev.activityEvents, {
          action: 'expense.delete',
          entityType: 'expense',
          entityId: id,
          groupId: before.groupId,
          before,
        }),
      };
    });
  };

  const restoreExpense = (id: string) => {
    setState((prev) => {
      const target = prev.expenses.find((e) => e.id === id && !!e.deletedAt);
      if (!target) return prev;
      const after = { ...target, deletedAt: null };
      return {
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? after : e)),
        activityEvents: withEvent(prev.activityEvents, {
          action: 'expense.restore',
          entityType: 'expense',
          entityId: id,
          groupId: after.groupId,
          after,
        }),
      };
    });
  };

  const purgeExpense = (id: string) => {
    setState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== id),
    }));
  };

  const addGroup = (group: Omit<Group, 'id'>) => {
    const newGroup: Group = { ...group, id: newId('grp'), deletedAt: null };
    setState((prev) => ({
      ...prev,
      groups: [newGroup, ...prev.groups],
      activityEvents: withEvent(prev.activityEvents, {
        action: 'group.create',
        entityType: 'group',
        entityId: newGroup.id,
        groupId: newGroup.id,
        after: newGroup,
      }),
    }));
  };

  const updateGroup = (id: string, updatedGroup: Partial<Group>) => {
    setState((prev) => {
      const before = prev.groups.find((g) => g.id === id);
      if (!before) return prev;
      const after = { ...before, ...updatedGroup };
      return {
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? after : g)),
        activityEvents: withEvent(prev.activityEvents, {
          action: 'group.update',
          entityType: 'group',
          entityId: id,
          groupId: id,
          before,
          after,
        }),
      };
    });
  };

  const deleteGroup = (id: string) => {
    setState((prev) => {
      const before = prev.groups.find((g) => g.id === id && !g.deletedAt);
      if (!before) return prev;
      const deletedAt = new Date().toISOString();
      return {
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? { ...g, deletedAt } : g)),
        activityEvents: withEvent(prev.activityEvents, {
          action: 'group.delete',
          entityType: 'group',
          entityId: id,
          groupId: id,
          before,
        }),
      };
    });
  };

  const restoreGroup = (id: string) => {
    setState((prev) => {
      const target = prev.groups.find((g) => g.id === id && !!g.deletedAt);
      if (!target) return prev;
      const after = { ...target, deletedAt: null };
      return {
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? after : g)),
        activityEvents: withEvent(prev.activityEvents, {
          action: 'group.restore',
          entityType: 'group',
          entityId: id,
          groupId: id,
          after,
        }),
      };
    });
  };

  const purgeGroup = (id: string) => {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.filter((g) => g.id !== id),
    }));
  };

  const settleDebt = (
    fromId: string,
    toId: string,
    amount: number,
    groupId: string | null = null
  ) => {
    const settlement: Settlement = {
      id: newId('set'),
      fromUserId: fromId,
      toUserId: toId,
      amount,
      currency: 'USD',
      date: new Date().toISOString(),
      groupId,
      deletedAt: null,
    };
    setState((prev) => ({
      ...prev,
      settlements: [settlement, ...prev.settlements],
      activityEvents: withEvent(prev.activityEvents, {
        action: 'settlement.create',
        entityType: 'settlement',
        entityId: settlement.id,
        groupId,
        after: settlement,
      }),
    }));
  };

  const getBalances = () => {
    const friendIds = friends.map((f) => f.id);
    const balances = computeNetBalances(
      currentUser.id,
      friendIds,
      expenses,
      settlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
      }))
    );
    return friendIds.map((friendId) => ({
      friend: friends.find((f) => f.id === friendId)!,
      balance: balances[friendId] ?? 0,
    }));
  };

  const getSuggestedSettlements = (participantIds?: string[]): Transfer[] => {
    const ids = participantIds ?? [currentUser.id, ...friends.map((f) => f.id)];
    const net = computeAbsoluteNet(
      ids,
      expenses,
      settlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
      }))
    );
    return simplifyDebts(net);
  };

  const getGroupById = (id: string) => groups.find((group) => group.id === id);

  const value: AppContextType = {
    currentUser,
    friends,
    groups,
    expenses,
    settlements,
    activityEvents,
    deletedExpenses,
    deletedGroups,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    purgeExpense,
    addGroup,
    updateGroup,
    deleteGroup,
    restoreGroup,
    purgeGroup,
    settleDebt,
    getBalances,
    getSuggestedSettlements,
    getGroupById,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
