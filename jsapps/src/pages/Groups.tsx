import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, Search } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Group } from '../types';

const Groups: React.FC = () => {
  const { groups } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter groups based on search query
  const filteredGroups = groups.filter(group => 
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Your Groups</h1>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search groups..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <button className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors duration-200">
            <Plus className="h-5 w-5 mr-2" />
            <span>New Group</span>
          </button>
        </div>
      </div>
      
      {filteredGroups.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map(group => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No groups found</h3>
          <p className="text-gray-500 mb-6">
            {searchQuery 
              ? "We couldn't find any groups matching your search."
              : "You don't have any groups yet. Create a group to start tracking shared expenses."}
          </p>
          <button className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg inline-flex items-center transition-colors duration-200">
            <Plus className="h-5 w-5 mr-2" />
            <span>Create Group</span>
          </button>
        </div>
      )}
    </div>
  );
};

interface GroupCardProps {
  group: Group;
}

const GroupCard: React.FC<GroupCardProps> = ({ group }) => {
  const { friends, currentUser, expenses } = useAppContext();
  
  // Get group members
  const memberIds = group.members.filter(id => id !== currentUser.id);
  const members = friends.filter(friend => memberIds.includes(friend.id));
  
  // Get group expenses
  const groupExpenses = expenses.filter(expense => expense.groupId === group.id);
  
  return (
    <Link to={`/groups/${group.id}`} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="h-32 bg-gradient-to-r from-teal-500 to-teal-600 relative">
        {group.avatar && (
          <img
            src={group.avatar}
            alt={group.name}
            className="w-full h-full object-cover opacity-50"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end">
          <div className="p-4">
            <h2 className="text-xl font-bold text-white">{group.name}</h2>
            <p className="text-teal-50 text-sm">{group.members.length} members</p>
          </div>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex items-center mb-3">
          <div className="flex -space-x-2">
            {members.slice(0, 3).map(member => (
              <img
                key={member.id}
                src={member.avatar}
                alt={member.name}
                className="w-8 h-8 rounded-full border-2 border-white object-cover"
                title={member.name}
              />
            ))}
            {members.length > 3 && (
              <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600">
                +{members.length - 3}
              </div>
            )}
          </div>
          <div className="ml-3 text-sm text-gray-500">
            {groupExpenses.length} {groupExpenses.length === 1 ? 'expense' : 'expenses'}
          </div>
        </div>
        
        <div className="border-t border-gray-100 pt-3 flex justify-between">
          <div>
            <p className="text-xs text-gray-500">You are owed</p>
            <p className="text-sm font-semibold text-green-600">$120.50</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total expenses</p>
            <p className="text-sm font-semibold text-gray-700">
              ${groupExpenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default Groups;