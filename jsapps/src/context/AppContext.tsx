import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Expense, Friend, Group, User } from '../types';
import { demoData } from '../data/demoData';

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

export const AppContextProvider: React.FC<AppContextProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(demoData.currentUser);
  const [friends, setFriends] = useState<Friend[]>(demoData.friends);
  const [groups, setGroups] = useState<Group[]>(demoData.groups);
  const [expenses, setExpenses] = useState<Expense[]>(demoData.expenses);

  const addExpense = (expense: Omit<Expense, 'id' | 'date'>) => {
    const newExpense: Expense = {
      ...expense,
      id: Date.now().toString(),
      date: new Date().toISOString(),
    };
    setExpenses((prev) => [newExpense, ...prev]);
  };

  const updateExpense = (id: string, updatedExpense: Partial<Expense>) => {
    setExpenses((prev) =>
      prev.map((expense) =>
        expense.id === id ? { ...expense, ...updatedExpense } : expense
      )
    );
  };

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((expense) => expense.id !== id));
  };

  const addGroup = (group: Omit<Group, 'id'>) => {
    const newGroup: Group = {
      ...group,
      id: Date.now().toString(),
    };
    setGroups((prev) => [newGroup, ...prev]);
  };

  const updateGroup = (id: string, updatedGroup: Partial<Group>) => {
    setGroups((prev) =>
      prev.map((group) => (group.id === id ? { ...group, ...updatedGroup } : group))
    );
  };

  const deleteGroup = (id: string) => {
    setGroups((prev) => prev.filter((group) => group.id !== id));
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
    const balances = new Map<string, number>();

    // Initialize balances for all friends
    friends.forEach((friend) => {
      balances.set(friend.id, 0);
    });

    // Calculate balances based on expenses
    expenses.forEach((expense) => {
      if (expense.paidBy === currentUser.id) {
        // Current user paid, others owe them
        expense.splitWith.forEach((split) => {
          if (split.userId !== currentUser.id) {
            balances.set(
              split.userId,
              (balances.get(split.userId) || 0) + split.amount
            );
          }
        });
      } else if (expense.splitWith.some((split) => split.userId === currentUser.id)) {
        // Current user owes the payer
        const userSplit = expense.splitWith.find(
          (split) => split.userId === currentUser.id
        );
        if (userSplit) {
          balances.set(
            expense.paidBy,
            (balances.get(expense.paidBy) || 0) - userSplit.amount
          );
        }
      }
    });

    // Convert to array of friend objects with balances
    return Array.from(balances.entries()).map(([friendId, balance]) => ({
      friend: friends.find((f) => f.id === friendId)!,
      balance,
    }));
  };

  const getGroupById = (id: string) => {
    return groups.find((group) => group.id === id);
  };

  useEffect(() => {
    // This would be a place to load data from localStorage or an API
    // For now, we're using the demo data
  }, []);

  const value = {
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