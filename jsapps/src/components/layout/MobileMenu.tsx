import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Receipt, UserPlus } from 'lucide-react';

const MobileMenu: React.FC = () => {
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
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
      <div className="grid grid-cols-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center py-3"
            >
              <Icon
                className={`h-6 w-6 ${
                  isActive(item.path) ? 'text-teal-600' : 'text-gray-500'
                }`}
              />
              <span
                className={`text-xs mt-1 ${
                  isActive(item.path) ? 'text-teal-600 font-medium' : 'text-gray-500'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default MobileMenu;