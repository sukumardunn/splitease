import React, { useState } from 'react';
import { Trash2, StickyNote, Pencil, Paperclip } from 'lucide-react';
import { Expense } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { getExpenseIcon, formatDate } from '../../utils/helpers';
import { getCategoryColors } from '../../utils/categoryColors';
import { useToast } from '../ui/Toast';
import AddExpenseModal from './AddExpenseModal';
import ReceiptViewer from './ReceiptViewer';

interface ExpenseItemProps {
  expense: Expense;
}

const ExpenseItem: React.FC<ExpenseItemProps> = ({ expense }) => {
  const { currentUser, friends, groups, deleteExpense, restoreExpense, receipts } =
    useAppContext();
  const { showToast } = useToast();
  // Held here rather than in each page so all three render sites (Dashboard,
  // Expenses, GroupDetail) get editing for free, the way delete already works.
  const [isEditing, setIsEditing] = useState(false);
  const [isViewingReceipt, setIsViewingReceipt] = useState(false);
  // Metadata only — the image itself is fetched by `ReceiptViewer` when opened,
  // so a list of a hundred rows still downloads no image bytes.
  const receipt = receipts[expense.id];

  // A settlement is a cash transfer, not a cost to re-split, and the expense
  // form's category picker excludes `settlement` by construction — offering
  // edit here would silently recategorise it on save.
  const isSettlement = expense.category === 'settlement';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteExpense(expense.id);
    showToast({
      message: 'Expense deleted',
      actionLabel: 'Undo',
      onAction: () => restoreExpense(expense.id),
    });
  };
  
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
  // Literal class names from a static map: interpolating the hue here emitted no
  // CSS at all, because Tailwind only sees what is written out in the source.
  const colors = getCategoryColors(expense.category);

  return (
    <div className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors duration-200">
      <div className="flex-shrink-0 mr-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colors.bg}`}>
          <Icon className={`w-5 h-5 ${colors.text}`} />
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {expense.description}
            </h3>
            <p className="text-xs text-gray-500">
              {formatDate(expense.date)}
              {group && <span> • {group.name}</span>}
            </p>
            {expense.notes && (
              // Truncated to keep the row one height; `title` exposes the rest,
              // since there is no expense detail view to link to yet.
              <p
                className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 italic"
                title={expense.notes}
              >
                <StickyNote className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{expense.notes}</span>
              </p>
            )}
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

      {receipt && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsViewingReceipt(true);
          }}
          aria-label={`View the receipt for "${expense.description}"`}
          className="flex-shrink-0 ml-3 p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
        >
          <Paperclip className="h-4 w-4" />
        </button>
      )}

      {!isSettlement && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          aria-label={`Edit "${expense.description}"`}
          className="flex-shrink-0 ml-3 p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        onClick={handleDelete}
        aria-label={`Delete "${expense.description}"`}
        className="flex-shrink-0 ml-1 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <AddExpenseModal
        isOpen={isEditing}
        expense={expense}
        onClose={() => setIsEditing(false)}
      />

      {/* Mounted only while open, so opening is what triggers the image fetch. */}
      {receipt && isViewingReceipt && (
        <ReceiptViewer
          isOpen
          expenseId={expense.id}
          description={expense.description}
          meta={receipt}
          onClose={() => setIsViewingReceipt(false)}
        />
      )}
    </div>
  );
};

export default ExpenseItem;