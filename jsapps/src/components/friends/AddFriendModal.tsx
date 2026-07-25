import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Basic shape check only — this is a contact label, not a login. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LABEL_CLASS = 'block text-sm font-medium text-gray-700 mb-1';
const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

/**
 * Create a friend to split expenses with.
 *
 * `friends` are the owner's private contacts, not user accounts (see the 4a
 * migration), so there is no invite or lookup — just a name and an optional email
 * label.
 */
const AddFriendModal: React.FC<AddFriendModalProps> = ({ isOpen, onClose }) => {
  const { friends, addFriend } = useAppContext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>({ onEscape: onClose });

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setEmail('');
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError('Give your friend a name.');
      return;
    }
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setError("That doesn't look like an email address.");
      return;
    }
    const duplicate = friends.some(
      (f) =>
        f.name.trim().toLowerCase() === trimmedName.toLowerCase() ||
        (!!trimmedEmail && f.email.trim().toLowerCase() === trimmedEmail.toLowerCase())
    );
    if (duplicate) {
      setError('You already have a friend with that name or email.');
      return;
    }

    addFriend({ name: trimmedName, email: trimmedEmail });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-friend-title"
        onKeyDown={onKeyDown}
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id="add-friend-title" className="text-lg font-semibold text-gray-900">
            Add a friend
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label htmlFor="friend-name" className={LABEL_CLASS}>
              Name
            </label>
            <input
              id="friend-name"
              name="name"
              type="text"
              required
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="friend-email" className={LABEL_CLASS}>
              Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="friend-email"
              name="email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="friend-email-hint"
              className={INPUT_CLASS}
            />
            <p id="friend-email-hint" className="mt-1 text-xs text-gray-500">
              Just a label to help you tell people apart — it doesn't invite them.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg"
            >
              Add friend
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddFriendModal;
