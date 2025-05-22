import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import ExpenseItem from '../components/expenses/ExpenseItem';
import BalanceSummary from '../components/dashboard/BalanceSummary';
import AddExpenseModal from '../components/expenses/AddExpenseModal';

const Dashboard: React.FC = () => {
  const { expenses, friends, getBalances, currentUser, isLoading, error } = useAppContext();
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  if (isLoading) {
    return <div className="p-6 text-center"><p>Loading dashboard data...</p></div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-600"><p>Error loading data: {error}</p></div>;
  }
  
  // Get recent expenses (last 5)
  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  
  // Get balances
  const balances = getBalances();
  
  // Calculate total balance
  const totalOwed = balances
    .filter((b) => b.balance > 0)
    .reduce((sum, b) => sum + b.balance, 0);
  
  const totalOwe = balances
    .filter((b) => b.balance < 0)
    .reduce((sum, b) => sum + Math.abs(b.balance), 0);

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Balances Summary */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Balances</h2>
            
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1 p-4 bg-green-50 rounded-lg">
                <div className="flex items-center mb-2">
                  <TrendingUp className="w-5 h-5 text-green-500 mr-2" />
                  <span className="text-sm font-medium text-green-700">You are owed</span>
                </div>
                <p className="text-2xl font-bold text-green-600">${totalOwed.toFixed(2)}</p>
              </div>
              
              <div className="flex-1 p-4 bg-red-50 rounded-lg">
                <div className="flex items-center mb-2">
                  <TrendingDown className="w-5 h-5 text-red-500 mr-2" />
                  <span className="text-sm font-medium text-red-700">You owe</span>
                </div>
                <p className="text-2xl font-bold text-red-600">${totalOwe.toFixed(2)}</p>
              </div>
            </div>
            
            <BalanceSummary balances={balances} />
            
            <div className="mt-4 text-right">
              <Link to="/expenses" className="text-teal-600 hover:text-teal-700 text-sm font-medium inline-flex items-center">
                View all balances
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>
        
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Recent Activity</h2>
              <button 
                onClick={() => setIsExpenseModalOpen(true)}
                className="text-white bg-teal-600 hover:bg-teal-700 rounded-full p-2 transition-colors duration-200"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            
            {recentExpenses.length > 0 ? (
              <div className="space-y-4">
                {recentExpenses.map((expense) => (
                  <ExpenseItem key={expense.id} expense={expense} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-gray-500">No recent expenses found.</p>
              </div>
            )}
            
            <div className="mt-4 text-right">
              <Link to="/expenses" className="text-teal-600 hover:text-teal-700 text-sm font-medium inline-flex items-center">
                View all expenses
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
      />
    </div>
  );
};

export default Dashboard;