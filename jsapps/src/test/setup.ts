/**
 * Vitest global setup.
 *
 * Two environment gaps are patched here: jsdom's Web Storage (below) and
 * `Blob.prototype.text` (at the bottom).
 *
 * ## Web Storage
 *
 * Re-attaches jsdom's Web Storage to `globalThis` so the suite runs on any
 * Node version.
 *
 * Why this is needed: vitest's jsdom environment copies keys from the jsdom
 * window onto `globalThis`, but skips any key that already exists there unless
 * it is in vitest's own allow-list — and `localStorage` is not in that list.
 * Node >= 22 ships an experimental Web Storage global, so on newer Node
 * `'localStorage' in globalThis` is already true and jsdom's real Storage gets
 * dropped. Node's own global is inert without `--localstorage-file`, so
 * `localStorage` ends up `undefined` and every test touching it throws
 * `Cannot read properties of undefined`.
 *
 * vitest sets `globalThis.jsdom` to the JSDOM instance, so we can reach past
 * the key-copying and bind the real Storage objects directly.
 */
import '@testing-library/jest-dom/vitest';

interface JsdomHandle {
  window: {
    localStorage: Storage;
    sessionStorage: Storage;
  };
}

const jsdom = (globalThis as typeof globalThis & { jsdom?: JsdomHandle }).jsdom;

if (jsdom) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    const storage = jsdom.window[key];
    if (!storage) continue;
    // Assign unconditionally — jsdom's Storage is the authoritative one on every
    // Node version, and on newer Node merely *reading* `globalThis.localStorage`
    // fires an ExperimentalWarning, so we must not compare against it first.
    Object.defineProperty(globalThis, key, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

/**
 * `Blob.prototype.text()` — part of the File API since 2019 and available in
 * every browser this app targets, but still unimplemented by jsdom 25
 * (jsdom/jsdom#2555). Without it, any component that reads an uploaded file
 * (`CsvImportModal`) fails in tests for a reason that has nothing to do with the
 * code under test.
 *
 * Implemented over `FileReader`, which jsdom does provide, rather than reshaping
 * the app to avoid the standard API.
 */
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
      reader.readAsText(this);
    });
  };
}
