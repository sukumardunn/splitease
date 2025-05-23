import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, UserPlus, Users, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { User } from '../../types';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (groupData: { name: string; avatarUrl?: string; memberIds: string[] }) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [groupName, setGroupName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setIsLoadingSearch(false);
      return;
    }

    setIsLoadingSearch(true);
    setSearchError(null);

    const timerId = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('search_users', {
          p_search_term: searchTerm.trim(),
        });

        if (error) {
          console.error('Error searching users:', error);
          setSearchError(error.message);
          setSearchResults([]);
        } else if (data) {
          const mappedResults: User[] = data.map((u: any) => ({
            id: u.id,
            name: u.name || 'N/A',
            email: u.email || 'N/A', // Assuming search_users might not return email
            avatar: u.avatar_url || '',
          }));
          setSearchResults(mappedResults.filter(
            // Filter out already selected members from search results
            searchedUser => !selectedMembers.find(selected => selected.id === searchedUser.id)
          ));
        } else {
          setSearchResults([]);
        }
      } catch (e: any) {
        console.error('RPC call failed:', e);
        setSearchError(e.message || 'Failed to search users.');
        setSearchResults([]);
      } finally {
        setIsLoadingSearch(false);
      }
    }, 500);

    return () => clearTimeout(timerId);
  }, [searchTerm, selectedMembers]);

  const handleAddMember = (user: User) => {
    if (!selectedMembers.find(member => member.id === user.id)) {
      setSelectedMembers(prev => [...prev, user]);
    }
    setSearchTerm(''); // Clear search term after selection
    setSearchResults([]); // Clear search results
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers(prev => prev.filter(member => member.id !== userId));
  };

  const handleSubmit = () => {
    if (!groupName.trim()) {
      alert('Group name is required.'); // Basic validation
      return;
    }
    const memberIds = selectedMembers.map(member => member.id);
    onSubmit({ name: groupName, avatarUrl: avatarUrl || undefined, memberIds });
    // Reset state for next time modal opens (optional, or handle in parent)
    setGroupName('');
    setAvatarUrl('');
    setSelectedMembers([]);
    setSearchTerm('');
    setSearchResults([]);
    setSearchError(null);
    onClose(); // Close modal after submit
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Create New Group</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        {/* Group Name and Avatar URL */}
        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-1">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
              placeholder="Enter group name"
            />
          </div>
          <div>
            <label htmlFor="avatarUrl" className="block text-sm font-medium text-gray-700 mb-1">
              Avatar URL (Optional)
            </label>
            <input
              type="text"
              id="avatarUrl"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
              placeholder="https://example.com/avatar.png"
            />
          </div>
        </div>

        {/* Member Search and Selection */}
        <div className="mb-6">
          <label htmlFor="memberSearch" className="block text-sm font-medium text-gray-700 mb-1">
            Add Members
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              id="memberSearch"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
              placeholder="Search users by name or email..."
            />
          </div>

          {isLoadingSearch && <p className="text-sm text-gray-500 mt-2">Searching...</p>}
          {searchError && <p className="text-sm text-red-500 mt-2">Error: {searchError}</p>}

          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
              {searchResults.map(user => (
                <div
                  key={user.id}
                  onClick={() => handleAddMember(user)}
                  className="flex items-center p-2 hover:bg-gray-100 cursor-pointer"
                >
                  <img 
                    src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`} 
                    alt={user.name} 
                    className="w-8 h-8 rounded-full mr-2 object-cover"
                  />
                  <span className="text-sm text-gray-700">{user.name} ({user.email})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Members Display */}
        {selectedMembers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Members:</h3>
            <div className="flex flex-wrap gap-2">
              {selectedMembers.map(member => (
                <div
                  key={member.id}
                  className="flex items-center bg-teal-100 text-teal-700 text-xs font-semibold px-2.5 py-1 rounded-full"
                >
                  <span>{member.name}</span>
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    className="ml-1.5 text-teal-500 hover:text-teal-700"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
         {selectedMembers.length === 0 && searchTerm === '' && !isLoadingSearch && (
            <div className="text-center text-sm text-gray-500 py-3">
                <Users size={32} className="mx-auto text-gray-400 mb-2" />
                Search and add users to this group.
            </div>
        )}


        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 border border-transparent rounded-md shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupModal;
