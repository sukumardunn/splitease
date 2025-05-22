import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, Receipt, Plus, Settings, Calendar, ChevronDown } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import ExpenseItem from '../components/expenses/ExpenseItem';

const GroupDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { groups, expenses, friends, currentUser } = useAppContext();
  const [activeTab, setActiveTab] = useState('expenses');
  
  // Find the group
  const group = groups.find(g => g.id === id);
  
  if (!group) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Group not found</h2>
        <Link to="/groups" className="text-teal-600 hover:text-teal-700">
          Back to groups
        </Link>
      </div>
    );
  }
  
  // Get group expenses
  const groupExpenses = expenses
    .filter(expense => expense.groupId === id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Get group members
  const members = group.members.map(memberId => {
    if (memberId === currentUser.id) return currentUser;
    return friends.find(friend => friend.id === memberId)!;
  });
  
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex items-center gap-2">
        <Link to="/groups" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">{group.name}</h1>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Group header with cover image */}
        <div className="h-48 bg-gradient-to-r from-teal-500 to-teal-600 relative">
          {group.avatar && (
            <img
              src={group.avatar}
              alt={group.name}
              className="w-full h-full object-cover opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-white mb-2">{group.name}</h2>
              <div className="flex items-center">
                <div className="flex -space-x-2 mr-3">
                  {members.slice(0, 4).map(member => (
                    <img
                      key={member.id}
                      src={member.avatar}
                      alt={member.name}
                      className="w-8 h-8 rounded-full border-2 border-white object-cover"
                    />
                  ))}
                  {members.length > 4 && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600">
                      +{members.length - 4}
                    </div>
                  )}
                </div>
                <span className="text-white text-sm">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Group actions */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between">
          <div className="flex space-x-4">
            <button
              className={`py-2 px-1 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'expenses'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('expenses')}
            >
              <div className="flex items-center">
                <Receipt className="h-4 w-4 mr-2" />
                <span>Expenses</span>
              </div>
            </button>
            <button
              className={`py-2 px-1 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'members'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('members')}
            >
              <div className="flex items-center">
                <Users className="h-4 w-4 mr-2" />
                <span>Members</span>
              </div>
            </button>
            <button
              className={`py-2 px-1 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('settings')}
            >
              <div className="flex items-center">
                <Settings className="h-4 w-4 mr-2" />
                <span>Settings</span>
              </div>
            </button>
          </div>
          
          <button className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg text-sm flex items-center transition-colors duration-200">
            <Plus className="h-4 w-4 mr-2" />
            <span>Add Expense</span>
          </button>
        </div>
        
        {/* Group content */}
        <div className="p-6">
          {activeTab === 'expenses' && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total expenses</p>
                  <p className="text-xl font-bold text-gray-900">
                    ${groupExpenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">You paid</p>
                  <p className="text-xl font-bold text-gray-900">
                    ${groupExpenses
                      .filter(exp => exp.paidBy === currentUser.id)
                      .reduce((sum, exp) => sum + exp.amount, 0)
                      .toFixed(2)}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">You owe</p>
                  <p className="text-xl font-bold text-gray-900">$145.25</p>
                </div>
              </div>
              
              {/* Filters */}
              <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Recent Expenses</h3>
                
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg flex items-center hover:bg-gray-50 transition-colors">
                    <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                    <span>All time</span>
                    <ChevronDown className="h-4 w-4 ml-2 text-gray-500" />
                  </button>
                </div>
              </div>
              
              {/* Expenses list */}
              {groupExpenses.length > 0 ? (
                <div className="space-y-2 divide-y divide-gray-100">
                  {groupExpenses.map(expense => (
                    <ExpenseItem key={expense.id} expense={expense} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="mb-4">No expenses in this group yet</p>
                  <button className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg text-sm inline-flex items-center transition-colors duration-200">
                    <Plus className="h-4 w-4 mr-2" />
                    <span>Add First Expense</span>
                  </button>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Group Members</h3>
                <button className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg flex items-center hover:bg-gray-50 transition-colors">
                  <Plus className="h-4 w-4 mr-2 text-gray-500" />
                  <span>Add Member</span>
                </button>
              </div>
              
              <div className="space-y-3">
                {members.map(member => (
                  <div 
                    key={member.id} 
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="w-10 h-10 rounded-full object-cover mr-3"
                      />
                      <div>
                        <p className="font-medium text-gray-800">
                          {member.id === currentUser.id ? 'You' : member.name}
                        </p>
                        <p className="text-sm text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-600">
                      {member.id === currentUser.id ? 'Owner' : 'Member'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Group Settings</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group Name
                  </label>
                  <input
                    type="text"
                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-teal-500 focus:ring focus:ring-teal-200 focus:ring-opacity-50"
                    defaultValue={group.name}
                  />
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Danger Zone</h3>
                <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                  <p className="text-sm text-red-600 mb-4">
                    Deleting a group will remove all expenses associated with it. This action cannot be undone.
                  </p>
                  <button className="bg-white text-red-600 border border-red-300 hover:bg-red-50 font-medium py-2 px-4 rounded-lg text-sm transition-colors duration-200">
                    Delete Group
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupDetail;