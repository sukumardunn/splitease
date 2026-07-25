import { describe, expect, it } from 'vitest';
import { generateAvatar, initialsOf } from './avatar';

describe('initialsOf', () => {
  it('takes first and last initials of a multi-word name', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('Mary Jane Watson')).toBe('MW');
  });

  it('takes two letters from a single-word name', () => {
    expect(initialsOf('Ada')).toBe('AD');
  });

  it('handles a single character', () => {
    expect(initialsOf('A')).toBe('A');
  });

  it('collapses extra whitespace', () => {
    expect(initialsOf('  Ada   Lovelace  ')).toBe('AL');
  });

  it('falls back to ? for an empty name', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('generateAvatar', () => {
  it('produces an inline SVG data URI, with no external request', () => {
    const uri = generateAvatar('Ada Lovelace');
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(uri).not.toMatch(/https?:\/\//);
  });

  it('embeds the initials', () => {
    expect(decodeURIComponent(generateAvatar('Ada Lovelace'))).toContain('>AL<');
  });

  it('is deterministic for the same name', () => {
    expect(generateAvatar('Ada Lovelace')).toBe(generateAvatar('Ada Lovelace'));
  });

  it('ignores case and surrounding space when picking a colour', () => {
    const a = decodeURIComponent(generateAvatar('Ada Lovelace'));
    const b = decodeURIComponent(generateAvatar('  ada lovelace  '));
    const fill = (svg: string) => svg.match(/fill="(#[0-9a-f]{6})"/i)?.[1];
    expect(fill(a)).toBe(fill(b));
  });

  it('gives different names different colours (at least sometimes)', () => {
    const fill = (name: string) =>
      decodeURIComponent(generateAvatar(name)).match(/fill="(#[0-9a-f]{6})"/i)?.[1];
    const colours = new Set(
      ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Barbara', 'Edsger', 'Donald'].map(fill)
    );
    expect(colours.size).toBeGreaterThan(1);
  });

  it('escapes XML-significant characters instead of breaking the SVG', () => {
    // A name like `<script>` must not be able to inject markup into the SVG.
    const decoded = decodeURIComponent(generateAvatar('<script> &"\''));
    expect(decoded).not.toContain('<script>');
    expect(decoded).toContain('&lt;');
  });

  it('still yields a usable avatar for an empty name', () => {
    expect(decodeURIComponent(generateAvatar(''))).toContain('>?<');
  });
});
