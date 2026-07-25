import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, Expense, Friend, Group, ImportBatch, Settlement, User } from '../types';
import * as store from '../services/supabaseStore';
import { useAuth } from './AuthContext';
import { useToast } from '../components/ui/Toast';
import LoadingScreen from '../components/ui/LoadingScreen';
import {
  computeNetBalances,
  computeAbsoluteNet,
  simplifyDebts,
  Transfer,
} from '../services/splitEngine';
import {
  ActivityEvent,
  CreateEventInput,
  appendActivityEvent,
  createActivityEvent,
} from '../services/activityLog';
import * as receiptStore from '../services/receiptStore';
import type { Receipt, ReceiptIndex } from '../services/receiptStore';
import type { EncodedReceipt } from '../services/receiptImage';
import { loadState, clearState } from '../services/localStore';
import { generateAvatar } from '../utils/avatar';
import { remapLocalState, IMPORT_HANDLED_KEY } from '../services/importRemapper';
import ImportPrompt from '../components/import/ImportPrompt';

interface AppContextType {
  currentUser: User;
  friends: Friend[];
  /** Active (non-soft-deleted) groups. */
  groups: Group[];
  /** Active (non-soft-deleted) expenses. */
  expenses: Expense[];
  /** Active (non-soft-deleted) settlements. */
  settlements: Settlement[];
  /** Append-only audit/activity log, newest first. */
  activityEvents: ActivityEvent[];
  /** Soft-deleted expenses, most-recently-deleted first (for the Recently Deleted view). */
  deletedExpenses: Expense[];
  /** Soft-deleted groups, most-recently-deleted first. */
  deletedGroups: Group[];
  /** Bulk-import records, newest first — including ones already undone. */
  importBatches: ImportBatch[];
  /** Create a contact to split with. Friends are local contacts, not accounts. */
  addFriend: (friend: { name: string; email: string }) => void;
  /**
   * `receipt` is written straight after the expense row it belongs to, inside the
   * same persist step, because it is an FK child and cannot land first. A new
   * expense's id is generated here, so this is the only way the create path can
   * attach one.
   */
  addExpense: (expense: Omit<Expense, 'id' | 'date'>, receipt?: EncodedReceipt) => void;
  updateExpense: (id: string, expense: Partial<Expense>) => void;
  /**
   * Which expenses have a receipt image, by expense id — **metadata only**, no
   * bytes. This is what lets a row show a receipt button without the startup load
   * dragging every image down with it (see `services/receiptStore.ts`).
   */
  receipts: ReceiptIndex;
  /** Read one receipt's bytes, on demand. Null when the expense has none. */
  loadReceipt: (expenseId: string) => Promise<Receipt | null>;
  /**
   * Attach or replace an expense's receipt.
   *
   * Not optimistic, and never rejects: a receipt is an attachment to an expense
   * that has already been saved, so a failure here must not roll the expense
   * back. It toasts and leaves the expense alone instead.
   */
  attachReceipt: (expenseId: string, receipt: EncodedReceipt) => Promise<void>;
  /** Detach an expense's receipt. Same non-rejecting contract as `attachReceipt`. */
  removeReceipt: (expenseId: string) => Promise<void>;
  /** Soft-delete: sets deletedAt; reversible via restoreExpense. */
  deleteExpense: (id: string) => void;
  restoreExpense: (id: string) => void;
  /** Permanent, irreversible removal (explicit user action from Recently Deleted). */
  purgeExpense: (id: string) => void;
  addGroup: (group: Omit<Group, 'id'>) => void;
  updateGroup: (id: string, group: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  restoreGroup: (id: string) => void;
  purgeGroup: (id: string) => void;
  settleDebt: (fromId: string, toId: string, amount: number, groupId?: string | null) => void;
  /**
   * Write a CSV import as one undoable batch, then reload from the server.
   *
   * Unlike the other mutators this is `async` and not optimistic: a bulk write
   * has no meaningful half-applied UI state, and the whole-state rollback the
   * optimistic path uses would be the wrong tool for it. Callers await the
   * promise and surface their own progress/errors.
   */
  importCsv: (input: CsvImportInput) => Promise<ImportBatch>;
  /** Undo a previous import wholesale, then reload. See `undoImportBatch`. */
  undoImport: (batchId: string) => Promise<store.UndoImportResult>;
  getBalances: () => { friend: Friend; balance: number }[];
  /** Minimal set of "who pays whom" transfers that settles the given participants
   *  (defaults to the current user + all friends). Powers debt simplification. */
  getSuggestedSettlements: (participantIds?: string[]) => Transfer[];
  getGroupById: (id: string) => Group | undefined;
}

export interface CsvImportInput {
  friends: Friend[];
  expenses: Expense[];
  filename: string;
  source?: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
};

interface AppContextProviderProps {
  children: ReactNode;
}

const SAVE_FAILED_MESSAGE = "Couldn't save your change — it was undone.";
const RECEIPT_SAVE_FAILED_MESSAGE = "Couldn't save the receipt — the expense was saved without it.";
const RECEIPT_REMOVE_FAILED_MESSAGE = "Couldn't remove the receipt — it's still attached.";

export const AppContextProvider: React.FC<AppContextProviderProps> = ({ children }) => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id ?? '';

  const [state, setState] = useState<AppState | null>(null);
  /**
   * Receipt metadata, kept out of `AppState` on purpose. `AppState` is the
   * persistable/importable shape (localStorage legacy import, `remapLocalState`),
   * and receipts are neither — they are server-side attachments with no local
   * counterpart. Bytes are never held here; `loadReceipt` fetches those.
   */
  const [receipts, setReceipts] = useState<ReceiptIndex>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importCandidate, setImportCandidate] = useState<AppState | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  // Mirror of `state` that updates synchronously inside mutators, so rapid
  // successive mutations snapshot/rollback correctly (no stale closures).
  const stateRef = useRef<AppState | null>(null);
  /**
   * Whether the user is signed out *right now*, readable from an async callback
   * that settles long after the render it was scheduled in.
   *
   * A mutation still in flight when the user signs out would otherwise toast
   * "couldn't save your change" over the login screen: signing out unmounts this
   * provider, but ToastProvider sits above the auth gate (see App.tsx) and
   * survives, so the pending promise's rollback toast still renders.
   */
  const signedOutRef = useRef(false);
  useEffect(() => {
    signedOutRef.current = !session;
  }, [session]);

  const applyState = (next: AppState | null) => {
    stateRef.current = next;
    setState(next);
  };

  /**
   * Refresh the receipt index. Metadata only, so this is cheap enough to run
   * beside the main load and after any bulk change.
   *
   * Its failure is deliberately not `loadError`: a receipt index that could not
   * be read costs the user a paperclip button, while `loadError` replaces the
   * whole app with a retry screen. The expenses themselves are unaffected.
   */
  const refreshReceipts = (): Promise<void> =>
    receiptStore
      .fetchReceiptIndex()
      .then(setReceipts)
      .catch((err: unknown) => {
        console.warn('SplitEase: could not load receipt metadata', err);
      });

  useEffect(() => {
    let cancelled = false;
    if (!userId) return undefined;
    setLoadError(null);
    // Rides along with the startup load rather than waiting for it: it is a
    // separate, metadata-only query, and nothing in the main state depends on it.
    receiptStore
      .fetchReceiptIndex()
      .then((index) => {
        if (!cancelled) setReceipts(index);
      })
      .catch((err: unknown) => {
        console.warn('SplitEase: could not load receipt metadata', err);
      });
    store
      .fetchAll(userId)
      .then((remote) => {
        if (!cancelled) {
          applyState(remote);
          const remoteEmpty =
            remote.friends.length === 0 &&
            remote.groups.length === 0 &&
            remote.expenses.length === 0 &&
            remote.settlements.length === 0;
          const local = loadState();
          if (remoteEmpty && local && localStorage.getItem(IMPORT_HANDLED_KEY) !== '1') {
            setImportCandidate(local);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * Optimistic-online mutation: apply locally now, persist async, roll back the
   * entire prior state + toast on failure. The optional activity event is
   * persisted best-effort AFTER the primary write succeeds (its failure never
   * rolls back the primary mutation).
   * Rollback restores a whole-state snapshot taken before this mutation, so it
   * also discards any other optimistic mutation applied after that snapshot
   * (accepted Phase-4a tradeoff; UI may diverge from the DB until the next
   * refetch if that other mutation's own persist succeeded).
   */
  const mutate = (
    updater: (prev: AppState) => AppState,
    persist: () => Promise<void>,
    event?: ActivityEvent
  ): void => {
    const prev = stateRef.current;
    if (!prev) return;
    applyState(updater(prev));
    persist()
      .then(() => {
        if (event) recordEvent(event);
      })
      .catch((err: unknown) => {
        console.warn('SplitEase: persist failed, rolling back', err);
        applyState(prev);
        // Signed out mid-flight: the change is moot and the toast would land on
        // the login screen, so roll back silently.
        if (signedOutRef.current) return;
        showToast({ message: SAVE_FAILED_MESSAGE });
      });
  };

  const buildEvent = (
    actorId: string,
    input: Omit<CreateEventInput, 'actorId' | 'id'>
  ): ActivityEvent =>
    createActivityEvent({ id: crypto.randomUUID(), actorId, ...input });

  const addFriend = (input: { name: string; email: string }) => {
    const current = stateRef.current;
    if (!current) return;
    const newFriend: Friend = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      avatar: generateAvatar(input.name),
    };
    const event = buildEvent(current.currentUser.id, {
      action: 'friend.add',
      entityType: 'friend',
      entityId: newFriend.id,
      after: newFriend,
    });
    mutate(
      (prev) => ({
        ...prev,
        friends: [...prev.friends, newFriend],
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.insertFriend(userId, newFriend),
      event
    );
  };

  /**
   * Write a receipt and fold the result into the index.
   *
   * Swallows its own failure by design (see `attachReceipt`'s contract): the
   * expense it belongs to has already been saved, so rolling anything back would
   * be wrong, and the caller — a modal that has usually closed by now — has
   * nowhere to show an error. A toast plus a `console.warn` is the honest report.
   */
  const saveReceipt = async (expenseId: string, encoded: EncodedReceipt): Promise<void> => {
    try {
      const meta = await receiptStore.upsertReceipt(userId, expenseId, encoded);
      setReceipts((prev) => ({ ...prev, [expenseId]: meta }));
    } catch (err) {
      console.warn('SplitEase: could not save a receipt', err);
      if (!signedOutRef.current) showToast({ message: RECEIPT_SAVE_FAILED_MESSAGE });
    }
  };

  const removeReceipt = async (expenseId: string): Promise<void> => {
    try {
      await receiptStore.deleteReceipt(expenseId);
      setReceipts((prev) => {
        const next = { ...prev };
        delete next[expenseId];
        return next;
      });
    } catch (err) {
      console.warn('SplitEase: could not remove a receipt', err);
      if (!signedOutRef.current) showToast({ message: RECEIPT_REMOVE_FAILED_MESSAGE });
    }
  };

  const loadReceipt = (expenseId: string): Promise<Receipt | null> =>
    receiptStore.fetchReceipt(expenseId);

  const addExpense = (expense: Omit<Expense, 'id' | 'date'>, receipt?: EncodedReceipt) => {
    const current = stateRef.current;
    if (!current) return;
    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      deletedAt: null,
    };
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.create',
      entityType: 'expense',
      entityId: newExpense.id,
      groupId: newExpense.groupId,
      after: newExpense,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: [newExpense, ...prev.expenses],
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      async () => {
        await store.insertExpense(userId, newExpense);
        // Strictly after the parent: `expense_receipts.expense_id` is an FK, so
        // the reverse order would fail. `saveReceipt` never throws, so a receipt
        // problem cannot roll back an expense that saved cleanly.
        if (receipt) await saveReceipt(newExpense.id, receipt);
      },
      event
    );
  };

  const updateExpense = (id: string, updatedExpense: Partial<Expense>) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.expenses.find((e) => e.id === id);
    if (!before) return;
    const after = { ...before, ...updatedExpense };
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.update',
      entityType: 'expense',
      entityId: id,
      groupId: after.groupId,
      before,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? after : e)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.updateExpense(userId, after),
      event
    );
  };

  const deleteExpense = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.expenses.find((e) => e.id === id && !e.deletedAt);
    if (!before) return;
    const deletedAt = new Date().toISOString();
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.delete',
      entityType: 'expense',
      entityId: id,
      groupId: before.groupId,
      before,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? { ...e, deletedAt } : e)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setExpenseDeleted(id, deletedAt),
      event
    );
  };

  const restoreExpense = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const target = current.expenses.find((e) => e.id === id && !!e.deletedAt);
    if (!target) return;
    const after = { ...target, deletedAt: null };
    const event = buildEvent(current.currentUser.id, {
      action: 'expense.restore',
      entityType: 'expense',
      entityId: id,
      groupId: after.groupId,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === id ? after : e)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setExpenseDeleted(id, null),
      event
    );
  };

  const purgeExpense = (id: string) => {
    mutate(
      (prev) => ({
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== id),
      }),
      // The row's receipt goes with it by FK cascade, so the index entry has to
      // go too — after the delete succeeds, so a rejected purge leaves it alone.
      () =>
        store.purgeExpense(id).then(() => {
          setReceipts((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        })
    );
  };

  const addGroup = (group: Omit<Group, 'id'>) => {
    const current = stateRef.current;
    if (!current) return;
    const newGroup: Group = { ...group, id: crypto.randomUUID(), deletedAt: null };
    const event = buildEvent(current.currentUser.id, {
      action: 'group.create',
      entityType: 'group',
      entityId: newGroup.id,
      groupId: newGroup.id,
      after: newGroup,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: [newGroup, ...prev.groups],
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.insertGroup(userId, newGroup),
      event
    );
  };

  const updateGroup = (id: string, updatedGroup: Partial<Group>) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.groups.find((g) => g.id === id);
    if (!before) return;
    const after = { ...before, ...updatedGroup };
    const event = buildEvent(current.currentUser.id, {
      action: 'group.update',
      entityType: 'group',
      entityId: id,
      groupId: id,
      before,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? after : g)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.updateGroup(userId, after),
      event
    );
  };

  const deleteGroup = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const before = current.groups.find((g) => g.id === id && !g.deletedAt);
    if (!before) return;
    const deletedAt = new Date().toISOString();
    const event = buildEvent(current.currentUser.id, {
      action: 'group.delete',
      entityType: 'group',
      entityId: id,
      groupId: id,
      before,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? { ...g, deletedAt } : g)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setGroupDeleted(id, deletedAt),
      event
    );
  };

  const restoreGroup = (id: string) => {
    const current = stateRef.current;
    if (!current) return;
    const target = current.groups.find((g) => g.id === id && !!g.deletedAt);
    if (!target) return;
    const after = { ...target, deletedAt: null };
    const event = buildEvent(current.currentUser.id, {
      action: 'group.restore',
      entityType: 'group',
      entityId: id,
      groupId: id,
      after,
    });
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? after : g)),
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.setGroupDeleted(id, null),
      event
    );
  };

  const purgeGroup = (id: string) => {
    mutate(
      (prev) => ({
        ...prev,
        groups: prev.groups.filter((g) => g.id !== id),
      }),
      () => store.purgeGroup(id)
    );
  };

  const settleDebt = (
    fromId: string,
    toId: string,
    amount: number,
    groupId: string | null = null
  ) => {
    const current = stateRef.current;
    if (!current) return;
    const settlement: Settlement = {
      id: crypto.randomUUID(),
      fromUserId: fromId,
      toUserId: toId,
      amount,
      currency: 'USD',
      date: new Date().toISOString(),
      groupId,
      deletedAt: null,
    };
    const event = buildEvent(current.currentUser.id, {
      action: 'settlement.create',
      entityType: 'settlement',
      entityId: settlement.id,
      groupId,
      after: settlement,
    });
    mutate(
      (prev) => ({
        ...prev,
        settlements: [settlement, ...prev.settlements],
        activityEvents: appendActivityEvent(prev.activityEvents, event),
      }),
      () => store.insertSettlement(userId, settlement),
      event
    );
  };

  /**
   * Persist an activity event without letting its failure fail the caller. The
   * audit log is secondary to the data it describes — same policy as `mutate`.
   */
  const recordEvent = (event: ActivityEvent): void => {
    store.insertActivityEvent(userId, event).catch((err: unknown) => {
      console.warn('SplitEase: activity event not persisted', err);
    });
  };

  const importCsv = async (input: CsvImportInput): Promise<ImportBatch> => {
    const current = stateRef.current;
    if (!current) throw new Error('Not ready to import yet.');
    const batchId = crypto.randomUUID();
    const batch = await store.importCsvBatch(userId, batchId, {
      friends: input.friends,
      expenses: input.expenses,
      filename: input.filename,
      source: input.source ?? 'csv',
    });
    recordEvent(
      buildEvent(current.currentUser.id, {
        action: 'import.create',
        entityType: 'import',
        entityId: batch.id,
        after: {
          source: batch.source,
          filename: batch.filename,
          expenseCount: batch.expenseCount,
          friendCount: batch.friendCount,
        },
      })
    );
    // Refetch rather than merge: the batch touched friends, expenses, payers and
    // splits at once, and the server is the only thing that knows what landed.
    applyState(await store.fetchAll(userId));
    return batch;
  };

  const undoImport = async (batchId: string): Promise<store.UndoImportResult> => {
    const current = stateRef.current;
    if (!current) throw new Error('Not ready yet.');
    const batch = current.importBatches.find((b) => b.id === batchId);
    const result = await store.undoImportBatch(batchId);
    recordEvent(
      buildEvent(current.currentUser.id, {
        action: 'import.undo',
        entityType: 'import',
        entityId: batchId,
        before: {
          source: batch?.source,
          filename: batch?.filename,
          expenseCount: result.expensesRemoved,
          friendCount: result.friendsRemoved,
        },
      })
    );
    applyState(await store.fetchAll(userId));
    // An undo hard-deletes the batch's expenses, and `expense_receipts` cascades
    // with them, so the index has to be re-read rather than trusted.
    await refreshReceipts();
    return result;
  };

  const handleImport = () => {
    const candidate = importCandidate;
    if (!candidate) return;
    setImportBusy(true);
    Promise.resolve()
      .then(() => remapLocalState(candidate, userId))
      .then((remapped) => store.importState(userId, remapped))
      .then(() => store.fetchAll(userId))
      .then((remote) => {
        applyState(remote);
        localStorage.setItem(IMPORT_HANDLED_KEY, '1');
        clearState();
        setImportCandidate(null);
      })
      .catch((err: unknown) => {
        console.warn('SplitEase: import failed', err);
        showToast({ message: "Import failed — your local data is untouched. Try again later." });
      })
      .finally(() => setImportBusy(false));
  };
  const handleDismissImport = () => {
    localStorage.setItem(IMPORT_HANDLED_KEY, '1');
    setImportCandidate(null);
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-600 px-4">
        <p className="font-semibold mb-2">Couldn’t load your data</p>
        <p className="text-sm mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!state) {
    return <LoadingScreen />;
  }

  const { currentUser, friends } = state;

  // Derived active/deleted views.
  const expenses = state.expenses.filter((e) => !e.deletedAt);
  const groups = state.groups.filter((g) => !g.deletedAt);
  const settlements = state.settlements.filter((s) => !s.deletedAt);
  const activityEvents = state.activityEvents;
  const deletedExpenses = state.expenses
    .filter((e) => !!e.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  const deletedGroups = state.groups
    .filter((g) => !!g.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

  const getBalances = () => {
    const friendIds = friends.map((f) => f.id);
    const balances = computeNetBalances(
      currentUser.id,
      friendIds,
      expenses,
      settlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
      }))
    );
    return friendIds.map((friendId) => ({
      friend: friends.find((f) => f.id === friendId)!,
      balance: balances[friendId] ?? 0,
    }));
  };

  const getSuggestedSettlements = (participantIds?: string[]): Transfer[] => {
    const ids = participantIds ?? [currentUser.id, ...friends.map((f) => f.id)];
    const net = computeAbsoluteNet(
      ids,
      expenses,
      settlements.map((s) => ({
        fromUserId: s.fromUserId,
        toUserId: s.toUserId,
        amount: s.amount,
      }))
    );
    return simplifyDebts(net);
  };

  const getGroupById = (id: string) => groups.find((group) => group.id === id);

  const value: AppContextType = {
    currentUser,
    friends,
    groups,
    expenses,
    settlements,
    activityEvents,
    deletedExpenses,
    deletedGroups,
    addFriend,
    addExpense,
    updateExpense,
    receipts,
    loadReceipt,
    attachReceipt: saveReceipt,
    removeReceipt,
    deleteExpense,
    restoreExpense,
    purgeExpense,
    addGroup,
    updateGroup,
    deleteGroup,
    restoreGroup,
    purgeGroup,
    settleDebt,
    importBatches: state.importBatches,
    importCsv,
    undoImport,
    getBalances,
    getSuggestedSettlements,
    getGroupById,
  };

  return (
    <AppContext.Provider value={value}>
      {importCandidate && (
        <ImportPrompt busy={importBusy} onImport={handleImport} onDismiss={handleDismissImport} />
      )}
      {children}
    </AppContext.Provider>
  );
};
