import React from 'react';
import { ShoppingCart, Home, Lightbulb, Coffee, Film, Car, Plane, CreditCard, Wrench, DollarSign } from 'lucide-react';
import { ExpenseCategory } from '../types';

// Helper function to get icon based on expense category
export function getExpenseIcon(category: ExpenseCategory) {
  switch (category) {
    case 'groceries':
      return ShoppingCart;
    case 'rent':
      return Home;
    case 'utilities':
      return Lightbulb;
    case 'dining':
      return Coffee;
    case 'entertainment':
      return Film;
    case 'transportation':
      return Car;
    case 'travel':
      return Plane;
    case 'shopping':
      return CreditCard;
    case 'services':
      return Wrench;
    case 'settlement':
      return DollarSign;
    default:
      return CreditCard;
  }
}

// Format date in a readable format
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

// Format currency
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}