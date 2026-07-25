import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { formatBytes, receiptDataUrl } from '../../services/receiptImage';
import type { ReceiptMeta } from '../../services/receiptStore';

interface ReceiptViewerProps {
  isOpen: boolean;
  onClose: () => void;
  expenseId: string;
  description: string;
  /** Known from the receipt index, so the size can be shown before the bytes land. */
  meta: ReceiptMeta;
}

/**
 * Full-size view of one receipt.
 *
 * This is where the image bytes are actually read: `loadReceipt` runs on open, so
 * an account with fifty receipts still loads the app with zero of them. The
 * component is only mounted while open (`ExpenseItem` renders it conditionally),
 * which is also what lets `useFocusTrap` take initial focus.
 */
const ReceiptViewer: React.FC<ReceiptViewerProps> = ({
  isOpen,
  onClose,
  expenseId,
  description,
  meta,
}) => {
  const { loadReceipt } = useAppContext();
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read through a ref: `loadReceipt` is a fresh closure on every provider
  // render, and depending on it would refetch the image whenever any unrelated
  // app state changed. Same reason `useFocusTrap` holds its callbacks in refs.
  const loadRef = useRef(loadReceipt);
  loadRef.current = loadReceipt;

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setError(null);
    setDataUrl(null);
    loadRef
      .current(expenseId)
      .then((receipt) => {
        if (cancelled) return;
        if (!receipt) {
          setError('This receipt is no longer stored.');
          return;
        }
        setDataUrl(receiptDataUrl(receipt.mimeType, receipt.dataBase64));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('SplitEase: could not load a receipt', err);
        setError("Couldn't load this receipt. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, expenseId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        ref={containerRef}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-viewer-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-start">
          <div className="min-w-0">
            <h2 id="receipt-viewer-title" className="text-lg font-bold text-gray-800 truncate">
              Receipt — {description}
            </h2>
            <p className="text-xs text-gray-500">
              {formatBytes(meta.byteSize)} · stored in the database
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-3 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : dataUrl ? (
            <img
              src={dataUrl}
              alt={`Receipt for ${description}`}
              className="w-full rounded-lg border border-gray-200"
            />
          ) : (
            <p className="text-sm text-gray-500">Loading the image…</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptViewer;
