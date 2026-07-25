import React, { useState } from 'react';
import { Paperclip, Trash2, RotateCcw } from 'lucide-react';
import {
  EncodedReceipt,
  RECEIPT_MAX_BYTES,
  formatBytes,
  prepareReceipt,
  receiptDataUrl,
} from '../../services/receiptImage';
import type { ReceiptMeta } from '../../services/receiptStore';

interface ReceiptFieldProps {
  /** Metadata for the receipt already stored against this expense, if any. */
  existing?: ReceiptMeta;
  /** A newly picked image, downscaled and encoded, not yet written. */
  staged: EncodedReceipt | null;
  /** Whether the user has asked for the stored receipt to be detached on save. */
  removed: boolean;
  onStage: (receipt: EncodedReceipt | null) => void;
  onRemovedChange: (removed: boolean) => void;
}

/**
 * The attach / replace / remove control for an expense's receipt.
 *
 * Fully controlled by the form so that **nothing is written until the form is
 * submitted** — picking an image and then hitting Cancel must leave the stored
 * receipt exactly as it was. What this component owns is only the part that has
 * to happen at pick time: downscaling and encoding, which is where a file gets
 * rejected, and which needs a busy state and an error line of its own.
 *
 * Sizes shown here are the real thing — the byte count of the JPEG that will be
 * stored, not of the file the user picked.
 */
const ReceiptField: React.FC<ReceiptFieldProps> = ({
  existing,
  staged,
  removed,
  onStage,
  onRemovedChange,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showsExisting = !!existing && !removed && !staged;
  const hasSomething = !!staged || showsExisting;

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const encoded = await prepareReceipt(file);
      onStage(encoded);
      // Picking a replacement supersedes a pending removal.
      onRemovedChange(false);
    } catch (err) {
      // `prepareReceipt` throws messages that are already worded for a user.
      setError(err instanceof Error ? err.message : 'That image could not be used.');
      onStage(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="block text-sm font-medium text-gray-700 mb-2">Receipt (optional)</span>

      <div className="flex items-start gap-3">
        {staged && (
          <img
            src={receiptDataUrl(staged.mimeType, staged.dataBase64)}
            alt="Receipt preview"
            className="h-20 w-20 rounded-lg object-cover border border-gray-200"
          />
        )}

        <div className="flex-1 min-w-0">
          <label
            htmlFor="expense-receipt"
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 cursor-pointer hover:bg-gray-50"
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            {hasSomething ? 'Replace photo' : 'Attach a photo'}
          </label>
          <input
            id="expense-receipt"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear the input so re-picking the same file still fires a change.
              e.target.value = '';
              if (file) void handleFile(file);
            }}
          />

          <p className="mt-1 text-xs text-gray-500">
            {busy
              ? 'Resizing…'
              : staged
                ? `Ready to save — ${formatBytes(staged.byteSize)} (${staged.width} × ${staged.height})`
                : showsExisting
                  ? `Attached — ${formatBytes(existing.byteSize)}`
                  : removed && existing
                    ? 'Will be removed when you save.'
                    : `Stored in the database, downscaled to fit ${formatBytes(RECEIPT_MAX_BYTES)}.`}
          </p>

          {error && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>

        {staged && (
          <button
            type="button"
            onClick={() => {
              onStage(null);
              setError(null);
            }}
            aria-label="Discard the new receipt photo"
            className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}

        {showsExisting && (
          <button
            type="button"
            onClick={() => onRemovedChange(true)}
            aria-label="Remove the attached receipt"
            className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        {removed && existing && !staged && (
          <button
            type="button"
            onClick={() => onRemovedChange(false)}
            className="flex-shrink-0 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Keep it
          </button>
        )}
      </div>
    </div>
  );
};

export default ReceiptField;
