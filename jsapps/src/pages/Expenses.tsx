import React, { useState } from 'react';
import { Plus, Filter, Search, Calendar, Receipt } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import ExpenseItem from '../components/expenses/ExpenseItem';
import { Expense, ExpenseCategory } from '../types';
import AddExpenseModal from '../components/expenses/AddExpenseModal';

const Expenses: React.FC = () => {
  const { expenses } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  
  // Sort expenses by date (newest first)
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  // Filter expenses based on search query and category
  const filteredExpenses = sortedExpenses.filter(expense => {
    // Filter by search query
    const matchesSearch = expense.description
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    
    // Filter by category
    const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });
  
  // Group expenses by month
  const groupExpensesByMonth = (expenses: Expense[]) => {
    const grouped: Record<string, Expense[]> = {};
    
    expenses.forEach(expense => {
      const date = new Date(expense.date);
      const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      if (!grouped[month]) {
        grouped[month] = [];
      }
      
      grouped[month].push(expense);
    });
    
    return grouped;
  };
  
  const groupedExpenses = groupExpensesByMonth(filteredExpenses);
  
  const categories: { value: ExpenseCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'All Categories' },
    { value: 'groceries', label: 'Groceries' },
    { value: 'rent', label: 'Rent' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'dining', label: 'Dining' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'transportation', label: 'Transportation' },
    { value: 'travel', label: 'Travel' },
    { value: 'shopping', label: 'Shopping' },
    { value: 'services', label: 'Services' },
    { value: 'other', label: 'Other' },
  ];
  
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Expenses</h1>
        
        <button 
          onClick={() => setIsExpenseModalOpen(true)}
          className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors duration-200 md:self-end"
        >
          <Plus className="h-5 w-5 mr-2" />
          <span>Add Expense</span>
        </button>
      </div>
      
      {/* Search and filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search expenses..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2">
          <div className="relative">
            <select
              className="appearance-none pl-10 pr-8 py-2 border border-gray-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | 'all')}
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Filter className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          <button className="px-3 py-2 border border-gray-300 bg-white rounded-lg flex items-center hover:bg-gray-50 transition-colors">
            <Calendar className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </div>
      
      {/* Expenses list */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {Object.keys(groupedExpenses).length > 0 ? (
          <div>
            {Object.entries(groupedExpenses).map(([month, expenses]) => (
              <div key={month}>
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-medium text-gray-700">{month}</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {expenses.map(expense => (
                    <div key={expense.id} className="px-6">
                      <ExpenseItem expense={expense} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No expenses found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || categoryFilter !== 'all'
                ? "Try adjusting your search filters."
                : "You haven't added any expenses yet."}
            </p>
            {!searchQuery && categoryFilter === 'all' && (
              <button 
                onClick={() => setIsExpenseModalOpen(true)}
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors duration-200 mx-auto"
              >
                <Plus className="h-5 w-5 mr-2" />
                <span>Add Expense</span>
              </button>
            )}
          </div>
        )}
      </div>

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
      />
    </div>
  );
};

export default Expenses;