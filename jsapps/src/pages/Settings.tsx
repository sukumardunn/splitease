import React from 'react';
import { useAppContext } from '../context/AppContext';
import { CreditCard, Mail, Lock, Globe, Bell } from 'lucide-react';

const Settings: React.FC = () => {
  const { currentUser } = useAppContext();
  
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Account</h2>
          
          <div className="flex items-center space-x-4">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-16 h-16 rounded-full object-cover"
            />
            <div>
              <h3 className="font-medium text-gray-900">{currentUser.name}</h3>
              <p className="text-gray-500">{currentUser.email}</p>
              <button className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-medium">
                Change avatar
              </button>
            </div>
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          <div className="p-6">
            <div className="flex items-center mb-4">
              <Mail className="h-5 w-5 text-gray-500 mr-3" />
              <h3 className="font-medium text-gray-900">Email Address</h3>
            </div>
            <p className="text-gray-600 mb-4">{currentUser.email}</p>
            <button className="text-sm text-teal-600 hover:text-teal-700 font-medium">
              Update email
            </button>
          </div>
          
          <div className="p-6">
            <div className="flex items-center mb-4">
              <Lock className="h-5 w-5 text-gray-500 mr-3" />
              <h3 className="font-medium text-gray-900">Password</h3>
            </div>
            <p className="text-gray-600 mb-4">●●●●●●●●●●</p>
            <button className="text-sm text-teal-600 hover:text-teal-700 font-medium">
              Change password
            </button>
          </div>
          
          <div className="p-6">
            <div className="flex items-center mb-4">
              <CreditCard className="h-5 w-5 text-gray-500 mr-3" />
              <h3 className="font-medium text-gray-900">Payment Methods</h3>
            </div>
            <p className="text-gray-600 mb-4">Add payment methods to track your expenses.</p>
            <button className="text-sm text-teal-600 hover:text-teal-700 font-medium">
              Add payment method
            </button>
          </div>
          
          <div className="p-6">
            <div className="flex items-center mb-4">
              <Globe className="h-5 w-5 text-gray-500 mr-3" />
              <h3 className="font-medium text-gray-900">Currency</h3>
            </div>
            <div className="mb-4">
              <select className="w-full max-w-xs border-gray-300 rounded-md shadow-sm focus:border-teal-500 focus:ring focus:ring-teal-200 focus:ring-opacity-50">
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
                <option value="JPY">¥ JPY</option>
              </select>
            </div>
          </div>
          
          <div className="p-6">
            <div className="flex items-center mb-4">
              <Bell className="h-5 w-5 text-gray-500 mr-3" />
              <h3 className="font-medium text-gray-900">Notifications</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="notifications-email"
                  className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  defaultChecked
                />
                <label htmlFor="notifications-email" className="ml-3 text-gray-700">
                  Email notifications
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="notifications-push"
                  className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  defaultChecked
                />
                <label htmlFor="notifications-push" className="ml-3 text-gray-700">
                  Push notifications
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="notifications-activity"
                  className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                  defaultChecked
                />
                <label htmlFor="notifications-activity" className="ml-3 text-gray-700">
                  Activity notifications
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;