export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Friend extends User {}

export interface Split {
  userId: string;
  amount: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string; // user ID of who paid
  splitWith: Split[]; // array of user IDs and amounts
  date: string;
  category: ExpenseCategory;
  currency: string;
  groupId: string | null;
}

export interface Group {
  id: string;
  name: string;
  members: string[]; // array of user IDs
  avatar: string;
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