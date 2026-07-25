import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, getCategoryColors } from './categoryColors';
import { ExpenseCategory } from '../types';

/**
 * Every member of the union, listed once at runtime so the assertions below can
 * iterate. The `satisfies`/assignment pair on ALL_CATEGORIES is what makes this
 * list trustworthy: if a category is added to the union and not added here, the
 * `EXHAUSTIVE` assignment fails to compile, so the coverage test cannot silently
 * stop covering it.
 */
const ALL_CATEGORIES = [
  'groceries',
  'rent',
  'utilities',
  'dining',
  'entertainment',
  'transportation',
  'travel',
  'shopping',
  'services',
  'settlement',
  'other',
] as const satisfies readonly ExpenseCategory[];

// Compile-time guard: fails if the union grows a member missing from the list above.
const EXHAUSTIVE: (typeof ALL_CATEGORIES)[number] = null as unknown as ExpenseCategory;
void EXHAUSTIVE;

describe('CATEGORY_COLORS', () => {
  it('covers every expense category', () => {
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('holds only static literal classes Tailwind can extract', () => {
    // The whole point of the map: a template hole here would emit no CSS.
    for (const category of ALL_CATEGORIES) {
      const { bg, text } = CATEGORY_COLORS[category];
      for (const className of [bg, text]) {
        expect(className).not.toContain('${');
        expect(className).not.toContain('`');
        expect(className).toMatch(/^(bg|text)-[a-z]+-\d{2,3}$/);
      }
    }
  });

  it('pairs a bg- background with a text- foreground per category', () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_COLORS[category].bg.startsWith('bg-')).toBe(true);
      expect(CATEGORY_COLORS[category].text.startsWith('text-')).toBe(true);
    }
  });

  it('gives each category a distinguishable hue', () => {
    const hues = ALL_CATEGORIES.map((c) => CATEGORY_COLORS[c].bg);
    expect(new Set(hues).size).toBe(ALL_CATEGORIES.length);
  });
});

describe('getCategoryColors', () => {
  it('returns the mapped classes for a known category', () => {
    expect(getCategoryColors('dining')).toEqual({
      bg: 'bg-orange-100',
      text: 'text-orange-600',
    });
  });

  it('falls back to the other/grey chip for a category outside the union', () => {
    // Categories arrive from Postgres and CSV import, so unknown strings are
    // reachable at runtime even though the signature forbids them.
    const rogue = 'crypto-jpegs' as ExpenseCategory;
    expect(getCategoryColors(rogue)).toEqual(CATEGORY_COLORS.other);
  });
});
