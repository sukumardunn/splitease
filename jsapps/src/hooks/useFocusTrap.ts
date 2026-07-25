import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject,
} from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hand focus back to the element that opened the dialog, then forget it.
 *
 * Restoring is best-effort by necessity: the trigger is remembered as a live DOM
 * node, and by the time the dialog closes that node may be gone or no longer
 * willing to take focus. An expense row is the motivating case — its edit button
 * opens the dialog, and deleting the expense from inside the dialog (or a refresh
 * that re-renders the list) detaches that button. `focus()` on a detached or
 * disabled node is a silent no-op that leaves focus on `<body>`, i.e. exactly the
 * bug this restore exists to fix, so the guards below bail out rather than
 * pretend. `<body>` is then no worse than what shipped before.
 *
 * The `trapped` container is passed in so we can tell "focus is still where the
 * dialog left it" from "the user has moved on". If focus now sits on some third
 * element — a sidebar link they clicked to navigate away, which is what closed
 * the dialog in the first place — yanking it back to a stale trigger would fight
 * the user, so we leave it alone. Focus on `<body>`/nothing is the common case:
 * the dialog's own focused node has just been removed from the document.
 */
function handBackFocus(
  triggerRef: MutableRefObject<HTMLElement | null>,
  trappedRef: MutableRefObject<HTMLElement | null>
) {
  const trigger = triggerRef.current;
  const trapped = trappedRef.current;
  // Cleared up front: whether or not the restore lands, this open instance is
  // over, and a stale node held here would leak and could be focused later.
  triggerRef.current = null;
  trappedRef.current = null;

  if (!trigger || !trigger.isConnected) return;
  if (trigger.hasAttribute('disabled') || trigger.getAttribute('aria-hidden') === 'true') return;

  const active = document.activeElement;
  const focusIsStillOurs =
    active === null || active === document.body || !!trapped?.contains(active);
  if (!focusIsStillOurs) return;

  trigger.focus();
}

interface FocusTrapOptions {
  /** Called on Escape. Omit to ignore Escape. */
  onEscape?: () => void;
  /** When true, Escape is ignored (e.g. a write is in flight). */
  locked?: boolean;
}

interface FocusTrap<T extends HTMLElement> {
  /** Attach to the dialog container. */
  containerRef: RefObject<T>;
  /** Attach to the container's `onKeyDown`. */
  onKeyDown: (event: KeyboardEvent<T>) => void;
}

/**
 * Keep keyboard focus inside a modal dialog, and optionally close it on Escape.
 *
 * `aria-modal="true"` only tells assistive tech that the rest of the page is
 * inert — it does not stop Tab from walking out into the obscured content, so the
 * trap has to be implemented explicitly. Focus moves to the first focusable
 * element on mount, since leaving it on whatever sat behind the overlay gives a
 * keyboard or screen-reader user no indication that a dialog opened.
 *
 * Focus is then returned to whatever opened the dialog when it closes. Without
 * that, closing drops focus on `<body>` and the next Tab restarts from the top of
 * the document — brutal on the expense list, where the edit button that opened the
 * dialog can be hundreds of rows down.
 */
export function useFocusTrap<T extends HTMLElement>(
  options: FocusTrapOptions = {}
): FocusTrap<T> {
  const { onEscape, locked = false } = options;
  const containerRef = useRef<T>(null);

  // Read the latest callback from a ref so neither of the effects below has to
  // list it as a dependency and re-run (stealing focus back) whenever the parent
  // re-renders.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  // What had focus when the dialog appeared, and the container we trapped. The
  // container is remembered separately from `containerRef` because React nulls a
  // ref out as it unmounts the element, and the restore path still needs to know
  // where focus was legitimately allowed to sit.
  const triggerRef = useRef<HTMLElement | null>(null);
  const trappedRef = useRef<HTMLElement | null>(null);

  // Deliberately no dependency list: this has to notice the dialog appearing
  // *and* disappearing, and the only signal for either is whether the container
  // ref is attached. Consumers are split on how they mount — `AddExpenseModal`
  // and `ImportPrompt` mount the hook only while the dialog is open, while
  // `AddFriendModal` and `CsvImportModal` keep it mounted permanently and render
  // `null` when closed — and the hook must work for both without its callers
  // having to say which they are (an `isOpen` option would change the API).
  //
  // `trappedRef` is what makes running on every commit safe, and it is the same
  // invariant the old `[]` dependency list bought: focus is taken exactly once
  // per open, so a re-render mid-dialog (a keystroke in the amount field, a
  // parent re-render) can neither yank focus back to the first control nor
  // overwrite the remembered trigger with something inside the dialog. That is
  // also why `escapeRef`/`lockedRef` above exist — keep both patterns.
  useEffect(() => {
    const container = containerRef.current;

    if (container && !trappedRef.current) {
      trappedRef.current = container;
      // Read before moving focus, or we would record the dialog's own first
      // control. `<body>` is what `activeElement` reports when nothing is
      // focused, and it is not something to return to.
      const active = document.activeElement;
      triggerRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      container.querySelectorAll<HTMLElement>(FOCUSABLE)[0]?.focus();
      return;
    }

    // The dialog closed but the hook is still mounted (the `isOpen && null`
    // consumers). The container is already detached by the time this runs, so
    // focus has landed on `<body>` — put it back.
    if (!container && trappedRef.current) handBackFocus(triggerRef, trappedRef);
  });

  // The unmount case, which the effect above cannot cover: no further render
  // happens, so nothing re-reads the container ref. Covers a dialog that closes
  // by unmounting, and a route change or a parent list dropping the row that
  // owned the dialog — where the trigger is usually gone too, and `handBackFocus`
  // declines rather than throwing.
  useEffect(() => () => handBackFocus(triggerRef, trappedRef), []);

  const onKeyDown = (event: KeyboardEvent<T>) => {
    if (event.key === 'Escape') {
      if (!lockedRef.current) escapeRef.current?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const container = containerRef.current;
    const focusable = Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const escaped = !container?.contains(active);

    // Wrap at both ends, and pull focus back if it somehow got outside.
    if (event.shiftKey && (active === first || escaped)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || escaped)) {
      event.preventDefault();
      first.focus();
    }
  };

  return { containerRef, onKeyDown };
}
