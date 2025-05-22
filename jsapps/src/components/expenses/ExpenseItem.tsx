import React from 'react';
import { Expense } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { getExpenseIcon, formatDate } from '../../utils/helpers';

interface ExpenseItemProps {
  expense: Expense;
}

const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense }) => {
  const { currentUser, friends, groups } = useAppContext();
  
  // Find the payer
  const payer = expense.paidBy === currentUser.id
    ? currentUser
    : friends.find((f) => f.id === expense.paidBy);
  
  // Determine if the current user paid
  const youPaid = expense.paidBy === currentUser.id;
  
  // Find the group if it exists
  const group = expense.groupId
    ? groups.find((g) => g.id === expense.groupId)
    : null;
  
  // Find the user's split
  const userSplit = expense.splitWith.find((s) => s.userId === currentUser.id);
  const userOwes = !youPaid && userSplit ? userSplit.amount : 0;
  
  // What others owe to the current user
  const othersOwe = youPaid
    ? expense.splitWith
        .filter((s) => s.userId !== currentUser.id)
        .reduce((sum, s) => sum + s.amount, 0)
    : 0;
  
  const Icon = getExpenseIcon(expense.category);
  
  return (
    <div className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors duration-200">
      <div className="flex-shrink-0 mr-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-${getCategoryColor(expense.category)}-100`}>
          <Icon className={`w-5 h-5 text-${getCategoryColor(expense.category)}-600`} />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {expense.description}
            </h3>
            <p className="text-xs text-gray-500">
              {formatDate(expense.date)} 
              {group && <span> • {group.name}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-semibold ${youPaid ? 'text-green-600' : 'text-red-600'}`}>
              {youPaid ? `+$${othersOwe.toFixed(2)}` : `-$${userOwes.toFixed(2)}`}
            </p>
            <p className="text-xs text-gray-500">
              {youPaid ? 'you paid' : `${payer?.name} paid`} ${expense.amount.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to get color based on category
function getCategoryColor(category: string): string {
  switch (category) {
    case 'groceries':
      return 'blue';
    case 'rent':
      return 'purple';
    case 'utilities':
      return 'yellow';
    case 'dining':
      return 'orange';
    case 'entertainment':
      return 'pink';
    case 'transportation':
      return 'indigo';
    case 'travel':
      return 'cyan';
    case 'shopping':
      return 'emerald';
    case 'services':
      return 'violet';
    case 'settlement':
      return 'green';
    default:
      return 'gray';
  }
}

export default ExpenseItem;