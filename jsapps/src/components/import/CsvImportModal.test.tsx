/**
 * Phase 5a: the CSV import wizard.
 *
 * The parsing and planning are covered by services/csvImport.test.ts; what
 * matters here is the wizard contract — that nothing is written before the user
 * confirms, that the preview reflects what the plan said, and that what reaches
 * `importCsv` is exactly the selected rows.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CsvImportModal from './CsvImportModal';
import type { Expense, Friend, ImportBatch, User } from '../../types';
import type { CsvImportInput } from '../../context/AppContext';

const CURRENT_USER: User = {
  id: 'me-id',
  name: 'Vignesh',
  email: 'v@example.com',
  avatar: 'me.svg',
};
const ALICE: Friend = { id: 'alice-id', name: 'Alice', email: '', avatar: 'a.svg' };

const importCsv = vi.fn<(input: CsvImportInput) => Promise<ImportBatch>>();
const undoImport = vi.fn();

let contextValue: {
  currentUser: User;
  friends: Friend[];
  expenses: Expense[];
  importBatches: ImportBatch[];
  importCsv: typeof importCsv;
  undoImport: typeof undoImport;
};

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => contextValue,
}));

const SPLITWISE_CSV = [
  'Date,Description,Category,Cost,Currency,Vignesh,Alice',
  '2026-03-01,Dinner,Dining out,50.00,USD,25.00,-25.00',
  '2026-03-02,Groceries,Groceries,80.00,USD,-40.00,40.00',
  'Total balance,,,0.00,USD,-15.00,15.00',
].join('\n');

const A_BATCH: ImportBatch = {
  id: 'batch-1',
  source: 'csv',
  filename: 'splitwise.csv',
  expenseCount: 2,
  friendCount: 1,
  undoneAt: null,
  createdAt: '2026-07-20T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  importCsv.mockResolvedValue(A_BATCH);
  undoImport.mockResolvedValue({ expensesRemoved: 2, friendsRemoved: 1, friendsKept: 0 });
  contextValue = {
    currentUser: CURRENT_USER,
    friends: [ALICE],
    expenses: [],
    importBatches: [],
    importCsv,
    undoImport,
  };
});

function setup() {
  const onClose = vi.fn();
  const view = render(<CsvImportModal isOpen onClose={onClose} />);
  return { onClose, ...view };
}

/**
 * Drive the file input. jsdom won't let `files` be assigned normally, so it is
 * redefined on the element — the standard workaround for testing uploads.
 */
function pickFile(text: string, name: string) {
  const input = document.getElementById('csv-file') as HTMLInputElement;
  const file = new File([text], name, { type: 'text/csv' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

/** The summary pill, which only exists on the preview step. */
const importablePill = () => screen.getByText(/^\d+ to import$/);

async function upload(text: string, name = 'splitwise.csv') {
  pickFile(text, name);
  await waitFor(() => expect(importablePill()).toBeInTheDocument());
}

describe('CsvImportModal', () => {
  it('is a labelled modal dialog', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Import expenses from a CSV/i);
  });

  it('renders nothing when closed', () => {
    render(<CsvImportModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('goes straight to the preview for a recognized export', async () => {
    setup();
    await upload(SPLITWISE_CSV);

    expect(importablePill()).toHaveTextContent('2 to import');
    expect(screen.getByText('Dinner')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    // Splitwise's footer row is dropped, not shown as an unusable row.
    expect(screen.getByText('1 row(s) skipped')).toBeInTheDocument();
    expect(screen.queryByText(/unusable/)).not.toBeInTheDocument();
  });

  it('writes nothing until the user confirms', async () => {
    setup();
    await upload(SPLITWISE_CSV);
    expect(importCsv).not.toHaveBeenCalled();
  });

  it('sends exactly the selected rows to importCsv', async () => {
    setup();
    await upload(SPLITWISE_CSV);

    // Untick the first row; only the second should be written.
    fireEvent.click(screen.getByRole('checkbox', { name: /Dinner/ }));
    expect(screen.getByRole('button', { name: /Import 1 expense$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Import 1 expense$/ }));
    await waitFor(() => expect(importCsv).toHaveBeenCalledTimes(1));

    const input = importCsv.mock.calls[0][0];
    expect(input.filename).toBe('splitwise.csv');
    expect(input.expenses).toHaveLength(1);
    expect(input.expenses[0]).toMatchObject({
      description: 'Groceries',
      amount: 80,
      paidBy: 'alice-id',
      category: 'groceries',
    });
    expect(input.friends).toEqual([]);
  });

  it('shows the completion summary after a successful import', async () => {
    setup();
    await upload(SPLITWISE_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Import 2 expenses/ }));

    await waitFor(() => expect(screen.getByText('Import complete')).toBeInTheDocument());
    expect(screen.getByText(/Added 2 expenses/)).toBeInTheDocument();
  });

  it('reports a failed import as saving nothing, and stays open', async () => {
    importCsv.mockRejectedValue(new Error('insert expense: denied'));
    setup();
    await upload(SPLITWISE_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Import 2 expenses/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/nothing was saved/));
    expect(screen.queryByText('Import complete')).not.toBeInTheDocument();
  });

  it('unticks a row that duplicates an existing expense but lets it be re-ticked', async () => {
    contextValue.expenses = [
      {
        id: 'existing',
        description: 'Dinner',
        amount: 50,
        paidBy: 'me-id',
        splitWith: [],
        date: '2026-03-01T12:00:00.000Z',
        category: 'dining',
        currency: 'USD',
        groupId: null,
      },
    ];
    setup();
    await upload(SPLITWISE_CSV);

    expect(screen.getByText('1 possible duplicate(s)')).toBeInTheDocument();
    expect(screen.getByText(/already have an expense like this/)).toBeInTheDocument();

    const duplicate = screen.getByRole('checkbox', { name: /Dinner/ });
    expect(duplicate).not.toBeChecked();
    fireEvent.click(duplicate);
    expect(screen.getByRole('button', { name: /Import 2 expenses/ })).toBeInTheDocument();
  });

  it('flags an unusable row, disables it, and imports the rest', async () => {
    setup();
    await upload(
      ['Date,Description,Cost,Vignesh,Alice', '2026-03-01,Odd,50.00,25.00,-10.00'].join('\n')
    );

    expect(screen.getByText('1 unusable row(s)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Odd/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Import 0 expenses/ })).toBeDisabled();
  });

  it('asks for a manual mapping when required columns are missing', async () => {
    setup();
    pickFile('Cost,Vignesh,Alice\n50.00,25.00,-25.00', 'odd.csv');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Still needed/));
    expect(screen.getByRole('button', { name: /Preview import/ })).toBeDisabled();
  });

  it('lets the user map the missing columns and then preview', async () => {
    setup();
    pickFile('Cost,Whatever,Vignesh,Alice\n50.00,Dinner,25.00,-25.00', 'odd.csv');
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());

    // 'Whatever' was guessed to be a person; it is really the description, and
    // there is no date column at all.
    fireEvent.change(screen.getByLabelText(/Role for column Whatever/), {
      target: { value: 'description' },
    });
    expect(screen.getByRole('status')).toHaveTextContent(/Still needed: date/);

    fireEvent.change(screen.getByLabelText(/Role for column Alice/), {
      target: { value: 'date' },
    });
    // Now nothing is missing, so the preview opens — with Alice's cell as the
    // date it cannot be read, which the preview reports rather than hiding.
    fireEvent.click(screen.getByRole('button', { name: /Preview import/ }));
    expect(importablePill()).toHaveTextContent('0 to import');
    expect(screen.getByText('1 unusable row(s)')).toBeInTheDocument();
  });

  it('recognizes alternative header names', async () => {
    setup();
    // 'When' and 'Item' are aliases for date and description.
    await upload('When,Item,Cost,Vignesh,Alice\n2026-03-01,Dinner,50.00,25.00,-25.00', 'alt.csv');
    expect(importablePill()).toHaveTextContent('1 to import');
  });

  it('rejects a file with no data rows', async () => {
    setup();
    pickFile('Date,Description,Cost', 'empty.csv');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no data rows/));
    expect(importCsv).not.toHaveBeenCalled();
  });

  it('counts a friend the import would create', async () => {
    contextValue.friends = [];
    setup();
    await upload(SPLITWISE_CSV);
    expect(screen.getByText('1 new friend(s)')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CsvImportModal previous imports', () => {
  beforeEach(() => {
    contextValue.importBatches = [A_BATCH];
  });

  it('lists a previous import with an undo control', () => {
    setup();
    const item = screen.getByText('splitwise.csv').closest('li')!;
    expect(within(item).getByText(/2 expenses, 1 friend/)).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: /Undo/ })).toBeInTheDocument();
  });

  it('undoes an import by id', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(() => expect(undoImport).toHaveBeenCalledWith('batch-1'));
  });

  it('surfaces an undo failure', async () => {
    undoImport.mockRejectedValue(new Error('no rows affected'));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't undo that import/)
    );
  });

  it('offers no undo for a batch that was already undone', () => {
    contextValue.importBatches = [{ ...A_BATCH, undoneAt: '2026-07-21T00:00:00.000Z' }];
    setup();
    expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument();
    expect(screen.getByText('Undone')).toBeInTheDocument();
  });
});
