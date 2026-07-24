import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const signIn = vi.fn();
const signUp = vi.fn();

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ signIn, signUp }),
}));

import AuthScreen from './AuthScreen';

beforeEach(() => {
  vi.clearAllMocks();
  signIn.mockResolvedValue({ error: null });
  signUp.mockResolvedValue({ error: null });
});

function toSignUp() {
  fireEvent.click(screen.getByRole('button', { name: /Don't have an account/i }));
}

describe('AuthScreen accessibility', () => {
  it('labels every field, so they are not placeholder-only', () => {
    render(<AuthScreen />);
    // getByLabelText resolves through <label for>/id, so it only passes when the
    // association actually exists.
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();

    toSignUp();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
  });

  it('gives password managers the right autoComplete hints per mode', () => {
    render(<AuthScreen />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password'
    );

    toSignUp();
    // Signing up must not offer the saved password — it needs a new one.
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Your name')).toHaveAttribute('autocomplete', 'name');
  });

  it('describes the password requirement programmatically', () => {
    render(<AuthScreen />);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/6 characters/i);
  });
});

describe('AuthScreen behaviour', () => {
  it('signs in with trimmed email and raw password', async () => {
    render(<AuthScreen />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  a@b.com  ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: ' secret6 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('a@b.com', ' secret6 '));
    expect(signUp).not.toHaveBeenCalled();
  });

  it('signs up with the name included', async () => {
    render(<AuthScreen />);
    toSignUp();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Ada  ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith('Ada', 'ada@b.com', 'secret6'));
  });

  it('announces a failure as an alert and stays on the form', async () => {
    signIn.mockResolvedValue({ error: 'Invalid login credentials' });
    render(<AuthScreen />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('clears a previous error when switching mode', async () => {
    signIn.mockResolvedValue({ error: 'Invalid login credentials' });
    render(<AuthScreen />);
    // The inputs are `required` and jsdom enforces constraint validation, so an
    // empty form never reaches the submit handler.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByRole('alert');

    toSignUp();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables and marks the submit button busy while the request is in flight', async () => {
    let resolveSignIn: (v: { error: string | null }) => void = () => {};
    signIn.mockReturnValue(
      new Promise<{ error: string | null }>((resolve) => {
        resolveSignIn = resolve;
      })
    );
    render(<AuthScreen />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const button = screen.getByRole('button', { name: 'Log in' });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');

    resolveSignIn({ error: null });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('toggles between log in and sign up', () => {
    render(<AuthScreen />);
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();

    toSignUp();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Already have an account/i }));
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });
});
