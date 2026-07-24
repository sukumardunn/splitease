/**
 * Vitest global setup.
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
