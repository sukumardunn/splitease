import { ExpenseCategory } from '../types';

/**
 * Tailwind classes for the coloured icon chip that fronts every expense row.
 *
 * Written out as whole literal class names on purpose. Tailwind's extractor is a
 * static scanner over the source text: a class assembled at runtime — the
 * `` `bg-${hue}-100` `` this map replaced in `ExpenseItem.tsx` — never appears in
 * what it reads, so no rule is emitted and every chip rendered transparent. See
 * the header of `components/analytics/chartTokens.ts` for the same rule as it
 * applies to chart colours.
 *
 * Keyed as `Record<ExpenseCategory, …>` so the compiler, not review, enforces
 * coverage: add a member to the `ExpenseCategory` union in `types.ts` and this
 * file fails to typecheck until it gets a colour. That is what stops the bug
 * coming back through a category nobody thought to style.
 */
export interface CategoryColors {
  /** Chip background, e.g. `bg-blue-100`. */
  bg: string;
  /** Icon foreground, e.g. `text-blue-600`. */
  text: string;
}

/**
 * One hue per category, as the rows were always meant to render.
 *
 * The icon is the only thing on a row that names its category, so each
 * foreground has to clear the 3:1 non-text contrast floor against its own `-100`
 * chip. Every hue does at the `-600` step except **utilities**: yellow at that
 * step measures 2.74:1, so it is the single colour carried over one step darker,
 * at 4.58:1 — same hue, now legible.
 *
 * Do not name an unused class literally in these comments, incidentally: the
 * extractor reads comments too and will emit a rule for it.
 */
export const CATEGORY_COLORS: Record<ExpenseCategory, CategoryColors> = {
  groceries: { bg: 'bg-blue-100', text: 'text-blue-600' },
  rent: { bg: 'bg-purple-100', text: 'text-purple-600' },
  utilities: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  dining: { bg: 'bg-orange-100', text: 'text-orange-600' },
  entertainment: { bg: 'bg-pink-100', text: 'text-pink-600' },
  transportation: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  travel: { bg: 'bg-cyan-100', text: 'text-cyan-600' },
  shopping: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  services: { bg: 'bg-violet-100', text: 'text-violet-600' },
  settlement: { bg: 'bg-green-100', text: 'text-green-600' },
  other: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

/**
 * Chip classes for `category`, falling back to the `other` grey.
 *
 * The fallback is for runtime input the type system cannot vouch for: categories
 * arrive from Postgres and from CSV import, so a row written by an older or newer
 * client can carry a string outside the union. Grey chrome beats an unstyled
 * chip.
 */
export function getCategoryColors(category: ExpenseCategory): CategoryColors {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
}
