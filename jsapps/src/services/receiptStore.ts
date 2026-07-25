/**
 * Persistence for receipt images, which live in Postgres (`expense_receipts`,
 * migration 20260725000005) rather than in a Storage bucket.
 *
 * Deliberately a separate module from `supabaseStore.ts`: everything there is
 * loaded on startup, and the one rule receipts have to obey is that **image
 * bytes are never part of the startup load**. Keeping the two apart makes that
 * visible — `fetchReceiptIndex` selects the metadata columns explicitly and
 * `data_base64` appears in exactly one query in the app, `fetchReceipt`, which
 * runs when a user opens a receipt.
 *
 * RLS does the isolation, as everywhere else: the `expense_receipts_own` policy
 * requires `owner_id = auth.uid()` *and* that the parent expense is the caller's.
 */
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import type { EncodedReceipt } from './receiptImage';

type ReceiptRow = Database['public']['Tables']['expense_receipts']['Row'];
/** The metadata subset — everything except the payload. */
type ReceiptMetaRow = Omit<ReceiptRow, 'data_base64' | 'owner_id'>;

/** Enough to know a receipt exists and how big it is. No bytes. */
export interface ReceiptMeta {
  expenseId: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

/** Metadata plus the payload, base64 without a `data:` prefix. */
export interface Receipt extends ReceiptMeta {
  dataBase64: string;
}

/** By expense id — how the UI asks "does this row have a receipt?". */
export type ReceiptIndex = Record<string, ReceiptMeta>;

const META_COLUMNS = 'expense_id, mime_type, byte_size, created_at';

export function receiptMetaFromRow(row: ReceiptMetaRow): ReceiptMeta {
  return {
    expenseId: row.expense_id,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

/**
 * Which of the user's expenses have a receipt, and how big each one is.
 *
 * Safe to run alongside the startup fetch — it is metadata only, a few dozen
 * bytes a row. Selecting `*` here would defeat the entire point of the design.
 */
export async function fetchReceiptIndex(): Promise<ReceiptIndex> {
  const { data, error } = await supabase.from('expense_receipts').select(META_COLUMNS);
  if (error) fail('fetch receipts', error.message);
  const index: ReceiptIndex = {};
  for (const row of data ?? []) {
    const meta = receiptMetaFromRow(row);
    index[meta.expenseId] = meta;
  }
  return index;
}

/** The one query that reads image bytes. Null when there is no receipt. */
export async function fetchReceipt(expenseId: string): Promise<Receipt | null> {
  const { data, error } = await supabase
    .from('expense_receipts')
    .select('*')
    .eq('expense_id', expenseId)
    .maybeSingle();
  if (error) fail('fetch receipt', error.message);
  if (!data) return null;
  return { ...receiptMetaFromRow(data), dataBase64: data.data_base64 };
}

/**
 * Attach or replace an expense's receipt.
 *
 * An upsert on the primary key, because one expense has at most one receipt and
 * the UI replaces rather than appends. `byte_size` is checked client-side too,
 * but the value sent here is what the server's own CHECK constrains — so a
 * mismatch surfaces as a 23514 error rather than an oversized row.
 */
export async function upsertReceipt(
  ownerId: string,
  expenseId: string,
  encoded: EncodedReceipt
): Promise<ReceiptMeta> {
  const { data, error } = await supabase
    .from('expense_receipts')
    .upsert(
      {
        expense_id: expenseId,
        owner_id: ownerId,
        mime_type: encoded.mimeType,
        byte_size: encoded.byteSize,
        data_base64: encoded.dataBase64,
      },
      { onConflict: 'expense_id' }
    )
    .select(META_COLUMNS)
    .single();
  if (error) fail('save receipt', error.message);
  if (!data) fail('save receipt', 'no rows affected — not permitted by row-level security');
  return receiptMetaFromRow(data);
}

/**
 * Detach a receipt. Deleting nothing is a success: the caller's intent ("this
 * expense should have no receipt") is satisfied either way, and the UI's own
 * index can legitimately be a moment out of date.
 */
export async function deleteReceipt(expenseId: string): Promise<void> {
  const { error } = await supabase.from('expense_receipts').delete().eq('expense_id', expenseId);
  if (error) fail('remove receipt', error.message);
}
