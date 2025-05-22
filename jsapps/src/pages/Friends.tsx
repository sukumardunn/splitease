import React, { useState } from 'react';
import { Plus, UserPlus, Search, DollarSign } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const Friends: React.FC = () => {
  const { friends, getBalances } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Get the balances for each friend
  const balances = getBalances();
  
  // Filter friends based on search query
  const filteredFriends = friends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.email.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Friends</h1>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search friends..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <button className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors duration-200">
            <UserPlus className="h-5 w-5 mr-2" />
            <span>Add Friend</span>
          </button>
        </div>
      </div>
      
      {filteredFriends.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-200">
            {filteredFriends.map(friend => {
              // Find the balance for this friend
              const balanceInfo = balances.find(b => b.friend.id === friend.id);
              const balance = balanceInfo?.balance || 0;
              
              return (
                <div
                  key={friend.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center">
                    <img
                      src={friend.avatar}
                      alt={friend.name}
                      className="w-12 h-12 rounded-full object-cover mr-4"
                    />
                    <div>
                      <h3 className="font-medium text-gray-900">{friend.name}</h3>
                      <p className="text-sm text-gray-500">{friend.email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    {balance !== 0 && (
                      <div className="flex flex-col items-end mr-6">
                        {balance > 0 ? (
                          <>
                            <p className="text-sm text-gray-500">owes you</p>
                            <p className="font-semibold text-green-600">
                              ${balance.toFixed(2)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-gray-500">you owe</p>
                            <p className="font-semibold text-red-600">
                              ${Math.abs(balance).toFixed(2)}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    
                    <button className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                      <DollarSign className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <UserPlus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No friends found</h3>
          <p className="text-gray-500 mb-6">
            {searchQuery
              ? "We couldn't find any friends matching your search."
              : "You haven't added any friends yet. Add a friend to start tracking shared expenses."}
          </p>
          <button className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg inline-flex items-center transition-colors duration-200">
            <Plus className="h-5 w-5 mr-2" />
            <span>Add Friend</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Friends;