import { describe, it, expect, beforeEach } from 'vitest';
import { loadState, saveState, STORAGE_KEY } from './localStore';
import { AppState } from '../types';

const sample: AppState = {
  currentUser: { id: 'u1', name: 'You', email: 'you@x.com', avatar: '' },
  friends: [{ id: 'f1', name: 'A', email: 'a@x.com', avatar: '' }],
  groups: [{ id: 'g1', name: 'G', members: ['u1', 'f1'], avatar: '' }],
  expenses: [
    {
      id: 'e1', description: 'x', amount: 10, paidBy: 'u1',
      splitWith: [{ userId: 'u1', amount: 5 }, { userId: 'f1', amount: 5 }],
      date: '2026-01-01T00:00:00Z', category: 'other', currency: 'USD', groupId: 'g1',
    },
  ],
  settlements: [],
  activityEvents: [],
};

describe('localStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(loadState()).toBeNull();
  });

  it('round-trips state through save/load', () => {
    saveState(sample);
    const loaded = loadState();
    expect(loaded).toEqual(sample);
  });

  it('persists under a versioned envelope', () => {
    saveState(sample);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.version).toBeTypeOf('number');
    expect(raw.state).toEqual(sample);
  });

  it('returns null and does not throw on corrupt data', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(() => loadState()).not.toThrow();
    expect(loadState()).toBeNull();
  });

  it('ignores state from an incompatible version', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 999, state: sample })
    );
    expect(loadState()).toBeNull();
  });
});
