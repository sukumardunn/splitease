import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './AuthContext';
import { captureConsoleWarn } from '../test/console';

const getSession = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOutFn = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();
const clearState = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: AuthCallback) => onAuthStateChange(cb),
      signInWithPassword: (args: unknown) => signInWithPassword(args),
      signUp: (args: unknown) => signUp(args),
      signOut: () => signOutFn(),
    },
  },
}));
vi.mock('../services/localStore', () => ({ clearState: () => clearState() }));

type AuthCallback = (event: string, session: Session | null) => void;

/** Captured listener, so a test can drive an auth state change itself. */
let emitAuthChange: AuthCallback = () => {};

const SESSION = { user: { id: 'user-1' } } as Session;

/** Surfaces the context so assertions can read it from the DOM. */
const Probe = () => {
  const { session, loading, signIn, signUp: doSignUp, signOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{session?.user.id ?? 'none'}</span>
      <button onClick={() => void signIn('a@b.com', 'pw')}>signin</button>
      <button onClick={() => void doSignUp('Ada', 'a@b.com', 'pw')}>signup</button>
      <button onClick={() => void signOut()}>signout</button>
    </div>
  );
};

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

const settled = () => waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  signInWithPassword.mockResolvedValue({ error: null });
  signUp.mockResolvedValue({ error: null });
  signOutFn.mockResolvedValue({ error: null });
  onAuthStateChange.mockImplementation((cb: AuthCallback) => {
    emitAuthChange = cb;
    return { data: { subscription: { unsubscribe } } };
  });
});

describe('AuthProvider session bootstrap', () => {
  it('adopts an existing session and stops loading', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    renderAuth();
    // Starts in the loading state so the app doesn't flash the login screen at a
    // user who is already signed in.
    expect(screen.getByTestId('loading').textContent).toBe('true');

    await settled();
    expect(screen.getByTestId('user').textContent).toBe('user-1');
  });

  it('settles to signed-out when there is no stored session', async () => {
    renderAuth();
    await settled();
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('stops loading when getSession rejects, instead of hanging forever', async () => {
    // Regression guard for backlog item 2: with no .catch, a rejection here left
    // loading=true permanently, so the app sat on the loading screen.
    const warn = captureConsoleWarn();
    getSession.mockRejectedValue(new Error('network down'));
    renderAuth();

    await settled();
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('session bootstrap failed'),
      expect.any(Error)
    );
  });

  it('treats a returned error as signed-out and warns', async () => {
    const warn = captureConsoleWarn();
    getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'bad token' },
    });
    renderAuth();

    await settled();
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not read the stored session'),
      expect.anything()
    );
  });
});

describe('AuthProvider auth state changes', () => {
  it('adopts a session pushed by onAuthStateChange', async () => {
    renderAuth();
    await settled();
    expect(screen.getByTestId('user').textContent).toBe('none');

    act(() => emitAuthChange('SIGNED_IN', SESSION));
    expect(screen.getByTestId('user').textContent).toBe('user-1');
  });

  it('drops the session when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    renderAuth();
    await settled();

    act(() => emitAuthChange('SIGNED_OUT', null));
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderAuth();
    await settled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider credential actions', () => {
  it('passes the name as user metadata so the DB trigger can seed profiles.name', async () => {
    renderAuth();
    await settled();

    screen.getByText('signup').click();
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'pw',
        options: { data: { name: 'Ada' } },
      })
    );
  });

  it('signs in with the given credentials', async () => {
    renderAuth();
    await settled();

    screen.getByText('signin').click();
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' })
    );
  });

  it('drops the stale local envelope on sign-out', async () => {
    renderAuth();
    await settled();

    screen.getByText('signout').click();
    await waitFor(() => expect(clearState).toHaveBeenCalledTimes(1));
  });

  it('still clears local state when the sign-out request fails', async () => {
    // Sidebar fires signOut and ignores the result, so a rejection must not
    // escape as an unhandled rejection or skip the cleanup.
    const warn = captureConsoleWarn();
    signOutFn.mockRejectedValue(new Error('offline'));
    renderAuth();
    await settled();

    screen.getByText('signout').click();
    await waitFor(() => expect(clearState).toHaveBeenCalledTimes(1));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sign-out request failed'),
      expect.any(Error)
    );
  });
});

describe('useAuth', () => {
  it('throws outside an AuthProvider, rather than returning undefined', () => {
    const warn = captureConsoleWarn();
    // React logs the error boundary-less throw; the assertion is on the message.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/must be used within an AuthProvider/);
    spy.mockRestore();
    expect(warn).not.toHaveBeenCalled();
  });
});
