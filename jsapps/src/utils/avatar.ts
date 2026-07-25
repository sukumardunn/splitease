/**
 * Deterministic initials avatar as an inline SVG data URI.
 *
 * The schema defaults `friends.avatar` to '', and the UI renders it straight into
 * `<img src>` in ~15 places, so a friend created without one shows a broken-image
 * icon. Generating a data URI keeps that fix local to friend creation: no new
 * dependency, no external avatar service (which would be a network dependency and
 * would leak names to a third party), and it renders offline.
 */

/** Muted palette that reads against white cards in both light and dark themes. */
const COLORS = [
  '#0f766e', // teal-700
  '#4338ca', // indigo-700
  '#b45309', // amber-700
  '#be123c', // rose-700
  '#15803d', // green-700
  '#7e22ce', // purple-700
  '#0369a1', // sky-700
  '#c2410c', // orange-700
];

/** Up to two initials from a display name; falls back to '?' for empty input. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Stable index into COLORS, so the same name always gets the same colour. */
function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return COLORS[hash % COLORS.length];
}

/** Escape the few characters that would break out of an SVG text node. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build an avatar for `name`. Returns a `data:image/svg+xml` URI suitable for
 * storing in `friends.avatar` and rendering with `<img src>`.
 */
export function generateAvatar(name: string): string {
  const initials = escapeXml(initialsOf(name));
  const background = colorFor(name.trim().toLowerCase() || '?');
  // encodeURIComponent rather than base64: no btoa/Unicode pitfalls, and it stays
  // human-readable in the database.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="${background}"/>` +
    `<text x="32" y="32" fill="#fff" font-family="system-ui,sans-serif" font-size="26"` +
    ` font-weight="600" text-anchor="middle" dominant-baseline="central">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
