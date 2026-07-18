import { AppState } from '../types';

export const STORAGE_KEY = 'splitease.appState';

/**
 * Bump when the persisted shape changes incompatibly. Older/newer envelopes are
 * ignored (treated as "no data") so the app re-seeds rather than crashing.
 * A future phase can add real migrations here.
 */
export const STORAGE_VERSION = 1;

interface Envelope {
  version: number;
  state: AppState;
}

/** Load persisted state, or null if absent/corrupt/incompatible. Never throws. */
export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope;
    if (!parsed || parsed.version !== STORAGE_VERSION || !parsed.state) {
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}

/** Persist state under a versioned envelope. Swallows quota/serialisation errors. */
export function saveState(state: AppState): void {
  try {
    const envelope: Envelope = { version: STORAGE_VERSION, state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    // Storage full or unavailable (e.g. private mode). Non-fatal for the UI.
    console.warn('SplitEase: failed to persist state', err);
  }
}

/** Remove all persisted state (used by "reset"/logout flows). */
export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}
