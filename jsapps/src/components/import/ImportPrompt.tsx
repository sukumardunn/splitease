import React from 'react';
import { DownloadCloud, Loader2 } from 'lucide-react';

interface ImportPromptProps {
  busy: boolean;
  onImport: () => void;
  onDismiss: () => void;
}

/** One-time offer to migrate pre-4a localStorage data into the user's account. */
const ImportPrompt: React.FC<ImportPromptProps> = ({ busy, onImport, onDismiss }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div role="dialog" aria-modal="true" className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
      <div className="flex items-center mb-3">
        <DownloadCloud className="h-6 w-6 text-teal-500 mr-2" />
        <h2 className="text-lg font-semibold text-gray-800">Import your existing data?</h2>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        We found SplitEase data saved on this device from before you had an account.
        Import it now to keep your expenses, groups, and settlements. This is a
        one-time offer.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onImport}
          className="flex-1 flex items-center justify-center bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
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

export default ImportPrompt;
