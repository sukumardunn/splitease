import React from 'react';
import { Friend } from '../../types';
import { useNavigate } from 'react-router-dom';

interface BalanceSummaryProps {
  balances: { friend: Friend; balance: number }[];
}

const BalanceSummary: React.FC<BalanceSummaryProps> = ({ balances }) => {
  const navigate = useNavigate();
  
  // Filter out balances that are 0
  const nonZeroBalances = balances.filter((b) => b.balance !== 0);
  
  if (nonZeroBalances.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-gray-500">You're all settled up!</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {nonZeroBalances.map((item) => (
        <div
          key={item.friend.id}
          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors duration-200"
          onClick={() => navigate(`/friends?id=${item.friend.id}`)}
        >
          <div className="flex items-center">
            <img
              src={item.friend.avatar}
              alt={item.friend.name}
              className="w-10 h-10 rounded-full object-cover mr-3"
            />
            <span className="font-medium text-gray-800">{item.friend.name}</span>
          </div>
          
          {item.balance > 0 ? (
            <span className="font-semibold text-green-600">
              +${item.balance.toFixed(2)}
            </span>
          ) : (
            <span className="font-semibold text-red-600">
              -${Math.abs(item.balance).toFixed(2)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default BalanceSummary;