import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Receipt, UserPlus, PieChart } from 'lucide-react';

const Sidebar: React.FC = () => {
  const location = useLocation();
  
  const isActive = (path: string) => {
    return location.pathname === path;
  };
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/groups', label: 'Groups', icon: Users },
    { path: '/expenses', label: 'Expenses', icon: Receipt },
    { path: '/friends', label: 'Friends', icon: UserPlus },
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
      
      <div className="p-4 border-t border-gray-200">
        <div className="p-4 bg-teal-50 rounded-lg">
          <h3 className="text-sm font-medium text-teal-800 mb-2">Overall Balance</h3>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">You are owed</p>
              <p className="text-lg font-semibold text-green-600">$355.00</p>
            </div>
            <PieChart className="h-10 w-10 text-teal-500" />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;