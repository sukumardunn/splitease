import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Friend } from '../../types';

const addFriend = vi.fn();
let friends: Friend[] = [];

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ friends, addFriend }),
}));

import AddFriendModal from './AddFriendModal';

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  friends = [];
});

function setup() {
  return render(<AddFriendModal isOpen onClose={onClose} />);
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Add friend' }));
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AddFriendModal rendering', () => {
  it('renders nothing when closed', () => {
    render(<AddFriendModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a labelled modal dialog with labelled fields', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Add a friend');
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
  });

  it('moves focus into the dialog on open', () => {
    setup();
    // First focusable is the close button in the header.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('explains that the email does not invite anyone', () => {
    setup();
    expect(screen.getByLabelText(/Email/)).toHaveAccessibleDescription(/doesn't invite them/i);
  });
});

describe('AddFriendModal validation', () => {
  it('rejects a blank name', () => {
    setup();
    type('Name', '   ');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
    expect(addFriend).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('rejects an email the browser accepts but that has no domain suffix', () => {
    // `type="email"` already blocks obvious junk, so the custom check exists for
    // input native validation lets through, like a bare host with no dot.
    setup();
    type('Name', 'Ada');
    type(/Email/, 'ada@localhost');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/email address/i);
    expect(addFriend).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name, case-insensitively', () => {
    friends = [{ id: 'f1', name: 'Ada Lovelace', email: 'ada@x.com', avatar: '' }];
    setup();
    type('Name', '  ada lovelace ');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/already have a friend/i);
    expect(addFriend).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email even under a different name', () => {
    friends = [{ id: 'f1', name: 'Ada', email: 'ada@x.com', avatar: '' }];
    setup();
    type('Name', 'Someone Else');
    type(/Email/, 'ADA@x.com');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/already have a friend/i);
    expect(addFriend).not.toHaveBeenCalled();
  });

  it('does not treat empty emails as duplicates of each other', () => {
    // Two contacts with no email are perfectly legitimate.
    friends = [{ id: 'f1', name: 'Ada', email: '', avatar: '' }];
    setup();
    type('Name', 'Grace');
    submit();
    expect(addFriend).toHaveBeenCalledWith({ name: 'Grace', email: '' });
  });
});

describe('AddFriendModal submission', () => {
  it('adds a trimmed friend and closes', () => {
    setup();
    type('Name', '  Ada Lovelace  ');
    type(/Email/, '  ada@x.com  ');
    submit();
    expect(addFriend).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@x.com' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('allows an empty email', () => {
    setup();
    type('Name', 'Ada');
    submit();
    expect(addFriend).toHaveBeenCalledWith({ name: 'Ada', email: '' });
  });

  it('closes on Cancel without adding', () => {
    setup();
    type('Name', 'Ada');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(addFriend).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab inside the dialog', () => {
    setup();
    const close = screen.getByRole('button', { name: 'Close' });
    const addButton = screen.getByRole('button', { name: 'Add friend' });

    addButton.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('clears a stale error when reopened', () => {
    const { rerender } = setup();
    // Whitespace satisfies the `required` attribute, so this reaches the handler
    // and trips the blank-name check.
    type('Name', '   ');
    submit();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<AddFriendModal isOpen={false} onClose={onClose} />);
    rerender(<AddFriendModal isOpen onClose={onClose} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });
});
