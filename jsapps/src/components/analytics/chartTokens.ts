/**
 * Chart color tokens (Phase 6).
 *
 * These are Tailwind utility class names rather than hex values on purpose:
 * written as static strings they survive Tailwind's static extraction. Do NOT
 * build them dynamically (`bg-${hue}-600`) — that pattern silently produces no
 * CSS, and there is already one instance of the bug in `ExpenseItem.tsx`.
 *
 * ## Palette provenance — validated, not eyeballed
 *
 * Run against the white card surface (`#ffffff`) that these charts actually
 * render on, per the dataviz method:
 *
 *   validate_palette.js "#0d9488,#dc2626" --mode light --surface "#ffffff" --pairs all
 *     Lightness band .... PASS   Chroma floor ......... PASS
 *     CVD separation .... PASS   worst pair ΔE 13.1 (deutan), target ≥ 8
 *     Normal-vision ..... PASS   worst pair ΔE 31.4, floor ≥ 15
 *     Contrast vs surface PASS   both ≥ 3:1
 *
 * Two earlier candidates FAILED and were discarded:
 *
 * - **green-600 `#16a34a` ↔ red-600 `#dc2626`** — the app's existing text
 *   convention for balances — fails CVD separation at ΔE 5.0 (deutan), below
 *   even the 6.0 floor. It is the textbook red/green collision. Teal-600 is the
 *   brand accent, keeps the same "credit vs debt" reading, and clears the
 *   target at 13.1, so the *charts* use teal where the surrounding body text
 *   still uses green. Polarity is additionally carried by bar direction and by
 *   the sign on every printed value, so hue is never the only channel.
 * - **A teal ordinal ramp down to teal-400/300** — fails the light-end contrast
 *   floor on white (1.86:1 and 1.48:1 against a 2:1 floor). Not needed anyway:
 *   the magnitude charts are single-series, where bar length is the encoding
 *   and a per-bar ramp would be redundant. Hence one flat teal step below.
 *
 * If you add a series, re-run the validator — do not extend by eye.
 */

/** Single-series magnitude marks (spend). Length carries the value. */
export const SPEND_MARK = 'bg-teal-600';

/** Diverging poles for balances: owed to you (cool) vs you owe (warm). */
export const OWED_MARK = 'bg-teal-600';
export const OWE_MARK = 'bg-red-600';

/** Recessive chrome: unfilled bar track, gridlines, and the zero axis. */
export const TRACK = 'bg-gray-100';
export const GRIDLINE = 'bg-gray-200';
export const AXIS = 'bg-gray-300';

/**
 * Smallest rendered extent for a nonzero value, as a percentage.
 *
 * Without a floor, a $0.50 row beside a $900 row rounds to a zero-width bar and
 * reads as "nothing" rather than "a little".
 */
export const MIN_BAR_PERCENT = 1.5;

/** Bar extent as a percentage of `max`, with the nonzero floor applied. */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value === 0) return 0;
  return Math.max(MIN_BAR_PERCENT, (Math.abs(value) / max) * 100);
}
