import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Expense, Friend, Group, User, ExpenseCategory } from '../types';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';

interface AppContextType {
  currentUser: User | null;
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
  isLoading: boolean;
  error: string | null;
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
    if (isLoading || !currentUser) {
      return [];
    }

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
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch Current User and All Users
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
          console.error('Error fetching auth user:', authError);
          setError(authError?.message || 'Could not authenticate user.');
          setIsLoading(false);
          return;
        }

        const { data: usersData, error: usersError } = await supabase.from('users').select('*') as { data: Database['public']['Tables']['users']['Row'][] | null, error: any };
        if (usersError || !usersData) {
          console.error('Error fetching users:', usersError);
          setError(usersError?.message || 'Could not fetch users.');
          setIsLoading(false);
          return;
        }

        const currentSupabaseUser = usersData.find(u => u.id === authUser.id);
        if (!currentSupabaseUser) {
          setError('Current user not found in database.');
          setIsLoading(false);
          return;
        }
        setCurrentUser({
            id: currentSupabaseUser.id,
            name: currentSupabaseUser.name || '',
            avatar: currentSupabaseUser.avatar_url || undefined,
            email: currentSupabaseUser.email || '',
        });

        setFriends(usersData.filter(u => u.id !== authUser.id).map(f => ({
            id: f.id,
            name: f.name || '',
            avatar: f.avatar_url || undefined,
            email: f.email || '',
        })));

        // Fetch Groups and Members
        const { data: groupsData, error: groupsError } = await supabase.from('groups').select('*') as { data: Database['public']['Tables']['groups']['Row'][] | null, error: any };
        if (groupsError || !groupsData) {
          console.error('Error fetching groups:', groupsError);
          setError(groupsError?.message || 'Could not fetch groups.');
          setIsLoading(false);
          return;
        }

        const processedGroups: Group[] = await Promise.all(groupsData.map(async (group) => {
          const { data: membersData, error: membersError } = await supabase.from('group_members').select('user_id').eq('group_id', group.id) as { data: { user_id: string }[] | null, error: any };
          if (membersError || !membersData) {
            console.error(`Error fetching members for group ${group.id}:`, membersError);
            // Continue processing other groups, or throw specific error
            return {
              id: group.id,
              name: group.name,
              avatar: group.avatar_url || undefined,
              members: [], // Or handle error more gracefully
            };
          }
          return {
            id: group.id,
            name: group.name,
            avatar: group.avatar_url || undefined,
            members: membersData.map(m => m.user_id),
          };
        }));
        setGroups(processedGroups);

        // Fetch Expenses and Splits
        const { data: expensesData, error: expensesError } = await supabase.from('expenses').select('*') as { data: Database['public']['Tables']['expenses']['Row'][] | null, error: any };
        if (expensesError || !expensesData) {
          console.error('Error fetching expenses:', expensesError);
          setError(expensesError?.message || 'Could not fetch expenses.');
          setIsLoading(false);
          return;
        }

        const processedExpenses: Expense[] = await Promise.all(expensesData.map(async (expense) => {
          const { data: splitsData, error: splitsError } = await supabase.from('expense_splits').select('user_id, amount').eq('expense_id', expense.id) as { data: { user_id: string, amount: number }[] | null, error: any };
          if (splitsError || !splitsData) {
            console.error(`Error fetching splits for expense ${expense.id}:`, splitsError);
             // Continue processing other expenses, or throw specific error
            return {
              id: expense.id,
              description: expense.description,
              amount: expense.amount,
              paidBy: expense.paid_by,
              splitWith: [], // Or handle error
              category: expense.category as ExpenseCategory,
              currency: expense.currency || 'USD', // Default currency if not set
              date: expense.created_at,
              groupId: expense.group_id || null,
            };
          }
          return {
            id: expense.id,
            description: expense.description,
            amount: expense.amount,
            paidBy: expense.paid_by,
            splitWith: splitsData.map(s => ({ userId: s.user_id, amount: s.amount })),
            category: expense.category as ExpenseCategory,
            currency: expense.currency || 'USD',
            date: expense.created_at,
            groupId: expense.group_id || null,
          };
        }));
        setExpenses(processedExpenses);

        setIsLoading(false);
      } catch (e: any) {
        console.error('Unexpected error fetching data:', e);
        setError(e.message || 'An unexpected error occurred.');
        setIsLoading(false);
      }
    };

    fetchData();
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
    isLoading,
    error,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};