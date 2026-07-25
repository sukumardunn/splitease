import { describe, expect, it, beforeEach } from 'vitest';
import {
  isActivityAction,
  isActivityEntityType,
  isExpenseCategory,
  resetValidationWarnings,
  toActivityAction,
  toActivityEntityType,
  toExpenseCategory,
  isSplitMode,
  toSplitMode,
} from './dbValidation';
import { captureConsoleWarn } from '../test/console';

beforeEach(() => {
  resetValidationWarnings();
});

describe('isExpenseCategory', () => {
  it('accepts every real category', () => {
    for (const c of ['groceries', 'rent', 'dining', 'other', 'settlement']) {
      expect(isExpenseCategory(c)).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(isExpenseCategory('crypto')).toBe(false);
    expect(isExpenseCategory('')).toBe(false);
  });

  it('rejects inherited Object properties', () => {
    // A bare `value in table` check would accept these, letting a DB value of
    // "constructor" pass as a valid category.
    expect(isExpenseCategory('constructor')).toBe(false);
    expect(isExpenseCategory('toString')).toBe(false);
    expect(isExpenseCategory('__proto__')).toBe(false);
  });
});

describe('toExpenseCategory', () => {
  it('passes through a valid category without warning', () => {
    const warn = captureConsoleWarn();
    expect(toExpenseCategory('dining')).toBe('dining');
    expect(warn).not.toHaveBeenCalled();
  });

  it('degrades an unknown category to "other" and warns', () => {
    const warn = captureConsoleWarn();
    expect(toExpenseCategory('crypto')).toBe('other');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('crypto'));
  });

  it('warns only once per distinct bad value', () => {
    const warn = captureConsoleWarn();
    toExpenseCategory('crypto');
    toExpenseCategory('crypto');
    toExpenseCategory('crypto');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns separately for a different bad value', () => {
    const warn = captureConsoleWarn();
    toExpenseCategory('crypto');
    toExpenseCategory('nft');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('toActivityAction', () => {
  it('passes through real actions', () => {
    expect(toActivityAction('expense.create')).toBe('expense.create');
    expect(toActivityAction('friend.add')).toBe('friend.add');
  });

  it('degrades an unrecognized action to "unknown" and warns', () => {
    const warn = captureConsoleWarn();
    expect(toActivityAction('expense.teleport')).toBe('unknown');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expense.teleport'));
  });

  it('treats a literal "unknown" from the DB as unknown', () => {
    expect(isActivityAction('unknown')).toBe(true);
    expect(toActivityAction('unknown')).toBe('unknown');
  });
});

describe('toActivityEntityType', () => {
  it('passes through real entity types', () => {
    expect(toActivityEntityType('expense')).toBe('expense');
    expect(toActivityEntityType('settlement')).toBe('settlement');
  });

  it('degrades an unrecognized entity type to "unknown" and warns', () => {
    const warn = captureConsoleWarn();
    expect(toActivityEntityType('invoice')).toBe('unknown');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invoice'));
  });

  it('rejects inherited Object properties', () => {
    expect(isActivityEntityType('constructor')).toBe(false);
  });
});

describe('toSplitMode', () => {
  it('passes through every mode the SplitMode union allows', () => {
    for (const m of ['equal', 'exact', 'percentage', 'shares', 'adjustment'] as const) {
      expect(isSplitMode(m)).toBe(true);
      expect(toSplitMode(m)).toBe(m);
    }
  });

  it('maps SQL NULL to undefined without warning — that is the ordinary case', () => {
    // Every row written before 20260725000005, and every CSV import, has NULL
    // here. Warning about those would fire once per legacy row.
    const warn = captureConsoleWarn();
    expect(toSplitMode(null)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('degrades a non-null value outside the union to undefined, and warns', () => {
    const warn = captureConsoleWarn();
    expect(toSplitMode('weighted')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('weighted'));
  });

  it('rejects inherited Object properties', () => {
    expect(isSplitMode('constructor')).toBe(false);
    expect(toSplitMode('toString')).toBeUndefined();
  });
});
