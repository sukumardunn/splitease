import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Receipt, UserPlus, PieChart, Activity, Trash2, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { summarizeBalances } from '../../services/splitEngine';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { signOut } = useAuth();
  const { getBalances } = useAppContext();
  const { totalOwed, totalOwe } = summarizeBalances(getBalances());
  const settledUp = totalOwed === 0 && totalOwe === 0;

  const isActive = (path: string) => {
    return location.pathname === path;
  };
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/groups', label: 'Groups', icon: Users },
    { path: '/expenses', label: 'Expenses', icon: Receipt },
    { path: '/friends', label: 'Friends', icon: UserPlus },
    { path: '/activity', label: 'Activity', icon: Activity },
    { path: '/recently-deleted', label: 'Recently Deleted', icon: Trash2 },
  ];
  
  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-[calc(100vh-4rem)]">
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-4 py-3 rounded-lg transition-colors duration-200 ${
                isActive(item.path)
                  ? 'bg-teal-50 text-teal-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className={`h-5 w-5 mr-3 ${isActive(item.path) ? 'text-teal-500' : 'text-gray-500'}`} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-gray-200 space-y-3">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center w-full px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors duration-200"
        >
          <LogOut className="h-5 w-5 mr-3 text-gray-500" />
          <span className="font-medium">Log out</span>
        </button>
        <div className="p-4 bg-teal-50 rounded-lg">
          <h3 className="text-sm font-medium text-teal-800 mb-2">Overall Balance</h3>
          <div className="flex justify-between items-center">
            {settledUp ? (
              <p className="text-sm text-gray-500">You're all settled up!</p>
            ) : (
              <div className="space-y-1">
                {totalOwed > 0 && (
                  <div>
                    <p className="text-sm text-gray-500">You are owed</p>
                    <p className="text-lg font-semibold text-green-600">
                      ${totalOwed.toFixed(2)}
                    </p>
                  </div>
                )}
                {totalOwe > 0 && (
                  <div>
                    <p className="text-sm text-gray-500">You owe</p>
                    <p className="text-lg font-semibold text-red-600">${totalOwe.toFixed(2)}</p>
                  </div>
                )}
              </div>
            )}
            <PieChart className="h-10 w-10 text-teal-500 shrink-0" />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;