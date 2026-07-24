import { vi, onTestFinished, type MockInstance } from 'vitest';

/**
 * Capture `console.warn` for a test that deliberately drives an error path.
 *
 * Keeps expected warnings out of the suite's stderr while still letting the
 * test assert that the warning was emitted — so the noise becomes coverage
 * instead of disappearing. Deliberately scoped per-test rather than silenced
 * globally: a blanket mock would also hide warnings we did NOT expect.
 *
 * Restores the original `console.warn` when the test finishes, pass or fail.
 */
export function captureConsoleWarn(): MockInstance<typeof console.warn> {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  onTestFinished(() => spy.mockRestore());
  return spy;
}
