import React, { useMemo, useState } from 'react';
import { X, DollarSign, Percent, DivideSquare, Hash, SlidersHorizontal } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { Expense, ExpenseCategory } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  resolveSplit,
  validateSplits,
  validatePayers,
  SplitMode,
  Payer,
} from '../../services/splitEngine';
import { CATEGORY_LABELS, EXPENSE_CATEGORIES } from '../../services/analytics';
import type { EncodedReceipt } from '../../services/receiptImage';
import { deriveFormSeed, resolvePaidBy } from './expenseFormSeed';
import ReceiptField from './ReceiptField';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * When provided, the form edits this expense in place instead of creating a
   * new one. This is `updateExpense`'s only UI caller.
   */
  expense?: Expense;
}

const SPLIT_MODES: { value: SplitMode; label: string; icon: React.ElementType }[] = [
  { value: 'equal', label: 'Equal', icon: DivideSquare },
  { value: 'exact', label: 'Exact ($)', icon: DollarSign },
  { value: 'percentage', label: 'Percentage (%)', icon: Percent },
  { value: 'shares', label: 'Shares', icon: Hash },
  { value: 'adjustment', label: 'Adjustment (+/-)', icon: SlidersHorizontal },
];

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ isOpen, onClose, expense }) => {
  if (!isOpen) return null;
  // `ExpenseForm` seeds its state in `useState` initialisers, which only run on
  // mount — and every existing call site keeps this modal permanently mounted
  // while toggling `isOpen`. Mounting the form per open (and per target
  // expense) is what makes that seeding correct; it also lets the focus trap
  // take initial focus, which it cannot do if the dialog appears after mount.
  return <ExpenseForm key={expense?.id ?? 'new'} onClose={onClose} expense={expense} />;
};

interface ExpenseFormProps {
  onClose: () => void;
  expense?: Expense;
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ onClose, expense }) => {
  const {
    friends,
    groups,
    currentUser,
    addExpense,
    updateExpense,
    receipts,
    attachReceipt,
    removeReceipt,
  } = useAppContext();
  const isEdit = !!expense;
  const [seed] = useState(() => deriveFormSeed(currentUser.id, expense));
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
  const [description, setDescription] = useState(seed.description);
  const [amount, setAmount] = useState(seed.amount);
  const [category, setCategory] = useState<ExpenseCategory>(seed.category);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(seed.groupId);
  const [payerIds, setPayerIds] = useState<string[]>(seed.payerIds);
  const [payerValues, setPayerValues] = useState<Record<string, string>>(seed.payerValues);
  const [splitMode, setSplitMode] = useState<SplitMode>(seed.splitMode);
  const [selectedFriends, setSelectedFriends] = useState<string[]>(seed.selectedFriends);
  const [splitValues, setSplitValues] = useState<Record<string, string>>(seed.splitValues);
  const [notes, setNotes] = useState(seed.notes);
  // Receipt changes are staged, not applied on pick: cancelling the form must
  // leave whatever is stored untouched. `stagedReceipt` is an image already
  // downscaled and encoded; `receiptRemoved` is the "detach on save" flag.
  const [stagedReceipt, setStagedReceipt] = useState<EncodedReceipt | null>(null);
  const [receiptRemoved, setReceiptRemoved] = useState(false);
  const existingReceipt = expense ? receipts[expense.id] : undefined;

  // Sourced from the shared label map so the picker here and the Analytics
  // category chart can't drift apart. `settlement` is excluded by construction.
  const categories: { value: ExpenseCategory; label: string }[] = EXPENSE_CATEGORIES.map(
    (value) => ({ value, label: CATEGORY_LABELS[value] })
  );

  const allPeople = useMemo(() => [currentUser, ...friends], [currentUser, friends]);
  const participants = useMemo(
    () => [currentUser.id, ...selectedFriends],
    [currentUser.id, selectedFriends]
  );
  const totalAmount = parseFloat(amount) || 0;

  const splitValuesNum: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    participants.forEach((id) => {
      out[id] = parseFloat(splitValues[id] || '0') || 0;
    });
    return out;
  }, [participants, splitValues]);

  const splits = useMemo(
    () =>
      resolveSplit({
        totalAmount,
        participants,
        mode: splitMode,
        values: splitValuesNum,
      }),
    [totalAmount, participants, splitMode, splitValuesNum]
  );

  const percentageSum = useMemo(
    () => participants.reduce((sum, id) => sum + (splitValuesNum[id] || 0), 0),
    [participants, splitValuesNum]
  );

  const splitValidation = useMemo(() => {
    if (splitMode === 'equal') return { valid: true, sum: totalAmount, difference: 0 };
    if (splitMode === 'percentage') {
      return validateSplits(
        100,
        participants.map((id) => ({ userId: id, amount: splitValuesNum[id] || 0 }))
      );
    }
    return validateSplits(totalAmount, splits);
  }, [splitMode, participants, splitValuesNum, splits, totalAmount]);

  const isSplitValid = splitMode === 'equal' || splitValidation.valid;

  const payersList: Payer[] = useMemo(
    () =>
      payerIds.map((id) => ({
        userId: id,
        amount: parseFloat(payerValues[id] || '0') || 0,
      })),
    [payerIds, payerValues]
  );

  const payerValidation = useMemo(
    () => (payerIds.length > 1 ? validatePayers(totalAmount, payersList) : null),
    [payerIds, payersList, totalAmount]
  );

  const isPayersValid = payerIds.length > 0 && (payerIds.length === 1 || !!payerValidation?.valid);

  const canSubmit =
    description.trim().length > 0 && totalAmount > 0 && isSplitValid && isPayersValid;

  const togglePayer = (userId: string, checked: boolean) => {
    if (checked) {
      setPayerIds((prev) => [...prev, userId]);
    } else {
      setPayerIds((prev) => {
        const next = prev.filter((id) => id !== userId);
        return next.length > 0 ? next : prev;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isNaN(totalAmount) || totalAmount <= 0) return;
    if (!isSplitValid || !isPayersValid) return;

    const paidBy = resolvePaidBy(payerIds, expense?.paidBy);

    let payers: Payer[] | undefined;
    if (payerIds.length > 1) {
      payers = payersList;
    } else if (expense?.payers?.length === 1) {
      // The expense already recorded exactly one payer — a Phase 5A import
      // always does — so keep that row instead of deleting it. Sending
      // `payersList` here would write $0, because the per-payer inputs are only
      // shown (and only filled) when there are several payers.
      payers = [{ userId: paidBy, amount: totalAmount }];
    }
    // Otherwise `undefined`: the key is still present, so dropping from several
    // payers back to one clears the rows the expense used to have.

    const fields = {
      description,
      amount: totalAmount,
      paidBy,
      payers,
      splitWith: splits,
      category,
      groupId: selectedGroup,
      // undefined rather than '' so the row mapper writes SQL NULL for "no note".
      notes: notes.trim() || undefined,
      // The *intent*, recorded alongside the resolved amounts (migration
      // 20260725000005). Reopening this expense reads it back instead of
      // guessing, so a 60/40 percentage split stays a percentage split.
      splitMode,
    };

    if (expense) {
      // Deliberately not sending `date` or `importBatchId`: an edit keeps the
      // original date, and `updateExpense` patches onto the stored expense, so
      // the import batch link survives (see the note on `Expense.importBatchId`).
      updateExpense(expense.id, fields);
      // Receipt writes are separate from the expense write and deliberately not
      // awaited: the expense row already exists, so neither can invalidate the
      // other, and both report their own failure by toast. Voided rather than
      // chained because this component unmounts on the next line.
      if (stagedReceipt) {
        void attachReceipt(expense.id, stagedReceipt);
      } else if (receiptRemoved && existingReceipt) {
        void removeReceipt(expense.id);
      }
    } else {
      // On create the id does not exist yet, so the receipt is handed to
      // `addExpense`, which writes it straight after the parent row.
      addExpense({ ...fields, currency: 'USD' }, stagedReceipt ?? undefined);
    }

    // No form reset: closing unmounts this component (the wrapper renders null),
    // so the next open starts from a fresh `deriveFormSeed`.
    onClose();
  };

  const splitUnitLabel = (mode: SplitMode): string => {
    switch (mode) {
      case 'exact':
        return '$';
      case 'percentage':
        return '%';
      case 'shares':
        return 'shares';
      case 'adjustment':
        return '+/-';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={containerRef}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-modal-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 id="expense-modal-title" className="text-2xl font-bold text-gray-800">
              {isEdit ? 'Edit Expense' : 'Add Expense'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="expense-description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description
              </label>
              <input
                id="expense-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="What was this expense for?"
                required
              />
            </div>

            <div>
              <label
                htmlFor="expense-amount"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Amount
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="expense-amount"
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
              <label
                htmlFor="expense-category"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Category
              </label>
              <select
                id="expense-category"
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

            <div>
              <label
                htmlFor="expense-notes"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Notes (Optional)
              </label>
              <textarea
                id="expense-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add context — what it was for, who ordered what…"
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y"
              />
            </div>

            <ReceiptField
              existing={existingReceipt}
              staged={stagedReceipt}
              removed={receiptRemoved}
              onStage={setStagedReceipt}
              onRemovedChange={setReceiptRemoved}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Paid by
              </label>
              <div className="space-y-2">
                {allPeople.map((person) => {
                  const checked = payerIds.includes(person.id);
                  return (
                    <div
                      key={person.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={`payer-${person.id}`}
                          checked={checked}
                          onChange={(e) => togglePayer(person.id, e.target.checked)}
                          className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`payer-${person.id}`} className="ml-3 flex items-center">
                          <img
                            src={person.avatar}
                            alt={person.name}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                          <span className="ml-2 font-medium text-gray-700">
                            {person.id === currentUser.id ? `${person.name} (You)` : person.name}
                          </span>
                        </label>
                      </div>

                      {checked && payerIds.length > 1 && (
                        <div className="flex items-center">
                          <span className="mr-2" aria-hidden="true">$</span>
                          <input
                            type="number"
                            id={`payer-amount-${person.id}`}
                            aria-label={`Amount paid by ${person.name}`}
                            value={payerValues[person.id] || ''}
                            onChange={(e) =>
                              setPayerValues({ ...payerValues, [person.id]: e.target.value })
                            }
                            className="w-20 border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {payerIds.length > 1 && payerValidation && (
                <p
                  className={`mt-2 text-sm ${
                    payerValidation.valid ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  Σ ${payerValidation.sum.toFixed(2)} / ${totalAmount.toFixed(2)}
                  {payerValidation.message ? ` — ${payerValidation.message}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Split Details</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {SPLIT_MODES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSplitMode(value)}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      splitMode === value
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5 mx-auto mb-1 text-teal-600" />
                    <span className="block text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Split with
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <img
                        src={currentUser.avatar}
                        alt={currentUser.name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                      <span className="ml-2 font-medium text-gray-700">
                        {currentUser.name} (You)
                      </span>
                    </div>
                    {splitMode !== 'equal' && (
                      <div className="flex items-center">
                        <span className="mr-2" aria-hidden="true">{splitUnitLabel(splitMode)}</span>
                        <input
                          type="number"
                          id={`split-amount-${currentUser.id}`}
                          aria-label={`Your share (${splitUnitLabel(splitMode)})`}
                          value={splitValues[currentUser.id] || ''}
                          onChange={(e) =>
                            setSplitValues({ ...splitValues, [currentUser.id]: e.target.value })
                          }
                          className="w-20 border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500"
                          placeholder="0"
                          step={splitMode === 'percentage' ? '1' : '0.01'}
                        />
                      </div>
                    )}
                  </div>

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
                            } else {
                              setSelectedFriends(selectedFriends.filter((id) => id !== friend.id));
                              const newSplits = { ...splitValues };
                              delete newSplits[friend.id];
                              setSplitValues(newSplits);
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

                      {selectedFriends.includes(friend.id) && splitMode !== 'equal' && (
                        <div className="flex items-center">
                          <span className="mr-2" aria-hidden="true">{splitUnitLabel(splitMode)}</span>
                          <input
                            type="number"
                            id={`split-amount-${friend.id}`}
                            aria-label={`${friend.name}'s share (${splitUnitLabel(splitMode)})`}
                            value={splitValues[friend.id] || ''}
                            onChange={(e) => {
                              setSplitValues({
                                ...splitValues,
                                [friend.id]: e.target.value,
                              });
                            }}
                            className="w-20 border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500"
                            placeholder="0"
                            step={splitMode === 'percentage' ? '1' : '0.01'}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {splitMode !== 'equal' && (
                <p className={`text-sm ${isSplitValid ? 'text-green-600' : 'text-red-600'}`}>
                  {splitMode === 'percentage'
                    ? `Σ ${percentageSum.toFixed(2)}% / 100%`
                    : `Σ $${splitValidation.sum.toFixed(2)} / $${totalAmount.toFixed(2)}`}
                  {!isSplitValid && splitValidation.message ? ` — ${splitValidation.message}` : ''}
                </p>
              )}
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
              disabled={!canSubmit}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEdit ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddExpenseModal;
