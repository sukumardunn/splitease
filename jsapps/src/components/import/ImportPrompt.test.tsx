/**
 * Phase 4b: the dialog claimed `aria-modal` but didn't actually contain focus.
 * `aria-modal` only tells assistive tech the background is inert — it does not
 * stop Tab from walking out into the obscured page — so the trap is explicit
 * and needs explicit tests.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportPrompt from './ImportPrompt';

const onImport = vi.fn();
const onDismiss = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(busy = false) {
  return render(<ImportPrompt busy={busy} onImport={onImport} onDismiss={onDismiss} />);
}

describe('ImportPrompt accessibility', () => {
  it('is a labelled, described modal dialog', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Import your existing data/i);
    expect(dialog).toHaveAccessibleDescription(/found SplitEase data saved on this device/i);
  });

  it('moves focus into the dialog on open', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus();
  });

  it('wraps Tab from the last control back to the first', () => {
    setup();
    const importButton = screen.getByRole('button', { name: 'Import' });
    const dismissButton = screen.getByRole('button', { name: 'Not now' });

    dismissButton.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(importButton).toHaveFocus();
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    setup();
    const importButton = screen.getByRole('button', { name: 'Import' });
    const dismissButton = screen.getByRole('button', { name: 'Not now' });

    importButton.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(dismissButton).toHaveFocus();
  });

  it('dismisses on Escape', () => {
    setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while an import is in flight', () => {
    // Dismissing mid-import would hide the dialog while the write continues.
    setup(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('marks the import button busy while importing', () => {
    setup(true);
    const importButton = screen.getByRole('button', { name: /Import/ });
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAttribute('aria-busy', 'true');
  });
});

describe('ImportPrompt actions', () => {
  it('imports on confirm', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('dismisses on "Not now"', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
