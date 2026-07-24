import React, { useEffect, useRef } from 'react';
import { DownloadCloud, Loader2 } from 'lucide-react';

interface ImportPromptProps {
  busy: boolean;
  onImport: () => void;
  onDismiss: () => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** One-time offer to migrate pre-4a localStorage data into the user's account. */
const ImportPrompt: React.FC<ImportPromptProps> = ({ busy, onImport, onDismiss }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on open. Without this, focus stays on whatever
  // was behind the overlay, so a keyboard or screen-reader user has no idea a
  // modal appeared and can still tab through the obscured page.
  useEffect(() => {
    importButtonRef.current?.focus();
  }, []);

  /**
   * Keep Tab inside the dialog, and let Escape dismiss it.
   *
   * `aria-modal` tells assistive tech the rest of the page is inert but does not
   * actually stop Tab from leaving, so the trap has to be explicit.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (!busy) onDismiss();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    // Wrap around at both ends; also pull focus back if it somehow escaped.
    if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-prompt-title"
        aria-describedby="import-prompt-description"
        onKeyDown={handleKeyDown}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
      >
        <div className="flex items-center mb-3">
          <DownloadCloud aria-hidden="true" className="h-6 w-6 text-teal-500 mr-2" />
          <h2 id="import-prompt-title" className="text-lg font-semibold text-gray-800">
            Import your existing data?
          </h2>
        </div>
        <p id="import-prompt-description" className="text-sm text-gray-600 mb-6">
          We found SplitEase data saved on this device from before you had an account.
          Import it now to keep your expenses, groups, and settlements. This is a
          one-time offer.
        </p>
        <div className="flex gap-3">
          <button
            ref={importButtonRef}
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onImport}
            className="flex-1 flex items-center justify-center bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg"
          >
            {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin mr-2" />}
            Import
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded-lg"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPrompt;
