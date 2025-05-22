import { User, Friend, Group, Expense } from '../types';

// Dummy user data
const currentUser: User = {
  id: 'user1',
  name: 'You',
  email: 'you@example.com',
  avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
};

const friends: Friend[] = [
  {
    id: 'friend1',
    name: 'Alex Johnson',
    email: 'alex@example.com',
    avatar: 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  },
  {
    id: 'friend2',
    name: 'Taylor Swift',
    email: 'taylor@example.com',
    avatar: 'https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  },
  {
    id: 'friend3',
    name: 'Morgan Freeman',
    email: 'morgan@example.com',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  },
  {
    id: 'friend4',
    name: 'Jamie Smith',
    email: 'jamie@example.com',
    avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  },
];

const groups: Group[] = [
  {
    id: 'group1',
    name: 'Roommates',
    members: ['user1', 'friend1', 'friend2'],
    avatar: 'https://images.pexels.com/photos/1643384/pexels-photo-1643384.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  },
  {
    id: 'group2',
    name: 'Trip to Bali',
    members: ['user1', 'friend1', 'friend3', 'friend4'],
    avatar: 'https://images.pexels.com/photos/3293148/pexels-photo-3293148.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  },
  {
    id: 'group3',
    name: 'Dinner Club',
    members: ['user1', 'friend2', 'friend4'],
    avatar: 'https://images.pexels.com/photos/5638732/pexels-photo-5638732.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  },
];

const expenses: Expense[] = [
  {
    id: 'expense1',
    description: 'Groceries',
    amount: 89.57,
    paidBy: 'user1',
    splitWith: [
      { userId: 'user1', amount: 29.86 },
      { userId: 'friend1', amount: 29.86 },
      { userId: 'friend2', amount: 29.85 },
    ],
    date: '2023-05-15T14:30:00Z',
    category: 'groceries',
    currency: 'USD',
    groupId: 'group1',
  },
  {
    id: 'expense2',
    description: 'Electricity bill',
    amount: 120.00,
    paidBy: 'friend1',
    splitWith: [
      { userId: 'user1', amount: 40.00 },
      { userId: 'friend1', amount: 40.00 },
      { userId: 'friend2', amount: 40.00 },
    ],
    date: '2023-05-10T09:15:00Z',
    category: 'utilities',
    currency: 'USD',
    groupId: 'group1',
  },
  {
    id: 'expense3',
    description: 'Dinner at Nobu',
    amount: 285.45,
    paidBy: 'friend2',
    splitWith: [
      { userId: 'user1', amount: 95.15 },
      { userId: 'friend2', amount: 95.15 },
      { userId: 'friend4', amount: 95.15 },
    ],
    date: '2023-05-12T20:00:00Z',
    category: 'dining',
    currency: 'USD',
    groupId: 'group3',
  },
  {
    id: 'expense4',
    description: 'Hotel in Bali',
    amount: 1200.00,
    paidBy: 'user1',
    splitWith: [
      { userId: 'user1', amount: 300.00 },
      { userId: 'friend1', amount: 300.00 },
      { userId: 'friend3', amount: 300.00 },
      { userId: 'friend4', amount: 300.00 },
    ],
    date: '2023-04-20T12:00:00Z',
    category: 'travel',
    currency: 'USD',
    groupId: 'group2',
  },
  {
    id: 'expense5',
    description: 'Taxi to airport',
    amount: 60.00,
    paidBy: 'friend3',
    splitWith: [
      { userId: 'user1', amount: 15.00 },
      { userId: 'friend1', amount: 15.00 },
      { userId: 'friend3', amount: 15.00 },
      { userId: 'friend4', amount: 15.00 },
    ],
    date: '2023-04-19T08:30:00Z',
    category: 'transportation',
    currency: 'USD',
    groupId: 'group2',
  },
  {
    id: 'expense6',
    description: 'Movie tickets',
    amount: 45.00,
    paidBy: 'friend4',
    splitWith: [
      { userId: 'user1', amount: 15.00 },
      { userId: 'friend2', amount: 15.00 },
      { userId: 'friend4', amount: 15.00 },
    ],
    date: '2023-05-05T19:00:00Z',
    category: 'entertainment',
    currency: 'USD',
    groupId: 'group3',
  },
];

export const demoData = {
  currentUser,
  friends,
  groups,
  expenses,
};