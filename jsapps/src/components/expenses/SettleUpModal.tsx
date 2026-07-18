import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

interface SettleUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromUserId?: string;
  toUserId?: string;
  amount?: number;
}

const SettleUpModal: React.FC<SettleUpModalProps> = ({
  isOpen,
  onClose,
  fromUserId,
  toUserId,
  amount,
}) => {
  const { currentUser, friends, settleDebt } = useAppContext();
  const people = [currentUser, ...friends];

  const [from, setFrom] = useState<string>(fromUserId || currentUser.id);
  const [to, setTo] = useState<string>(toUserId || friends[0]?.id || currentUser.id);
  const [amountStr, setAmountStr] = useState<string>(
    amount !== undefined ? amount.toFixed(2) : ''
  );

  useEffect(() => {
    if (!isOpen) return;
    setFrom(fromUserId || currentUser.id);
    setTo(toUserId || friends[0]?.id || currentUser.id);
    setAmountStr(amount !== undefined ? amount.toFixed(2) : '');
  }, [isOpen, fromUserId, toUserId, amount, currentUser.id, friends]);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountStr);
  const isValid = !isNaN(numericAmount) && numericAmount > 0 && from !== to;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    settleDebt(from, to, numericAmount);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Settle Up</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === currentUser.id ? `${person.name} (You)` : person.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.id === currentUser.id ? `${person.name} (You)` : person.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-400">$</span>
              </div>
              <input
                type="number"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full pl-7 border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="0.00"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          {from === to && (
            <p className="text-sm text-red-600">"From" and "To" must be different people.</p>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Settle Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettleUpModal;
