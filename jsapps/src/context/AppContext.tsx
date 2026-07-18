import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppState, Expense, Friend, Group, User } from '../types';
import { demoData } from '../data/demoData';
import { loadState, saveState } from '../services/localStore';
import { computeBalances } from '../services/splitCalculator';

interface AppContextType {
  currentUser: User;
  friends: Friend[];
  groups: Group[];
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'date'>) => void;
  updateExpense: (id: string, expense: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addGroup: (group: Omit<Group, 'id'>) => void;
  updateGroup: (id: string, group: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  settleDebt: (fromId: string, toId: string, amount: number) => void;
  getBalances: () => { friend: Friend; balance: number }[];
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

/** Load persisted state on first render, seeding from demo data on a fresh device. */
function getInitialState(): AppState {
  const persisted = loadState();
  if (persisted) return persisted;
  return {
    currentUser: demoData.currentUser,
    friends: demoData.friends,
    groups: demoData.groups,
    expenses: demoData.expenses,
  };
}

export const AppContextProvider: React.FC<AppContextProviderProps> = ({ children }) => {
  const [state, setState] = useState<AppState>(getInitialState);
  const { currentUser, friends, groups, expenses } = state;

  // Persist the whole state to localStorage on every change.
  useEffect(() => {
    saveState(state);
  }, [state]);

  const addExpense = (expense: Omit<Expense, 'id' | 'date'>) => {
    const newExpense: Expense = {
      ...expense,
      id: Date.now().toString(),
      date: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
  };

  const updateExpense = (id: string, updatedExpense: Partial<Expense>) => {
    setState((prev) => ({
      ...prev,
      expenses: prev.expenses.map((expense) =>
        expense.id === id ? { ...expense, ...updatedExpense } : expense
      ),
    }));
  };

  const deleteExpense = (id: string) => {
    setState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((expense) => expense.id !== id),
    }));
  };

  const addGroup = (group: Omit<Group, 'id'>) => {
    const newGroup: Group = { ...group, id: Date.now().toString() };
    setState((prev) => ({ ...prev, groups: [newGroup, ...prev.groups] }));
  };

  const updateGroup = (id: string, updatedGroup: Partial<Group>) => {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.id === id ? { ...group, ...updatedGroup } : group
      ),
    }));
  };

  const deleteGroup = (id: string) => {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.filter((group) => group.id !== id),
    }));
  };

  const settleDebt = (fromId: string, toId: string, amount: number) => {
    addExpense({
      description: 'Settlement',
      amount,
      paidBy: fromId,
      splitWith: [{ userId: toId, amount }],
      category: 'settlement',
      currency: 'USD',
      groupId: null,
    });
  };

  const getBalances = () => {
    const friendIds = friends.map((f) => f.id);
    const balances = computeBalances(currentUser.id, friendIds, expenses);
    return friendIds.map((friendId) => ({
      friend: friends.find((f) => f.id === friendId)!,
      balance: balances[friendId] ?? 0,
    }));
  };

  const getGroupById = (id: string) => groups.find((group) => group.id === id);

  const value: AppContextType = {
    currentUser,
    friends,
    groups,
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    addGroup,
    updateGroup,
    deleteGroup,
    settleDebt,
    getBalances,
    getGroupById,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
