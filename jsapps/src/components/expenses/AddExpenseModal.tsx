import React, { useState } from 'react';
import { X, DollarSign, Percent, DivideSquare, Users } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { ExpenseCategory } from '../../types';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SplitType = 'equal' | 'custom' | 'percentage';

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ isOpen, onClose }) => {
  const { friends, groups, currentUser, addExpense } = useAppContext();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  
  const categories: { value: ExpenseCategory; label: string }[] = [
    { value: 'groceries', label: 'Groceries' },
    { value: 'rent', label: 'Rent' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'dining', label: 'Dining' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'transportation', label: 'Transportation' },
    { value: 'travel', label: 'Travel' },
    { value: 'shopping', label: 'Shopping' },
    { value: 'services', label: 'Services' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) return;
    
    let splits = [];
    const participants = [currentUser.id, ...selectedFriends];
    
    if (splitType === 'equal') {
      const splitAmount = totalAmount / participants.length;
      splits = participants.map(id => ({
        userId: id,
        amount: splitAmount
      }));
    } else if (splitType === 'percentage') {
      splits = participants.map(id => ({
        userId: id,
        amount: (parseFloat(customSplits[id] || '0') / 100) * totalAmount
      }));
    } else {
      splits = participants.map(id => ({
        userId: id,
        amount: parseFloat(customSplits[id] || '0')
      }));
    }
    
    addExpense({
      description,
      amount: totalAmount,
      paidBy: currentUser.id,
      splitWith: splits,
      category,
      currency: 'USD',
      groupId: selectedGroup
    });
    
    onClose();
    resetForm();
  };
  
  const resetForm = () => {
    setDescription('');
    setAmount('');
    setCategory('other');
    setSelectedGroup(null);
    setSplitType('equal');
    setSelectedFriends([]);
    setCustomSplits({});
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Add Expense</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="What was this expense for?"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-10 border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Group (Optional)
              </label>
              <select
                value={selectedGroup || ''}
                onChange={(e) => setSelectedGroup(e.target.value || null)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Split Details</h3>
            
            <div className="space-y-4">
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setSplitType('equal')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    splitType === 'equal'
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <DivideSquare className="h-6 w-6 mx-auto mb-2 text-teal-600" />
                  <span className="block text-sm text-teal-600 font-medium">Equal Split</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setSplitType('custom')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    splitType === 'custom'
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <DollarSign className="h-6 w-6 mx-auto mb-2 text-teal-600" />
                  <span className="block text-sm text-teal-600 font-medium">Custom Amounts</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setSplitType('percentage')}
                  className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                    splitType === 'percentage'
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Percent className="h-6 w-6 mx-auto mb-2 text-teal-600" />
                  <span className="block text-sm text-teal-600 font-medium">Percentages</span>
                </button>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Split with
                </label>
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`friend-${friend.id}`}
                          checked={selectedFriends.includes(friend.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFriends([...selectedFriends, friend.id]);
                              if (splitType !== 'equal') {
                                setCustomSplits(prev => ({
                                  ...prev,
                                  [friend.id]: splitType === 'percentage' ? '0' : '0.00'
                                }));
                              }
                            } else {
                              setSelectedFriends(selectedFriends.filter(id => id !== friend.id));
                              if (splitType !== 'equal') {
                                const newSplits = { ...customSplits };
                                delete newSplits[friend.id];
                                setCustomSplits(newSplits);
                              }
                            }
                          }}
                          className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`friend-${friend.id}`} className="ml-3 flex items-center">
                          <img
                            src={friend.avatar}
                            alt={friend.name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                          <span className="ml-2 font-medium text-gray-700">{friend.name}</span>
                        </label>
                      </div>
                      
                      {selectedFriends.includes(friend.id) && splitType !== 'equal' && (
                        <div className="flex items-center">
                          {splitType === 'percentage' && <span className="mr-2">%</span>}
                          {splitType === 'custom' && <span className="mr-2">$</span>}
                          <input
                            type="number"
                            value={customSplits[friend.id] || ''}
                            onChange={(e) => {
                              setCustomSplits({
                                ...customSplits,
                                [friend.id]: e.target.value
                              });
                            }}
                            className="w-20 border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500"
                            placeholder={splitType === 'percentage' ? '0' : '0.00'}
                            step={splitType === 'percentage' ? '1' : '0.01'}
                            min="0"
                            max={splitType === 'percentage' ? '100' : undefined}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Add Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddExpenseModal;