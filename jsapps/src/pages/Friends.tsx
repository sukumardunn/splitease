import React, { useState, useEffect } from 'react';
import { Search, UserSearch } from 'lucide-react'; // Changed UserPlus to UserSearch for empty state
import { supabase } from '../lib/supabase';
import { User } from '../types'; // Assuming User type is { id: string, name: string, email: string, avatar?: string }

const Friends: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true); // Set loading true immediately

    const debounceTimer = setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('search_users', { 
          p_search_term: searchQuery.trim() 
        });
        
        if (rpcError) {
          console.error('RPC Error:', rpcError);
          setError(rpcError.message);
          setSearchResults([]);
        } else if (data) {
          // Assuming data from RPC is: { id: string, name: string, email?: string, avatar_url?: string }[]
          const mappedResults: User[] = data.map((u: any) => ({ 
            id: u.id, 
            name: u.name || 'N/A', // Handle missing name, though unlikely for users
            email: u.email || 'N/A', // Handle missing email
            avatar: u.avatar_url || '', // Handle missing avatar
          }));
          setSearchResults(mappedResults);
          setError(null);
        } else {
          setSearchResults([]); // No data and no error means empty results
          setError(null);
        }
      } catch (e: any) {
        console.error('Search Error:', e);
        setError(e.message || 'An unexpected error occurred.');
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);
  
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Search Users</h1>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-96"> {/* Increased width for better search experience */}
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by name or email..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {/* Removed "Add Friend" button as per instructions */}
        </div>
      </div>
      
      {isLoading && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-500">Searching...</p>
        </div>
      )}

      {error && (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-red-500">Error: {error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {searchResults.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-200">
                {searchResults.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center">
                      <img
                        src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}
                        alt={user.name}
                        className="w-12 h-12 rounded-full object-cover mr-4"
                      />
                      <div>
                        <h3 className="font-medium text-gray-900">{user.name}</h3>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    {/* Removed balance display and Settle Debt button */}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <UserSearch className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchQuery ? "No users found" : "Find Users"}
              </h3>
              <p className="text-gray-500">
                {searchQuery
                  ? "We couldn't find any users matching your search."
                  : "Enter a name or email to search for users."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Friends;