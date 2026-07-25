import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileUp, Loader2, Undo2, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { formatCurrency, formatDate } from '../../utils/helpers';
import {
  ColumnMapping,
  ColumnRole,
  DraftExpense,
  ImportPlan,
  PersonTarget,
  buildImportPlan,
  defaultSelection,
  detectMapping,
  materializePlan,
  missingRoles,
  parseCsv,
  summarizePlan,
} from '../../services/csvImport';
import { ImportBatch } from '../../types';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Upload the file, confirm how its columns map, review, then write. */
type Step = 'upload' | 'map' | 'preview' | 'done';

const ROLE_LABELS: { value: ColumnRole; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
  { value: 'category', label: 'Category' },
  { value: 'currency', label: 'Currency' },
  { value: 'person', label: "Person's share" },
  { value: 'ignore', label: 'Ignore' },
];

const SELECT_CLASS =
  'w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';
const PRIMARY_BUTTON =
  'px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center justify-center';
const SECONDARY_BUTTON =
  'px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg';

/** Encodes a PersonTarget as a <select> value and back. */
function encodeTarget(target: PersonTarget): string {
  switch (target.kind) {
    case 'me':
      return 'me';
    case 'friend':
      return `friend:${target.friendId}`;
    case 'new':
      return 'new';
    case 'ignore':
      return 'ignore';
  }
}

function decodeTarget(value: string, header: string): PersonTarget {
  if (value === 'me') return { kind: 'me' };
  if (value === 'ignore') return { kind: 'ignore' };
  if (value.startsWith('friend:')) return { kind: 'friend', friendId: value.slice(7) };
  return { kind: 'new', name: header.trim() };
}

/**
 * CSV import (Phase 5a, design §5.2 A): upload → column mapping → dry-run
 * preview with duplicates flagged → confirm, recorded as an undoable batch.
 *
 * All parsing and planning is delegated to `services/csvImport`; this component
 * only holds the wizard state and renders it. Nothing is written until the user
 * confirms on the preview step.
 */
const CsvImportModal: React.FC<CsvImportModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, friends, expenses, importBatches, importCsv, undoImport } = useAppContext();

  const [step, setStep] = useState<Step>('upload');
  const [filename, setFilename] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ roles: [], people: {} });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ expenses: number; friends: number } | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  // Escape must not close mid-write: the batch insert is already in flight.
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>({
    onEscape: onClose,
    locked: busy,
  });

  const headers = rows[0] ?? [];
  const directory = useMemo(() => ({ currentUser, friends }), [currentUser, friends]);

  const plan: ImportPlan | null = useMemo(() => {
    if (rows.length < 2 || missingRoles(mapping).length > 0) return null;
    return buildImportPlan(rows, mapping, { ...directory, existingExpenses: expenses });
  }, [rows, mapping, directory, expenses]);

  const summary = plan ? summarizePlan(plan, selected) : null;

  const reset = () => {
    setStep('upload');
    setFilename('');
    setRows([]);
    setMapping({ roles: [], people: {} });
    setSelected(new Set());
    setError(null);
    setResult(null);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) {
        setError('That file has no data rows — just a header, or nothing at all.');
        return;
      }
      const detected = detectMapping(parsed[0], directory);
      setFilename(file.name);
      setRows(parsed);
      setMapping(detected);
      // A recognized export needs no manual mapping, so skip straight to the
      // preview — the user can still step back to adjust the columns.
      const nextPlan = buildImportPlan(parsed, detected, {
        ...directory,
        existingExpenses: expenses,
      });
      if (missingRoles(detected).length === 0) {
        setSelected(defaultSelection(nextPlan));
        setStep('preview');
      } else {
        setStep('map');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const goToPreview = () => {
    if (!plan) return;
    setSelected(defaultSelection(plan));
    setStep('preview');
  };

  const handleConfirm = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const materialized = materializePlan(plan, selected);
      await importCsv({ ...materialized, filename });
      setResult({ expenses: materialized.expenses.length, friends: materialized.friends.length });
      setStep('done');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Import failed — nothing was saved. ${err.message}`
          : 'Import failed — nothing was saved.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async (batch: ImportBatch) => {
    setUndoingId(batch.id);
    setError(null);
    try {
      await undoImport(batch.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? `Couldn't undo that import. ${err.message}` : "Couldn't undo that import.");
    } finally {
      setUndoingId(null);
    }
  };

  const setRole = (index: number, role: ColumnRole) => {
    setMapping((prev) => {
      const roles = [...prev.roles];
      roles[index] = role;
      const people = { ...prev.people };
      if (role === 'person') {
        people[index] = people[index] ?? { kind: 'new', name: headers[index]?.trim() ?? '' };
      } else {
        delete people[index];
      }
      return { roles, people };
    });
  };

  const setPerson = (index: number, value: string) => {
    setMapping((prev) => ({
      ...prev,
      people: { ...prev.people, [index]: decodeTarget(value, headers[index] ?? '') },
    }));
  };

  const toggleRow = (rowIndex: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const missing = missingRoles(mapping);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4 py-6">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        onKeyDown={onKeyDown}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-full flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id="csv-import-title" className="text-lg font-semibold text-gray-900">
            Import expenses from a CSV
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label="Close"
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {step === 'upload' && (
            <UploadStep
              batches={importBatches}
              undoingId={undoingId}
              onFile={handleFile}
              onUndo={handleUndo}
            />
          )}

          {step === 'map' && (
            <MapStep
              headers={headers}
              sampleRow={rows[1] ?? []}
              mapping={mapping}
              friends={friends}
              currentUserName={currentUser.name}
              missing={missing}
              onRoleChange={setRole}
              onPersonChange={setPerson}
            />
          )}

          {step === 'preview' && plan && summary && (
            <PreviewStep
              plan={plan}
              selected={selected}
              onToggleRow={toggleRow}
              summary={summary}
            />
          )}

          {step === 'done' && result && (
            <div className="text-center py-8">
              <CheckCircle2 aria-hidden="true" className="h-12 w-12 mx-auto text-teal-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Import complete</h3>
              <p className="text-gray-600">
                Added {result.expenses} expense{result.expenses === 1 ? '' : 's'}
                {result.friends > 0 &&
                  ` and ${result.friends} friend${result.friends === 1 ? '' : 's'}`}
                . You can undo this whole import from this screen later.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-200">
          <div>
            {step === 'preview' && (
              <button type="button" onClick={() => setStep('map')} className={SECONDARY_BUTTON}>
                Back to columns
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {step === 'done' ? (
              <button type="button" onClick={handleClose} className={PRIMARY_BUTTON}>
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={busy}
                  className={SECONDARY_BUTTON}
                >
                  Cancel
                </button>
                {step === 'map' && (
                  <button
                    type="button"
                    onClick={goToPreview}
                    disabled={missing.length > 0 || !plan}
                    className={PRIMARY_BUTTON}
                  >
                    Preview import
                  </button>
                )}
                {step === 'preview' && summary && (
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={busy || summary.importable === 0}
                    aria-busy={busy}
                    className={PRIMARY_BUTTON}
                  >
                    {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin mr-2" />}
                    Import {summary.importable} expense{summary.importable === 1 ? '' : 's'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- step 1: upload ----------

interface UploadStepProps {
  batches: ImportBatch[];
  undoingId: string | null;
  onFile: (file: File) => void;
  onUndo: (batch: ImportBatch) => void;
}

const UploadStep: React.FC<UploadStepProps> = ({ batches, undoingId, onFile, onUndo }) => (
  <div className="space-y-6">
    <div>
      <label
        htmlFor="csv-file"
        className="block border-2 border-dashed border-gray-300 rounded-xl px-6 py-10 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/40"
      >
        <FileUp aria-hidden="true" className="h-10 w-10 mx-auto text-gray-400 mb-3" />
        <span className="block font-medium text-gray-800">Choose a CSV file</span>
        <span className="block text-sm text-gray-500 mt-1">
          A Splitwise group export works as-is. Nothing is saved until you review it.
        </span>
      </label>
      <input
        id="csv-file"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear the input so re-picking the same file still fires a change.
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>

    {batches.length > 0 && (
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Previous imports</h3>
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {batches.map((batch) => (
            <li key={batch.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {batch.filename || 'Untitled import'}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(batch.createdAt)} · {batch.expenseCount} expense
                  {batch.expenseCount === 1 ? '' : 's'}
                  {batch.friendCount > 0 && `, ${batch.friendCount} friend${batch.friendCount === 1 ? '' : 's'}`}
                  {batch.undoneAt && ' · undone'}
                </p>
              </div>
              {batch.undoneAt ? (
                <span className="text-xs text-gray-400 shrink-0 ml-3">Undone</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onUndo(batch)}
                  disabled={undoingId === batch.id}
                  aria-busy={undoingId === batch.id}
                  className="shrink-0 ml-3 flex items-center text-sm text-gray-600 hover:text-red-600 font-medium disabled:opacity-50"
                >
                  {undoingId === batch.id ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Undo2 aria-hidden="true" className="h-4 w-4 mr-1" />
                  )}
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

// ---------- step 2: column mapping ----------

interface MapStepProps {
  headers: string[];
  sampleRow: string[];
  mapping: ColumnMapping;
  friends: { id: string; name: string }[];
  currentUserName: string;
  missing: ColumnRole[];
  onRoleChange: (index: number, role: ColumnRole) => void;
  onPersonChange: (index: number, value: string) => void;
}

const MapStep: React.FC<MapStepProps> = ({
  headers,
  sampleRow,
  mapping,
  friends,
  currentUserName,
  missing,
  onRoleChange,
  onPersonChange,
}) => (
  <div>
    <p className="text-sm text-gray-600 mb-4">
      Tell us what each column holds. A <strong>person&apos;s share</strong> column is the
      signed per-person amount Splitwise exports — positive when they paid more than
      their share.
    </p>

    {missing.length > 0 && (
      <p role="status" className="mb-4 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
        Still needed: {missing.join(', ')}.
      </p>
    )}

    <ul className="space-y-3">
      {headers.map((header, index) => (
        <li key={`${header}-${index}`} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{header || '(no header)'}</p>
            <p className="text-xs text-gray-500 truncate">e.g. {sampleRow[index] || '—'}</p>
          </div>
          <div>
            <label className="sr-only" htmlFor={`role-${index}`}>
              Role for column {header || index + 1}
            </label>
            <select
              id={`role-${index}`}
              className={SELECT_CLASS}
              value={mapping.roles[index] ?? 'ignore'}
              onChange={(e) => onRoleChange(index, e.target.value as ColumnRole)}
            >
              {ROLE_LABELS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            {mapping.roles[index] === 'person' && (
              <>
                <label className="sr-only" htmlFor={`person-${index}`}>
                  Who column {header || index + 1} refers to
                </label>
                <select
                  id={`person-${index}`}
                  className={SELECT_CLASS}
                  value={encodeTarget(mapping.people[index] ?? { kind: 'ignore' })}
                  onChange={(e) => onPersonChange(index, e.target.value)}
                >
                  <option value="me">{currentUserName} (you)</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={`friend:${friend.id}`}>
                      {friend.name}
                    </option>
                  ))}
                  <option value="new">Add &quot;{header.trim() || 'this person'}&quot; as a friend</option>
                  <option value="ignore">Skip this person</option>
                </select>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  </div>
);

// ---------- step 3: dry-run preview ----------

interface PreviewStepProps {
  plan: ImportPlan;
  selected: Set<number>;
  onToggleRow: (rowIndex: number) => void;
  summary: { importable: number; duplicates: number; errors: number; newFriends: number; total: number };
}

const PreviewStep: React.FC<PreviewStepProps> = ({ plan, selected, onToggleRow, summary }) => {
  const nameOf = (key: string): string =>
    plan.people.find((p) => p.key === key)?.name ?? 'Someone';

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <Pill tone="teal">{summary.importable} to import</Pill>
        {summary.newFriends > 0 && <Pill tone="blue">{summary.newFriends} new friend(s)</Pill>}
        {summary.duplicates > 0 && <Pill tone="amber">{summary.duplicates} possible duplicate(s)</Pill>}
        {summary.errors > 0 && <Pill tone="red">{summary.errors} unusable row(s)</Pill>}
        {plan.skipped.length > 0 && <Pill tone="gray">{plan.skipped.length} row(s) skipped</Pill>}
      </div>

      <p className="text-sm text-gray-600 mb-3">
        Duplicates of expenses you already have are unticked by default. Tick one to
        import it anyway.
      </p>

      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {plan.drafts.map((draft) => (
          <PreviewRow
            key={draft.rowIndex}
            draft={draft}
            checked={selected.has(draft.rowIndex)}
            onToggle={() => onToggleRow(draft.rowIndex)}
            nameOf={nameOf}
          />
        ))}
      </ul>
    </div>
  );
};

interface PreviewRowProps {
  draft: DraftExpense;
  checked: boolean;
  onToggle: () => void;
  nameOf: (key: string) => string;
}

const PreviewRow: React.FC<PreviewRowProps> = ({ draft, checked, onToggle, nameOf }) => {
  const isDuplicate = draft.duplicateOfId !== undefined || draft.duplicateOfRow !== undefined;
  const inputId = `row-${draft.rowIndex}`;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={!!draft.error}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
      />
      <label htmlFor={inputId} className="flex-1 min-w-0 cursor-pointer">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-gray-800 truncate">{draft.description}</span>
          <span className="text-gray-900 font-medium shrink-0">
            {formatCurrency(draft.amount, draft.currency)}
          </span>
        </span>
        <span className="block text-xs text-gray-500 mt-0.5">
          {formatDate(draft.date)}
          {!draft.error && ` · ${nameOf(draft.paidByKey)} paid · split ${draft.shares.length} way${draft.shares.length === 1 ? '' : 's'}`}
        </span>
        {draft.error && (
          <span className="mt-1 flex items-start text-xs text-red-600">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 mr-1 mt-px shrink-0" />
            {draft.error}
          </span>
        )}
        {!draft.error && isDuplicate && (
          <span className="mt-1 flex items-center text-xs text-amber-700">
            <Copy aria-hidden="true" className="h-3.5 w-3.5 mr-1 shrink-0" />
            {draft.duplicateOfRow !== undefined
              ? 'Duplicates an earlier row in this file'
              : 'You already have an expense like this'}
          </span>
        )}
      </label>
    </li>
  );
};

const PILL_TONES: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
};

const Pill: React.FC<{ tone: keyof typeof PILL_TONES; children: React.ReactNode }> = ({
  tone,
  children,
}) => <span className={`px-2.5 py-1 rounded-full font-medium ${PILL_TONES[tone]}`}>{children}</span>;

export default CsvImportModal;
