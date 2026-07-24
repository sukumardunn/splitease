import React, { useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type Mode = 'signin' | 'signup';

const LABEL_CLASS = 'block text-sm font-medium text-gray-700 mb-1';
const INPUT_CLASS =
  'w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500';

const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result =
      mode === 'signup'
        ? await signUp(name.trim(), email.trim(), password)
        : await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) setError(result.error);
    // On success onAuthStateChange flips the session and AuthGate re-renders.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center justify-center mb-6">
          <Wallet className="h-8 w-8 text-teal-500 mr-2" />
          <h1 className="text-2xl font-bold text-gray-800">SplitEase</h1>
        </div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4 text-center">
          {mode === 'signin' ? 'Log in to your account' : 'Create your account'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className={LABEL_CLASS}>
                Your name
              </label>
              <input
                id="auth-name"
                name="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}
          <div>
            <label htmlFor="auth-email" className={LABEL_CLASS}>
              Email
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className={LABEL_CLASS}>
              Password
            </label>
            <input
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={6}
              // Tells a password manager whether to offer a saved password or
              // generate a new one.
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="auth-password-hint"
              className={INPUT_CLASS}
            />
            <p id="auth-password-hint" className="mt-1 text-xs text-gray-500">
              At least 6 characters
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="w-full flex items-center justify-center bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin mr-2" />}
            {mode === 'signin' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="mt-4 w-full text-sm text-teal-600 hover:text-teal-700 font-medium"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
