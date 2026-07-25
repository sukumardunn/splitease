import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
 */
export function useFocusTrap<T extends HTMLElement>(
  options: FocusTrapOptions = {}
): FocusTrap<T> {
  const { onEscape, locked = false } = options;
  const containerRef = useRef<T>(null);

  // Read the latest callback from a ref so the mount effect below doesn't
  // re-run (and steal focus back) whenever the parent re-renders.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    const focusable = containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusable?.[0]?.focus();
  }, []);

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
