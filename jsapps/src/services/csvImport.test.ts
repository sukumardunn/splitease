import { describe, expect, it } from 'vitest';
import {
  ColumnMapping,
  buildImportPlan,
  defaultSelection,
  detectMapping,
  materializePlan,
  missingRoles,
  parseAmount,
  parseCsv,
  parseDate,
  resolvePerson,
  summarizePlan,
  toCategory,
} from './csvImport';
import { Expense, Friend } from '../types';

const ME = { id: 'me-id', name: 'Vignesh', email: 'v@example.com' };
const ALICE: Friend = { id: 'alice-id', name: 'Alice', email: 'alice@example.com', avatar: 'a' };

function directory(friends: Friend[] = [ALICE]) {
  return { currentUser: ME, friends };
}

function context(existingExpenses: Expense[] = [], friends: Friend[] = [ALICE]) {
  return { ...directory(friends), existingExpenses };
}

/** Deterministic ids so materialize assertions are readable. */
function seqIds(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

const SPLITWISE_CSV = [
  'Date,Description,Category,Cost,Currency,Vignesh,Alice',
  '2026-03-01,Dinner,Dining out,50.00,USD,25.00,-25.00',
  '2026-03-02,Groceries,Groceries,80.00,USD,-40.00,40.00',
  'Total balance,,,0.00,USD,-15.00,15.00',
].join('\n');

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas, quotes and newlines', () => {
    const text = 'desc,amount\n"Dinner, with ""friends""",50\n"Two\nlines",10';
    expect(parseCsv(text)).toEqual([
      ['desc', 'amount'],
      ['Dinner, with "friends"', '50'],
      ['Two\nlines', '10'],
    ]);
  });

  it('handles CRLF line endings and a missing trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('strips a UTF-8 BOM so the first header stays matchable', () => {
    const [headers] = parseCsv('﻿Date,Description\n2026-01-01,x');
    expect(headers[0]).toBe('Date');
  });

  it('drops entirely blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty cells inside a row that has content', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('detectMapping', () => {
  it('maps a Splitwise header row with no manual help', () => {
    const [headers] = parseCsv(SPLITWISE_CSV);
    const mapping = detectMapping(headers, directory());
    expect(mapping.roles).toEqual([
      'date',
      'description',
      'category',
      'amount',
      'currency',
      'person',
      'person',
    ]);
    expect(mapping.people[5]).toEqual({ kind: 'me' });
    expect(mapping.people[6]).toEqual({ kind: 'friend', friendId: 'alice-id' });
    expect(missingRoles(mapping)).toEqual([]);
  });

  it('marks an unknown person column as a friend to create', () => {
    const mapping = detectMapping(['Date', 'Description', 'Cost', 'Bob'], directory());
    expect(mapping.people[3]).toEqual({ kind: 'new', name: 'Bob' });
  });

  it('ignores a second column claiming an already-taken role', () => {
    const mapping = detectMapping(['Date', 'Amount', 'Cost'], directory());
    expect(mapping.roles).toEqual(['date', 'amount', 'person']);
  });

  it('ignores blank headers', () => {
    const mapping = detectMapping(['Date', '', 'Cost'], directory());
    expect(mapping.roles[1]).toBe('ignore');
  });

  it('reports the roles a mapping still needs', () => {
    const mapping = detectMapping(['Cost', 'Alice'], directory());
    expect(missingRoles(mapping)).toEqual(['date', 'description']);
  });
});

describe('resolvePerson', () => {
  it('matches the current user by name or email, case-insensitively', () => {
    expect(resolvePerson('vignesh', directory())).toEqual({ kind: 'me' });
    expect(resolvePerson('V@Example.com', directory())).toEqual({ kind: 'me' });
  });

  it('matches a friend by email', () => {
    expect(resolvePerson('alice@example.com', directory())).toEqual({
      kind: 'friend',
      friendId: 'alice-id',
    });
  });

  it('does not match a friend on an empty email', () => {
    const noEmail: Friend = { id: 'f2', name: 'Carol', email: '', avatar: '' };
    expect(resolvePerson('', directory([noEmail]))).toEqual({ kind: 'ignore' });
  });
});

describe('parseAmount', () => {
  it('reads plain, symbol-prefixed and thousands-separated values', () => {
    expect(parseAmount('50.00')).toBe(50);
    expect(parseAmount('$1,250.75')).toBe(1250.75);
    expect(parseAmount('-25.00')).toBe(-25);
  });

  it('reads parenthesised negatives', () => {
    expect(parseAmount('(25.00)')).toBe(-25);
  });

  it('treats blanks as zero and gibberish as unreadable', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('  ')).toBe(0);
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('parseDate', () => {
  it('keeps an ISO date on its own calendar day regardless of timezone', () => {
    const iso = parseDate('2026-03-01');
    expect(iso).not.toBeNull();
    const parsed = new Date(iso!);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(1);
  });

  it('reads slash dates month-first', () => {
    const parsed = new Date(parseDate('3/1/2026')!);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(1);
  });

  it('expands a two-digit year', () => {
    expect(new Date(parseDate('3/1/26')!).getFullYear()).toBe(2026);
  });

  it('rejects blanks, gibberish, and dates that would roll over', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('2026-02-31')).toBeNull();
  });
});

describe('toCategory', () => {
  it('translates Splitwise category names', () => {
    expect(toCategory('Dining out')).toBe('dining');
    expect(toCategory('TV/Phone/Internet')).toBe('utilities');
    expect(toCategory('General')).toBe('other');
  });

  it('passes through a name that is already one of ours', () => {
    expect(toCategory('travel')).toBe('travel');
  });

  it('falls back to other for unknown and blank values', () => {
    expect(toCategory('Yacht maintenance')).toBe('other');
    expect(toCategory('')).toBe('other');
  });

  it('never yields settlement — a CSV row is an expense, not a transfer', () => {
    expect(toCategory('settlement')).toBe('other');
  });
});

describe('buildImportPlan', () => {
  const rows = parseCsv(SPLITWISE_CSV);
  const mapping = detectMapping(rows[0], directory());

  it('reconstructs payer and shares from signed net columns', () => {
    const plan = buildImportPlan(rows, mapping, context());

    // Row 0: I am +25 on a 50 dinner, so I paid and we split evenly.
    expect(plan.drafts[0]).toMatchObject({
      description: 'Dinner',
      amount: 50,
      category: 'dining',
      currency: 'USD',
      paidByKey: 'me-id',
    });
    expect(plan.drafts[0].shares).toEqual([
      { personKey: 'me-id', amount: 25 },
      { personKey: 'alice-id', amount: 25 },
    ]);

    // Row 1: Alice is +40 on 80, so Alice paid.
    expect(plan.drafts[1].paidByKey).toBe('alice-id');
    expect(plan.drafts[1].shares).toEqual([
      { personKey: 'me-id', amount: 40 },
      { personKey: 'alice-id', amount: 40 },
    ]);
  });

  it('skips the Splitwise total row instead of reporting it as broken', () => {
    const plan = buildImportPlan(rows, mapping, context());
    expect(plan.drafts).toHaveLength(2);
    expect(plan.skipped).toEqual([{ rowIndex: 2, reason: 'Splitwise total row' }]);
  });

  it('handles an uneven split', () => {
    const csv = parseCsv(
      'Date,Description,Cost,Vignesh,Alice\n2026-03-01,Cab,30.00,20.00,-20.00'
    );
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), context());
    // I paid 30, netted +20, so my share is 10 and Alice's is 20.
    expect(plan.drafts[0].shares).toEqual([
      { personKey: 'me-id', amount: 10 },
      { personKey: 'alice-id', amount: 20 },
    ]);
  });

  it('drops people whose share on a row is zero', () => {
    const csv = parseCsv(
      'Date,Description,Cost,Vignesh,Alice,Bob\n2026-03-01,Tea,10.00,5.00,-5.00,0.00'
    );
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), context());
    expect(plan.drafts[0].shares.map((s) => s.personKey)).toEqual(['me-id', 'alice-id']);
  });

  it('records an all-zero row as a solo expense owned by the importing user', () => {
    const csv = parseCsv(
      'Date,Description,Cost,Vignesh,Alice\n2026-03-01,My lunch,12.00,0.00,0.00'
    );
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), context());
    expect(plan.drafts[0].error).toBeUndefined();
    expect(plan.drafts[0].paidByKey).toBe('me-id');
    expect(plan.drafts[0].shares).toEqual([{ personKey: 'me-id', amount: 12 }]);
  });

  it('flags a row whose person columns do not sum to zero', () => {
    const csv = parseCsv(
      'Date,Description,Cost,Vignesh,Alice\n2026-03-01,Odd,50.00,25.00,-10.00'
    );
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), context());
    expect(plan.drafts[0].error).toMatch(/sum to 15.00/);
  });

  it('flags unreadable dates, unreadable amounts and non-positive amounts', () => {
    const csv = parseCsv(
      [
        'Date,Description,Cost,Vignesh,Alice',
        'nope,Bad date,10.00,5.00,-5.00',
        '2026-03-01,Bad amount,abc,5.00,-5.00',
        '2026-03-01,Zero,0.00,0.00,0.00',
      ].join('\n')
    );
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), context());
    expect(plan.drafts[0].error).toMatch(/date "nope"/);
    expect(plan.drafts[1].error).toMatch(/amount "abc"/);
    expect(plan.drafts[2].error).toMatch(/greater than zero/);
  });

  it('flags a row missing a description', () => {
    const csv = parseCsv('Date,Description,Cost,Vignesh,Alice\n2026-03-01,,10.00,5.00,-5.00');
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), context());
    expect(plan.drafts[0].error).toMatch(/description/i);
  });

  it('flags a row that duplicates an existing active expense', () => {
    const existing: Expense = {
      id: 'existing-1',
      description: 'dinner',
      amount: 50,
      paidBy: 'me-id',
      splitWith: [],
      date: '2026-03-01T18:00:00.000Z',
      category: 'dining',
      currency: 'USD',
      groupId: null,
    };
    const plan = buildImportPlan(rows, mapping, context([existing]));
    expect(plan.drafts[0].duplicateOfId).toBe('existing-1');
    expect(plan.drafts[1].duplicateOfId).toBeUndefined();
  });

  it('ignores a soft-deleted expense when deduping', () => {
    const deleted: Expense = {
      id: 'gone',
      description: 'Dinner',
      amount: 50,
      paidBy: 'me-id',
      splitWith: [],
      date: '2026-03-01T18:00:00.000Z',
      category: 'dining',
      currency: 'USD',
      groupId: null,
      deletedAt: '2026-03-05T00:00:00.000Z',
    };
    const plan = buildImportPlan(rows, mapping, context([deleted]));
    expect(plan.drafts[0].duplicateOfId).toBeUndefined();
  });

  it('flags a row that duplicates an earlier row in the same file', () => {
    const csv = parseCsv(
      [
        'Date,Description,Cost,Vignesh,Alice',
        '2026-03-01,Dinner,50.00,25.00,-25.00',
        '2026-03-01,Dinner,50.00,25.00,-25.00',
      ].join('\n')
    );
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), context());
    expect(plan.drafts[0].duplicateOfRow).toBeUndefined();
    expect(plan.drafts[1].duplicateOfRow).toBe(0);
  });

  it('falls back to the default currency when there is no currency column', () => {
    const csv = parseCsv('Date,Description,Cost,Vignesh,Alice\n2026-03-01,Tea,10.00,5.00,-5.00');
    const plan = buildImportPlan(csv, detectMapping(csv[0], directory()), {
      ...context(),
      defaultCurrency: 'eur',
    });
    expect(plan.drafts[0].currency).toBe('EUR');
  });

  it('errors the row when every person column is unmapped', () => {
    const csv = parseCsv('Date,Description,Cost,Alice\n2026-03-01,Tea,10.00,0.00');
    const mappingNoPeople: ColumnMapping = {
      roles: ['date', 'description', 'amount', 'person'],
      people: { 3: { kind: 'ignore' } },
    };
    const plan = buildImportPlan(csv, mappingNoPeople, context());
    expect(plan.drafts[0].error).toMatch(/No people are mapped/);
    expect(plan.people).toEqual([]);
  });
});

describe('defaultSelection and summarizePlan', () => {
  const csv = parseCsv(
    [
      'Date,Description,Cost,Vignesh,Bob',
      '2026-03-01,Good,50.00,25.00,-25.00',
      '2026-03-02,Broken,abc,0,0',
      '2026-03-01,Good,50.00,25.00,-25.00',
    ].join('\n')
  );
  const mapping = detectMapping(csv[0], directory());

  it('preselects only clean, non-duplicate rows', () => {
    const plan = buildImportPlan(csv, mapping, context());
    expect([...defaultSelection(plan)]).toEqual([0]);
  });

  it('counts duplicates, errors and new friends', () => {
    const plan = buildImportPlan(csv, mapping, context());
    const selected = defaultSelection(plan);
    expect(summarizePlan(plan, selected)).toEqual({
      importable: 1,
      duplicates: 1,
      errors: 1,
      newFriends: 1,
      total: 3,
    });
  });

  it('does not count a new friend nobody selected actually uses', () => {
    const plan = buildImportPlan(csv, mapping, context());
    expect(summarizePlan(plan, new Set()).newFriends).toBe(0);
  });
});

describe('materializePlan', () => {
  const csv = parseCsv(
    [
      'Date,Description,Category,Cost,Vignesh,Bob',
      '2026-03-01,Dinner,Dining out,50.00,25.00,-25.00',
      '2026-03-02,Broken,General,abc,0,0',
    ].join('\n')
  );
  const mapping = detectMapping(csv[0], directory());

  it('creates the new friend once and points expenses at its fresh id', () => {
    const plan = buildImportPlan(csv, mapping, context());
    const { friends, expenses } = materializePlan(plan, defaultSelection(plan), seqIds());

    expect(friends).toHaveLength(1);
    expect(friends[0]).toMatchObject({ id: 'id-1', name: 'Bob', email: '' });
    expect(friends[0].avatar).toBeTruthy();

    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      id: 'id-2',
      description: 'Dinner',
      amount: 50,
      paidBy: 'me-id',
      category: 'dining',
      groupId: null,
      deletedAt: null,
    });
    expect(expenses[0].splitWith).toEqual([
      { userId: 'me-id', amount: 25 },
      { userId: 'id-1', amount: 25 },
    ]);
    expect(expenses[0].payers).toEqual([{ userId: 'me-id', amount: 50 }]);
  });

  it('never materializes an errored or unselected row', () => {
    const plan = buildImportPlan(csv, mapping, context());
    const all = new Set(plan.drafts.map((d) => d.rowIndex));
    expect(materializePlan(plan, all, seqIds()).expenses).toHaveLength(1);
    expect(materializePlan(plan, new Set(), seqIds())).toEqual({ friends: [], expenses: [] });
  });

  it('splits sum to the expense amount for every materialized row', () => {
    const plan = buildImportPlan(parseCsv(SPLITWISE_CSV), detectMapping(parseCsv(SPLITWISE_CSV)[0], directory()), context());
    const { expenses } = materializePlan(plan, defaultSelection(plan), seqIds());
    expect(expenses).toHaveLength(2);
    for (const expense of expenses) {
      const total = expense.splitWith.reduce((sum, s) => sum + s.amount, 0);
      expect(total).toBeCloseTo(expense.amount, 2);
    }
  });
});
