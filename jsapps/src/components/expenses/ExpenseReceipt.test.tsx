/**
 * Wave 3: receipt photos, stored in Postgres rather than a Storage bucket.
 *
 * The behaviour worth pinning is mostly about *when* things happen:
 *   - nothing is written until the form is submitted, so Cancel really cancels;
 *   - image bytes are read when a receipt is opened, never on render, which is
 *     the entire justification for the separate `expense_receipts` table;
 *   - a create attaches through `addExpense`, because the expense id does not
 *     exist until then and the receipt is an FK child.
 *
 * `prepareReceipt` is mocked: it is the canvas pipeline, tested on its own in
 * services/receiptImage.test.ts, and jsdom has no rasteriser.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Expense, Friend, User } from '../../types';
import type { EncodedReceipt } from '../../services/receiptImage';
import type { ReceiptIndex, Receipt } from '../../services/receiptStore';
import { captureConsoleWarn } from '../../test/console';

const ME: User = { id: 'me', name: 'Me', email: 'me@example.com', avatar: 'a.png' };
const ALICE: Friend = { id: 'alice', name: 'Alice', email: 'alice@example.com', avatar: 'b.png' };

const ENCODED: EncodedReceipt = {
  mimeType: 'image/jpeg',
  byteSize: 143360, // 140 KB
  dataBase64: 'QUJD',
  width: 1600,
  height: 1200,
};

const STORED: Receipt = {
  expenseId: 'e1',
  mimeType: 'image/jpeg',
  byteSize: 4096,
  createdAt: '2026-07-25T10:00:00.000Z',
  dataBase64: 'WFla',
};

const addExpense = vi.fn();
const updateExpense = vi.fn();
const attachReceipt = vi.fn(() => Promise.resolve());
const removeReceipt = vi.fn(() => Promise.resolve());
const loadReceipt = vi.fn(() => Promise.resolve<Receipt | null>(STORED));
let receipts: ReceiptIndex = {};

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    friends: [ALICE],
    groups: [],
    currentUser: ME,
    addExpense,
    updateExpense,
    deleteExpense: vi.fn(),
    restoreExpense: vi.fn(),
    receipts,
    attachReceipt,
    removeReceipt,
    loadReceipt,
    getGroupById: () => undefined,
  }),
}));

vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

// Signature given explicitly: `vi.fn(() => …)` infers a zero-argument mock, and
// the real call site passes a File, which then fails to typecheck.
const prepareReceipt = vi.fn<(file: File) => Promise<EncodedReceipt>>(() => Promise.resolve(ENCODED));
vi.mock('../../services/receiptImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/receiptImage')>()),
  prepareReceipt: (file: File) => prepareReceipt(file),
}));

import AddExpenseModal from './AddExpenseModal';
import ExpenseItem from './ExpenseItem';

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    description: 'Dinner',
    amount: 40,
    paidBy: ME.id,
    splitWith: [
      { userId: ME.id, amount: 20 },
      { userId: ALICE.id, amount: 20 },
    ],
    date: '2026-07-10T12:00:00.000Z',
    category: 'dining',
    currency: 'USD',
    groupId: null,
    deletedAt: null,
    ...over,
  };
}

function pickFile(bytes = 'x') {
  const input = document.getElementById('expense-receipt') as HTMLInputElement;
  const file = new File([bytes], 'receipt.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  addExpense.mockClear();
  updateExpense.mockClear();
  attachReceipt.mockClear();
  removeReceipt.mockClear();
  loadReceipt.mockClear();
  prepareReceipt.mockClear();
  prepareReceipt.mockResolvedValue(ENCODED);
  receipts = {};
});

describe('attaching a receipt from the expense form', () => {
  it('downscales the picked file and shows the size that will be stored', async () => {
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    pickFile();

    await waitFor(() => expect(prepareReceipt).toHaveBeenCalledTimes(1));
    // The honest number: bytes of the re-encoded JPEG, not of the file picked.
    expect(await screen.findByText(/140 KB \(1600 × 1200\)/)).toBeInTheDocument();
  });

  it('previews the staged image from a data URL built at render time', async () => {
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    pickFile();

    const preview = (await screen.findByAltText('Receipt preview')) as HTMLImageElement;
    // The DB stores bare base64; the prefix is assembled here from the mime type.
    expect(preview.src).toBe('data:image/jpeg;base64,QUJD');
  });

  it('writes nothing until the form is submitted', async () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    pickFile();
    await screen.findByAltText('Receipt preview');

    expect(attachReceipt).not.toHaveBeenCalled();
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it('discards a staged photo when the form is cancelled', async () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    pickFile();
    await screen.findByAltText('Receipt preview');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(attachReceipt).not.toHaveBeenCalled();
    expect(removeReceipt).not.toHaveBeenCalled();
  });

  it('hands a new expense its receipt through addExpense, not a separate write', async () => {
    // The id is generated inside AppContext, and `expense_receipts.expense_id` is
    // an FK, so the receipt cannot be written before the expense exists.
    render(<AddExpenseModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Taxi' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } });
    pickFile();
    await screen.findByAltText('Receipt preview');
    fireEvent.click(screen.getByRole('button', { name: /^add expense$/i }));

    expect(attachReceipt).not.toHaveBeenCalled();
    expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({ description: 'Taxi' }), ENCODED);
  });

  it('attaches to an existing expense on save', async () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    pickFile();
    await screen.findByAltText('Receipt preview');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(attachReceipt).toHaveBeenCalledWith('e1', ENCODED);
  });

  it('shows a rejection message and stages nothing', async () => {
    prepareReceipt.mockRejectedValueOnce(new Error('That image is still over 512 KB.'));
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    pickFile();

    expect(await screen.findByRole('alert')).toHaveTextContent('still over 512 KB');
    expect(screen.queryByAltText('Receipt preview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(attachReceipt).not.toHaveBeenCalled();
  });

  it('labels the file input, and offers Replace once something is attached', () => {
    receipts = { e1: { expenseId: 'e1', mimeType: 'image/jpeg', byteSize: 4096, createdAt: 'x' } };
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);

    const input = screen.getByLabelText(/replace photo/i);
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(screen.getByText(/Attached — 4 KB/)).toBeInTheDocument();
  });
});

describe('removing a stored receipt', () => {
  beforeEach(() => {
    receipts = { e1: { expenseId: 'e1', mimeType: 'image/jpeg', byteSize: 4096, createdAt: 'x' } };
  });

  it('detaches only on save, and says so beforehand', () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /remove the attached receipt/i }));

    expect(screen.getByText(/Will be removed when you save/)).toBeInTheDocument();
    expect(removeReceipt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(removeReceipt).toHaveBeenCalledWith('e1');
  });

  it('lets the removal be taken back before saving', () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /remove the attached receipt/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep it/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(removeReceipt).not.toHaveBeenCalled();
  });

  it('lets a replacement supersede a pending removal', async () => {
    render(<AddExpenseModal isOpen expense={expense()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /remove the attached receipt/i }));
    pickFile();
    await screen.findByAltText('Receipt preview');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(attachReceipt).toHaveBeenCalledWith('e1', ENCODED);
    expect(removeReceipt).not.toHaveBeenCalled();
  });
});

describe('viewing a receipt from an expense row', () => {
  it('shows no receipt button when the expense has none', () => {
    render(<ExpenseItem expense={expense()} />);
    expect(screen.queryByRole('button', { name: /view the receipt/i })).not.toBeInTheDocument();
  });

  it('reads no image bytes just by rendering the row', () => {
    receipts = { e1: { expenseId: 'e1', mimeType: 'image/jpeg', byteSize: 4096, createdAt: 'x' } };
    render(<ExpenseItem expense={expense()} />);

    expect(screen.getByRole('button', { name: /view the receipt for "Dinner"/i })).toBeInTheDocument();
    // The point of the whole design: a list of rows costs zero image bytes.
    expect(loadReceipt).not.toHaveBeenCalled();
  });

  it('fetches the image only when opened, and renders it from the payload', async () => {
    receipts = { e1: { expenseId: 'e1', mimeType: 'image/jpeg', byteSize: 4096, createdAt: 'x' } };
    render(<ExpenseItem expense={expense()} />);
    fireEvent.click(screen.getByRole('button', { name: /view the receipt/i }));

    expect(loadReceipt).toHaveBeenCalledWith('e1');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Receipt — Dinner/);
    expect(screen.getByText(/4 KB · stored in the database/)).toBeInTheDocument();

    const img = (await screen.findByAltText('Receipt for Dinner')) as HTMLImageElement;
    expect(img.src).toBe('data:image/jpeg;base64,WFla');
  });

  it('closes on Escape', async () => {
    receipts = { e1: { expenseId: 'e1', mimeType: 'image/jpeg', byteSize: 4096, createdAt: 'x' } };
    render(<ExpenseItem expense={expense()} />);
    fireEvent.click(screen.getByRole('button', { name: /view the receipt/i }));
    await screen.findByAltText('Receipt for Dinner');

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says so plainly when the receipt has gone missing server-side', async () => {
    receipts = { e1: { expenseId: 'e1', mimeType: 'image/jpeg', byteSize: 4096, createdAt: 'x' } };
    loadReceipt.mockResolvedValueOnce(null);
    render(<ExpenseItem expense={expense()} />);
    fireEvent.click(screen.getByRole('button', { name: /view the receipt/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer stored/);
  });

  it('reports a failed fetch instead of an endless spinner', async () => {
    const warn = captureConsoleWarn();
    receipts = { e1: { expenseId: 'e1', mimeType: 'image/jpeg', byteSize: 4096, createdAt: 'x' } };
    loadReceipt.mockRejectedValueOnce(new Error('offline'));
    render(<ExpenseItem expense={expense()} />);
    fireEvent.click(screen.getByRole('button', { name: /view the receipt/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load this receipt/);
    // Logged as well as shown — the message the user gets is deliberately vague.
    expect(warn).toHaveBeenCalled();
  });
});
