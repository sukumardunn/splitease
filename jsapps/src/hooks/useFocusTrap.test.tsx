/**
 * Phase 4b shipped the trap itself (see `ImportPrompt.test.tsx`); it moved focus
 * into the dialog but never gave it back, so closing dropped focus on `<body>`
 * and the next Tab restarted from the top of the document. The consumers' own
 * tests cover the trap through their UI; this file drives the hook directly,
 * because the interesting cases are the ones no modal exposes as a prop — a
 * trigger deleted while the dialog is open, and the two different ways consumers
 * unmount (the hook dying with the dialog, or outliving it).
 */
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

/** Stands in for a modal that is mounted only while it is open. */
function Dialog() {
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>();
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Dialog"
      onKeyDown={onKeyDown}
    >
      <button type="button">Close</button>
      <input aria-label="Name" />
      <button type="button">Save</button>
    </div>
  );
}

/** The `if (!isOpen) return null` shape: hook mounted, container conditional. */
function AlwaysMountedDialog({ open }: { open: boolean }) {
  const { containerRef, onKeyDown } = useFocusTrap<HTMLDivElement>();
  if (!open) return null;
  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Dialog"
      onKeyDown={onKeyDown}
    >
      <button type="button">Close</button>
      <input aria-label="Name" />
      <button type="button">Save</button>
    </div>
  );
}

interface HarnessProps {
  open: boolean;
  /** `false` drops the trigger from the tree, as deleting an expense row would. */
  withTrigger?: boolean;
  /**
   * `true` unmounts the hook with the dialog, like `AddExpenseModal` and
   * `ImportPrompt`; `false` keeps it mounted while closed, like `AddFriendModal`
   * and `CsvImportModal`. Focus has to come back either way.
   */
  unmountWhenClosed?: boolean;
}

function Harness({ open, withTrigger = true, unmountWhenClosed = true }: HarnessProps) {
  return (
    <div>
      {withTrigger && <button type="button">Edit &quot;Dinner&quot;</button>}
      <button type="button">Elsewhere</button>
      {unmountWhenClosed ? open && <Dialog /> : <AlwaysMountedDialog open={open} />}
    </div>
  );
}

const trigger = () => screen.getByRole('button', { name: 'Edit "Dinner"' });
const closeButton = () => screen.getByRole('button', { name: 'Close' });

describe('useFocusTrap initial focus', () => {
  it('moves focus to the first focusable element in the dialog', () => {
    render(<Harness open />);
    expect(closeButton()).toHaveFocus();
  });

  it('takes focus when the dialog opens after the hook has already mounted', () => {
    // For the modals that render `null` while closed, "on mount" is not the same
    // moment as "on open".
    const view = render(<Harness open={false} unmountWhenClosed={false} />);
    trigger().focus();
    view.rerender(<Harness open unmountWhenClosed={false} />);
    expect(closeButton()).toHaveFocus();
  });

  it('does not re-take focus on a later re-render', () => {
    // Typing in the form re-renders the modal; focus must stay where the user
    // put it instead of snapping back to the first control.
    const view = render(<Harness open />);
    screen.getByLabelText('Name').focus();
    view.rerender(<Harness open />);
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });
});

describe('useFocusTrap focus restoration', () => {
  it('returns focus to the trigger when the dialog unmounts', () => {
    const view = render(<Harness open={false} />);
    trigger().focus();
    view.rerender(<Harness open />);
    expect(closeButton()).toHaveFocus();

    view.rerender(<Harness open={false} />);
    expect(trigger()).toHaveFocus();
  });

  it('returns focus to the trigger when the dialog closes but the hook stays mounted', () => {
    const view = render(<Harness open={false} unmountWhenClosed={false} />);
    trigger().focus();
    view.rerender(<Harness open unmountWhenClosed={false} />);
    // Asserted so this cannot pass by focus never having left the trigger.
    expect(closeButton()).toHaveFocus();

    view.rerender(<Harness open={false} unmountWhenClosed={false} />);
    expect(trigger()).toHaveFocus();
  });

  it('returns focus to the trigger when the whole tree unmounts', () => {
    // A route change tears the page down while the dialog is open. The trigger
    // lives outside the React root here so it survives the unmount, the way a
    // persistent chrome element (navbar button) would.
    const external = document.createElement('button');
    external.textContent = 'Outside trigger';
    document.body.appendChild(external);
    external.focus();

    const view = render(<Dialog />);
    expect(closeButton()).toHaveFocus();
    view.unmount();

    expect(external).toHaveFocus();
    external.remove();
  });

  it('does not throw and leaves focus on the body when the trigger was removed first', () => {
    // Deleting the expense from inside its own edit dialog detaches the edit
    // button that opened it; `focus()` on a detached node is a silent no-op.
    const view = render(<Harness open={false} />);
    trigger().focus();
    view.rerender(<Harness open />);
    view.rerender(<Harness open withTrigger={false} />);

    expect(() => view.rerender(<Harness open={false} withTrigger={false} />)).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('does not throw when nothing had focus before the dialog opened', () => {
    const view = render(<Harness open={false} />);
    expect(document.activeElement).toBe(document.body);
    view.rerender(<Harness open />);

    expect(() => view.rerender(<Harness open={false} />)).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves focus alone when the user has already moved it outside the dialog', () => {
    // Clicking a nav link both closes the dialog and takes focus; dragging focus
    // back to the trigger would undo the user's own navigation.
    const view = render(<Harness open={false} />);
    trigger().focus();
    view.rerender(<Harness open />);

    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    view.rerender(<Harness open={false} />);
    expect(elsewhere).toHaveFocus();
  });

  it('does not restore to a trigger that has since been disabled', () => {
    const view = render(<Harness open={false} />);
    trigger().focus();
    view.rerender(<Harness open />);
    trigger().setAttribute('disabled', '');

    view.rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('useFocusTrap still traps Tab', () => {
  it('wraps from the last control back to the first', () => {
    render(<Harness open />);
    screen.getByRole('button', { name: 'Save' }).focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(closeButton()).toHaveFocus();
  });

  it('wraps backwards from the first control to the last', () => {
    render(<Harness open />);
    closeButton().focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  });
});
