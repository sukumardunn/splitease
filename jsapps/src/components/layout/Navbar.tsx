import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Plus, Bell, Settings, Menu, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import AddExpenseModal from '../expenses/AddExpenseModal';

const Navbar: React.FC = () => {
  const { currentUser } = useAppContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  return (
    <header className="bg-teal-600 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <Wallet className="h-8 w-8 mr-2" />
              <span className="text-xl font-bold">SplitEase</span>
            </Link>
          </div>
          
          <div className="hidden md:flex items-center space-x-4">
            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="bg-teal-500 hover:bg-teal-400 text-white font-medium py-2 px-4 rounded-full flex items-center transition-colors duration-200"
            >
              <Plus className="h-5 w-5 mr-1" />
              <span>Add Expense</span>
            </button>
            
            <Link to="/activity" className="text-teal-100 hover:text-white p-2 rounded-full hover:bg-teal-500 transition-colors duration-200">
              <Bell className="h-6 w-6" />
            </Link>
            
            <Link to="/settings" className="text-teal-100 hover:text-white p-2 rounded-full hover:bg-teal-500 transition-colors duration-200">
              <Settings className="h-6 w-6" />
            </Link>
            
            <Link to="/settings" className="flex items-center">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="h-8 w-8 rounded-full object-cover border-2 border-teal-400"
              />
            </Link>
          </div>
          
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-teal-100 hover:text-white p-2"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile dropdown menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-teal-600 shadow-lg">
          <div className="px-2 pt-2 pb-3 space-y-1">
            <button
              onClick={() => {
                setIsExpenseModalOpen(true);
                setIsMenuOpen(false);
              }}
              className="w-full text-left bg-teal-500 hover:bg-teal-400 text-white font-medium py-2 px-4 rounded-md flex items-center transition-colors duration-200"
            >
              <Plus className="h-5 w-5 mr-2" />
              <span>Add Expense</span>
            </button>
            
            <Link
              to="/activity"
              className="block px-3 py-2 rounded-md text-teal-100 hover:text-white hover:bg-teal-500 transition-colors duration-200"
            >
              <div className="flex items-center">
                <Bell className="h-5 w-5 mr-2" />
                <span>Activity</span>
              </div>
            </Link>
            
            <Link
              to="/settings"
              className="block px-3 py-2 rounded-md text-teal-100 hover:text-white hover:bg-teal-500 transition-colors duration-200"
            >
              <div className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                <span>Settings</span>
              </div>
            </Link>
            
            <Link
              to="/settings"
              className="block px-3 py-2 rounded-md text-teal-100 hover:text-white hover:bg-teal-500 transition-colors duration-200"
            >
              <div className="flex items-center">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="h-6 w-6 rounded-full object-cover border-2 border-teal-400 mr-2"
                />
                <span>Profile</span>
              </div>
            </Link>
          </div>
        </div>
      )}

      <AddExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
      />
    </header>
  );
};

export default Navbar;