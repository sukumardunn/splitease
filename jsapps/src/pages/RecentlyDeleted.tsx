import React from 'react';
import { Trash2, RotateCcw, XCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { formatDate } from '../utils/helpers';

const RecentlyDeleted: React.FC = () => {
  const {
    deletedExpenses,
    deletedGroups,
    restoreExpense,
    purgeExpense,
    restoreGroup,
    purgeGroup,
  } = useAppContext();

  const isEmpty = deletedExpenses.length === 0 && deletedGroups.length === 0;

  const handlePurgeExpense = (id: string, description: string) => {
    if (window.confirm(`Permanently delete "${description}"? This cannot be undone.`)) {
      purgeExpense(id);
    }
  };

  const handlePurgeGroup = (id: string, name: string) => {
    if (window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) {
      purgeGroup(id);
    }
  };

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Recently Deleted</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {isEmpty ? (
          <div className="text-center py-12">
            <Trash2 className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nothing in the trash</h3>
            <p className="text-gray-500">Deleted expenses and groups will show up here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {deletedExpenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium text-gray-900">{expense.description}</p>
                  <p className="text-sm text-gray-500">
                    Deleted {expense.deletedAt ? formatDate(expense.deletedAt) : 'recently'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => restoreExpense(expense.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore
                  </button>
                  <button
                    onClick={() => handlePurgeExpense(expense.id, expense.description)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    Delete forever
                  </button>
                </div>
              </div>
            ))}

            {deletedGroups.map((group) => (
              <div key={group.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium text-gray-900">{group.name}</p>
                  <p className="text-sm text-gray-500">
                    Deleted {group.deletedAt ? formatDate(group.deletedAt) : 'recently'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => restoreGroup(group.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore
                  </button>
                  <button
                    onClick={() => handlePurgeGroup(group.id, group.name)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    Delete forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentlyDeleted;
