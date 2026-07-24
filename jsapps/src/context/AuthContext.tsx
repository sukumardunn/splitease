import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearState } from '../services/localStore';

interface AuthContextType {
  session: Session | null;
  /** true until the initial getSession() resolves. */
  loading: boolean;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // A recoverable read failure (e.g. a corrupt stored token). Treat it
          // as signed-out rather than trusting a half-read session.
          console.warn('SplitEase: could not read the stored session', error);
        }
        setSession(data.session);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Without this catch a rejection here left `loading` true forever, so the
        // app sat on the loading screen with no way forward (and the rejection
        // went unhandled). Fall back to signed-out so the login form renders.
        console.warn('SplitEase: session bootstrap failed', err);
        setSession(null);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return;
      setSession(next);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }, // handle_new_user() seeds profiles.name from this
    });
    return { error: error?.message ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Don't let a network hiccup strand the caller (Sidebar fires this and
      // ignores the result); onAuthStateChange still drives the UI.
      console.warn('SplitEase: sign-out request failed', err);
    } finally {
      clearState(); // remote is the source of truth; drop any stale local envelope
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
