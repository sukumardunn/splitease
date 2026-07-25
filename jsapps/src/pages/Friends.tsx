import React, { useState } from 'react';
import { Plus, UserPlus, Search, DollarSign, ArrowRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import SettleUpModal from '../components/expenses/SettleUpModal';
import AddFriendModal from '../components/friends/AddFriendModal';

interface SettleUpPrefill {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

const Friends: React.FC = () => {
  const { currentUser, friends, getBalances, getSuggestedSettlements, settleDebt } =
    useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [settlePrefill, setSettlePrefill] = useState<SettleUpPrefill | null>(null);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);

  // Get the balances for each friend
  const balances = getBalances();
  const suggestedSettlements = getSuggestedSettlements();

  const nameOf = (userId: string): string => {
    if (userId === currentUser.id) return 'You';
    return friends.find((f) => f.id === userId)?.name ?? 'Someone';
  };

  const openSettleUpForFriend = (friendId: string, balance: number) => {
    if (balance > 0) {
      // friend owes you
      setSettlePrefill({ fromUserId: friendId, toUserId: currentUser.id, amount: balance });
    } else {
      // you owe friend
      setSettlePrefill({ fromUserId: currentUser.id, toUserId: friendId, amount: Math.abs(balance) });
    }
    setIsSettleModalOpen(true);
  };

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

          <button
            type="button"
            onClick={() => setIsAddFriendOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors duration-200"
          >
            <UserPlus className="h-5 w-5 mr-2" aria-hidden="true" />
            <span>Add Friend</span>
          </button>
        </div>
      </div>

      {suggestedSettlements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-lg font-medium text-gray-900 mb-3">Simplify debts</h2>
          <div className="space-y-2">
            {suggestedSettlements.map((transfer, index) => (
              <div
                key={`${transfer.fromUserId}-${transfer.toUserId}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center text-sm font-medium text-gray-700">
                  <span>{nameOf(transfer.fromUserId)}</span>
                  <ArrowRight className="h-4 w-4 mx-2 text-gray-400" />
                  <span>{nameOf(transfer.toUserId)}</span>
                  <span className="ml-3 font-semibold text-gray-900">
                    ${transfer.amount.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={() => settleDebt(transfer.fromUserId, transfer.toUserId, transfer.amount)}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Settle
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

                    <button
                      onClick={() => openSettleUpForFriend(friend.id, balance)}
                      className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    >
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
          <button
            type="button"
            onClick={() => setIsAddFriendOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-lg inline-flex items-center transition-colors duration-200"
          >
            <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
            <span>Add Friend</span>
          </button>
        </div>
      )}

      <AddFriendModal isOpen={isAddFriendOpen} onClose={() => setIsAddFriendOpen(false)} />

      <SettleUpModal
        isOpen={isSettleModalOpen}
        onClose={() => setIsSettleModalOpen(false)}
        fromUserId={settlePrefill?.fromUserId}
        toUserId={settlePrefill?.toUserId}
        amount={settlePrefill?.amount}
      />
    </div>
  );
};

export default Friends;
