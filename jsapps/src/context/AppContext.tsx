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
  addGroup: (groupDetails: { name: string; avatarUrl?: string; memberIds: string[] }) => Promise<void>;
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

  const addGroup = async (groupDetails: { name: string; avatarUrl?: string; memberIds: string[] }) => {
    if (!currentUser) {
      console.error("addGroup: No current user found. Cannot create group.");
      // Optionally set an error state here if one exists for such issues
      return;
    }

    try {
      // 1. Insert into 'groups' table
      const { data: newGroupData, error: groupError } = await supabase
        .from('groups')
        .insert([{
          name: groupDetails.name,
          avatar_url: groupDetails.avatarUrl,
          created_by: currentUser.id,
        }])
        .select()
        .single();

      if (groupError) {
        console.error('Error inserting group:', groupError);
        setError('Failed to create group. ' + groupError.message); // Update main error state
        return;
      }

      if (!newGroupData) {
        console.error('No data returned for new group.');
        setError('Failed to create group: No data returned.');
        return;
      }

      const newGroupId = newGroupData.id;

      // 2. Prepare and insert into 'group_members' table
      const allMemberIds = Array.from(new Set([...groupDetails.memberIds, currentUser.id]));
      const membersToInsert = allMemberIds.map(userId => ({
        group_id: newGroupId,
        user_id: userId,
      }));

      if (membersToInsert.length > 0) {
        const { error: membersError } = await supabase
          .from('group_members')
          .insert(membersToInsert);

        if (membersError) {
          console.error('Error inserting group members:', membersError);
          setError('Group created, but failed to add members. ' + membersError.message);
          // Attempt to re-fetch groups anyway, or implement cleanup
          // For now, we'll try to re-fetch groups.
        }
      }

      // 3. Refresh Groups State
      // Using the nested select approach for efficiency as suggested
      const { data: freshGroups, error: freshGroupsError } = await supabase
        .from('groups')
        .select(`
          id,
          name,
          avatar_url,
          created_by,
          created_at,
          group_members (
            user_id
          )
        `);
        // Ensure your 'Group' type and this query are compatible.
        // The 'group_members' part will be an array of objects like { user_id: string }.

      if (freshGroupsError) {
        console.error('Error re-fetching groups:', freshGroupsError);
        setError('Failed to refresh groups after adding new one. ' + freshGroupsError.message);
      } else if (freshGroups) {
        const processedGroups: Group[] = freshGroups.map((g: any) => ({ // Use 'any' or define a more specific type for Supabase response
          id: g.id,
          name: g.name,
          avatar: g.avatar_url || undefined, // Match Group type
          members: g.group_members.map((gm: { user_id: string }) => gm.user_id),
          // Add other fields if your Group type has them, e.g., created_by, created_at
        }));
        setGroups(processedGroups);
        setError(null); // Clear previous errors if successful
      } else {
        // Handle case where freshGroups is null but no error (should be rare)
        setGroups([]); // Or keep existing state
      }

    } catch (e: any) {
      console.error('Unexpected error in addGroup:', e);
      setError('An unexpected error occurred while creating the group. ' + e.message);
    }
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
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

        if (authError) {
          console.error('Error fetching authenticated user:', authError);
          setError('Error checking authentication status.'); // More generic error
          setCurrentUser(null);
          // setIsLoading(false) will be handled by finally
          return;
        }

        if (!authUser) {
          // No user is logged in, this is not an "error" for the app, just a state.
          setCurrentUser(null);
          setFriends([]);
          setGroups([]);
          setExpenses([]);
          // setIsLoading(false) will be handled by finally
          return; // Stop further data fetching as it depends on a user
        }

        // If authUser exists, proceed to fetch their details from 'users' table and other data
        const { data: usersData, error: usersError } = await supabase.from('users').select('*') as { data: Database['public']['Tables']['users']['Row'][] | null, error: any };

        const { data: usersData, error: usersError } = await supabase.from('users').select('*') as { data: Database['public']['Tables']['users']['Row'][] | null, error: any };

        if (usersError) {
          console.error('Error fetching users:', usersError);
          setError('Failed to fetch user data.');
          // Set a minimal current user from auth data if users table fails
          setCurrentUser({
            id: authUser.id,
            name: authUser.email || 'User',
            avatar: '',
            email: authUser.email || '',
          });
          setFriends([]);
          // setIsLoading(false) will be handled by finally
          return;
        }
        
        if (!usersData) { // This case handles explicit null data without an error object
            console.warn('No users data returned, though no explicit error from Supabase call.');
            setError('Failed to retrieve user profiles.');
            setCurrentUser({ // Set a minimal current user
                id: authUser.id,
                name: authUser.email || 'User',
                avatar: '',
                email: authUser.email || '',
            });
            setFriends([]);
            // setIsLoading(false) will be handled by finally
            return;
        }

        const foundUser = usersData.find(u => u.id === authUser.id);

        if (foundUser) {
          setCurrentUser({
            id: foundUser.id,
            name: foundUser.name || '',
            avatar: foundUser.avatar_url || '', // Use empty string if null
            email: foundUser.email || '',
          });
          setFriends(usersData.filter(u => u.id !== authUser.id).map(f => ({
            id: f.id,
            name: f.name || '',
            avatar: f.avatar_url || '', // Use empty string if null
            email: f.email || '',
          })));
        } else {
          // AuthUser exists but not in 'users' table.
          console.warn(`Authenticated user ${authUser.id} not found in users table. User might be new or data inconsistent.`);
          setCurrentUser({
            id: authUser.id,
            email: authUser.email || '',
            name: authUser.email || 'New User', // Fallback name
            avatar: '', // Default or empty avatar
          });
          setFriends([]); // No friends if user data is incomplete like this
        }

        // Fetch Groups and Members (only if authUser was present)
        const { data: groupsData, error: groupsError } = await supabase.from('groups').select('*') as { data: Database['public']['Tables']['groups']['Row'][] | null, error: any };
        if (groupsError) {
          console.error('Error fetching groups:', groupsError);
          setError(groupsError?.message || 'Could not fetch groups.');
          // Do not return; try to fetch expenses. Data will be partial.
        } else if (groupsData) {
          const processedGroups: Group[] = await Promise.all(groupsData.map(async (group) => {
            const { data: membersData, error: membersError } = await supabase.from('group_members').select('user_id').eq('group_id', group.id) as { data: { user_id: string }[] | null, error: any };
            if (membersError || !membersData) { // Ensure membersData is not null
              console.error(`Error fetching members for group ${group.id}:`, membersError || 'No members data');
              return {
                id: group.id,
                name: group.name,
                avatar: group.avatar_url || '',
                members: [],
              };
            }
            return {
              id: group.id,
              name: group.name,
              avatar: group.avatar_url || '',
              members: membersData.map(m => m.user_id),
            };
          }));
          setGroups(processedGroups);
        } else {
          setGroups([]); // No groups found or no data
        }

        // Fetch Expenses and Splits (only if authUser was present and users fetch was successful enough to set a currentUser)
        const { data: expensesData, error: expensesError } = await supabase.from('expenses').select('*') as { data: Database['public']['Tables']['expenses']['Row'][] | null, error: any };
        if (expensesError) {
          console.error('Error fetching expenses:', expensesError);
          setError(expensesError?.message || 'Could not fetch expenses.');
          // Do not return; data will be partial.
        } else if (expensesData) {
          const processedExpenses: Expense[] = await Promise.all(expensesData.map(async (expense) => {
            const { data: splitsData, error: splitsError } = await supabase.from('expense_splits').select('user_id, amount').eq('expense_id', expense.id) as { data: { user_id: string, amount: number }[] | null, error: any };
            if (splitsError || !splitsData) { // Ensure splitsData is not null
              console.error(`Error fetching splits for expense ${expense.id}:`, splitsError || 'No splits data');
              return {
                id: expense.id,
                description: expense.description,
                amount: expense.amount,
                paidBy: expense.paid_by,
                splitWith: [],
                category: expense.category as ExpenseCategory,
                currency: expense.currency || 'USD',
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
        } else {
          setExpenses([]); // No expenses found or no data
        }

      } catch (e: any) {
        console.error('Unexpected error fetching data:', e);
        setError(e.message || 'An unexpected error occurred.');
        setCurrentUser(null); // Clear user state on unexpected error
      } finally {
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