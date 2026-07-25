/**
 * CSV import pipeline (Phase 5a, design §5.2 A) — pure, no React, no I/O.
 *
 * Four stages, each independently testable:
 *   1. `parseCsv`          text            -> string[][]
 *   2. `detectMapping`     headers         -> ColumnMapping   (a guess the user can edit)
 *   3. `buildImportPlan`   rows + mapping  -> ImportPlan      (the dry-run preview)
 *   4. `materializePlan`   plan + choices  -> domain entities (what gets written)
 *
 * Nothing here talks to Supabase. Stage 4 hands finished `Expense`/`Friend`
 * objects to `supabaseStore.importCsvBatch`, which owns the writes.
 *
 * ## The Splitwise share format
 *
 * A Splitwise group export looks like:
 *
 *     Date,Description,Category,Cost,Currency,Alice,Bob
 *     2026-03-01,Dinner,Dining out,50.00,USD,25.00,-25.00
 *     Total balance,,,0.00,USD,25.00,-25.00
 *
 * Each person column is a *signed net*: what that person paid minus what they
 * owed. It does not say who actually fronted the cash, which is what our
 * `paidBy` needs, so `buildImportPlan` reconstructs it — see
 * `reconstructShares` for the derivation and its assumptions.
 */
import { Expense, ExpenseCategory, Friend } from '../types';
import { isExpenseCategory } from './dbValidation';
import { generateAvatar } from '../utils/avatar';

/** Cent-level tolerance for the "person columns must sum to zero" check. */
const BALANCE_TOLERANCE = 0.011;

/** Splitwise's footer row, which is a running balance rather than an expense. */
const TOTAL_ROW = /^total balance$/i;

// ---------- stage 1: parsing ----------

/**
 * Parse CSV text into a grid of cells (RFC 4180: double-quoted fields, `""`
 * escapes, embedded newlines and commas, CRLF or LF line endings).
 *
 * Hand-rolled on purpose: the repo pins its dependency surface to
 * `lucide-react` + Tailwind (see `jsapps/.bolt/prompt`), and this is ~40 lines.
 * A leading UTF-8 BOM is stripped — Excel writes one and it would otherwise
 * become part of the first header's name, breaking column auto-detection.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      // Consume CRLF as one terminator.
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  // A file not ending in a newline still has a final cell/row pending.
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop rows that are entirely empty — trailing blank lines, mostly.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------- stage 2: column mapping ----------

export type ColumnRole =
  | 'date'
  | 'description'
  | 'category'
  | 'amount'
  | 'currency'
  /** A signed per-person net share (the Splitwise shape). */
  | 'person'
  | 'ignore';

/** Who a `person` column refers to. `new` means "create this friend on import". */
export type PersonTarget =
  | { kind: 'me' }
  | { kind: 'friend'; friendId: string }
  | { kind: 'new'; name: string }
  | { kind: 'ignore' };

/** A person column that actually contributes to the import. */
type MappedPerson = Exclude<PersonTarget, { kind: 'ignore' }>;

export interface ColumnMapping {
  /** Index-aligned with the header row. */
  roles: ColumnRole[];
  /** Keyed by column index; only meaningful for columns whose role is 'person'. */
  people: Record<number, PersonTarget>;
}

const HEADER_PATTERNS: { role: ColumnRole; pattern: RegExp }[] = [
  { role: 'date', pattern: /^(date|when)$/i },
  { role: 'description', pattern: /^(description|desc|item|name|title)$/i },
  { role: 'category', pattern: /^categor(y|ies)$/i },
  { role: 'amount', pattern: /^(cost|amount|total|price)$/i },
  { role: 'currency', pattern: /^(currency|currency code)$/i },
];

export interface PersonDirectory {
  currentUser: { id: string; name: string; email: string };
  friends: Friend[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve a person-column header to someone we already know, by name or email.
 *
 * Exported for the UI, which re-resolves after the user creates a friend
 * mid-mapping.
 */
export function resolvePerson(header: string, directory: PersonDirectory): PersonTarget {
  const key = normalize(header);
  if (!key) return { kind: 'ignore' };
  const { currentUser, friends } = directory;
  if (normalize(currentUser.name) === key || normalize(currentUser.email) === key) {
    return { kind: 'me' };
  }
  const friend = friends.find(
    (f) => normalize(f.name) === key || (!!f.email && normalize(f.email) === key)
  );
  if (friend) return { kind: 'friend', friendId: friend.id };
  return { kind: 'new', name: header.trim() };
}

/**
 * Best-guess mapping for a header row. Known column names get their role by
 * pattern; every other non-blank header is assumed to be a person column, which
 * is what makes a Splitwise export work with no manual mapping at all.
 *
 * Only the *first* match for each single-value role wins — a file with two
 * "Amount" columns maps the second to 'ignore' rather than silently overwriting.
 */
export function detectMapping(headers: string[], directory: PersonDirectory): ColumnMapping {
  const roles: ColumnRole[] = [];
  const people: Record<number, PersonTarget> = {};
  const claimed = new Set<ColumnRole>();

  headers.forEach((header, index) => {
    const match = HEADER_PATTERNS.find((p) => p.pattern.test(header.trim()));
    if (match && !claimed.has(match.role)) {
      claimed.add(match.role);
      roles[index] = match.role;
      return;
    }
    if (header.trim() === '') {
      roles[index] = 'ignore';
      return;
    }
    roles[index] = 'person';
    people[index] = resolvePerson(header, directory);
  });

  return { roles, people };
}

/** Which single-value roles a mapping still needs before it can be previewed. */
export function missingRoles(mapping: ColumnMapping): ColumnRole[] {
  const required: ColumnRole[] = ['date', 'description', 'amount'];
  return required.filter((role) => !mapping.roles.includes(role));
}

// ---------- category translation ----------

/**
 * Splitwise's category names -> our `ExpenseCategory` union. Anything unlisted
 * falls back to 'other'; category is cosmetic (it picks an icon), so an
 * unrecognized value must never cost us the row — same policy as `dbValidation`.
 */
const CATEGORY_ALIASES: Record<string, ExpenseCategory> = {
  'dining out': 'dining',
  restaurants: 'dining',
  food: 'dining',
  'food and drink': 'dining',
  'liquor and alcohol': 'dining',
  groceries: 'groceries',
  rent: 'rent',
  mortgage: 'rent',
  home: 'rent',
  'household supplies': 'groceries',
  utilities: 'utilities',
  electricity: 'utilities',
  'heat and gas': 'utilities',
  water: 'utilities',
  'tv/phone/internet': 'utilities',
  entertainment: 'entertainment',
  movies: 'entertainment',
  music: 'entertainment',
  games: 'entertainment',
  sports: 'entertainment',
  transportation: 'transportation',
  'bus/train': 'transportation',
  'car': 'transportation',
  gas: 'transportation',
  'gas/fuel': 'transportation',
  parking: 'transportation',
  taxi: 'transportation',
  travel: 'travel',
  'hotel': 'travel',
  flights: 'travel',
  shopping: 'shopping',
  clothing: 'shopping',
  electronics: 'shopping',
  gifts: 'shopping',
  services: 'services',
  'medical expenses': 'services',
  insurance: 'services',
  cleaning: 'services',
  general: 'other',
  other: 'other',
};

export function toCategory(raw: string): ExpenseCategory {
  const key = normalize(raw);
  if (!key) return 'other';
  const alias = CATEGORY_ALIASES[key];
  if (alias) return alias;
  // 'settlement' is reachable here, but a CSV row is an expense by definition,
  // so a literal "settlement" category would misrepresent it as a cash transfer.
  if (isExpenseCategory(key) && key !== 'settlement') return key;
  return 'other';
}

// ---------- value parsing ----------

/**
 * Parse a money cell. Tolerates currency symbols, thousands separators,
 * parenthesised negatives ("(25.00)" = -25.00) and blanks (= 0).
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return 0;
  const negated = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()]/g, '').replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return negated ? -value : value;
}

/**
 * Parse a date cell to an ISO timestamp, or null if unintelligible.
 *
 * `YYYY-MM-DD` (what Splitwise exports) is parsed as a *local* date rather than
 * handed to `new Date('2026-03-01')`, which the spec defines as UTC midnight —
 * that lands on the previous day for anyone west of Greenwich and would shift
 * every imported expense by a day.
 *
 * Slash dates are read month-first (`3/1/2026` = 1 March). That is an
 * assumption, not a fact: it matches US-locale exports, and it is why the
 * preview shows a formatted date for every row before the user confirms.
 */
export function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (iso) return localDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (slash) {
    const year = Number(slash[3]);
    return localDate(year < 100 ? 2000 + year : year, Number(slash[1]), Number(slash[2]));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function localDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  // Rejects impossible dates that the Date constructor would roll over
  // (2026-02-31 becoming 3 March).
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.toISOString();
}

// ---------- stage 3: the dry-run plan ----------

/** A person as referenced inside a plan. `key` is stable across a plan's life. */
export interface PlanPerson {
  /** Existing id for me/friends; `new:<column>` for a friend the import creates. */
  key: string;
  name: string;
  isNew: boolean;
}

export interface DraftShare {
  personKey: string;
  amount: number;
}

export interface DraftExpense {
  /** 0-based index into the data rows (header excluded). Stable React key. */
  rowIndex: number;
  description: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
  currency: string;
  paidByKey: string;
  shares: DraftShare[];
  /** Id of an existing expense this row appears to duplicate. */
  duplicateOfId?: string;
  /** Set when this row duplicates an earlier row in the same file. */
  duplicateOfRow?: number;
  /** Why this row cannot be imported. Present => excluded from the write. */
  error?: string;
}

export interface SkippedRow {
  rowIndex: number;
  reason: string;
}

export interface ImportPlan {
  /** Every data row we could make sense of, importable or not. */
  drafts: DraftExpense[];
  /** Everyone referenced, in column order. */
  people: PlanPerson[];
  /** Rows deliberately not shown (blank lines, Splitwise's total row). */
  skipped: SkippedRow[];
}

export interface PlanContext extends PersonDirectory {
  /** Active expenses to dedupe against. */
  existingExpenses: Expense[];
  /** Used when a row has no currency column. */
  defaultCurrency?: string;
}

/**
 * Recover `paidBy` and per-person shares from Splitwise's signed net columns.
 *
 * Given cost `C` and each person's net `n_i` (what they paid minus what they
 * owed), where `Σ n_i = 0`:
 *
 *   - Assume a single payer `p`, the person with the largest net. Splitwise
 *     itself supports multiple payers, but the export flattens them away — the
 *     net columns cannot distinguish "Alice paid all 50" from "Alice and Bob
 *     each paid 25 and Bob owes more". Largest-net is the only defensible guess.
 *   - `share_i = paid_i - n_i`, and `paid_i = 0` for everyone but `p`,
 *     so `share_i = -n_i`.
 *   - `share_p = C - Σ_{i≠p} share_i = C + Σ_{i≠p} n_i = C - n_p`.
 *
 * When every net is zero the format has genuinely lost the payer: each person
 * paid exactly their own share. Whoever we name as payer, the balance impact is
 * identical (they owe only themselves), so rather than reject the row we record
 * it as a solo expense owned by `preferredPayerKey` — the importing user, if
 * they are mapped to a column.
 *
 * Returns an `error` instead when the columns can't describe a real expense.
 */
function reconstructShares(
  cost: number,
  nets: { personKey: string; net: number }[],
  preferredPayerKey: string | undefined
): { paidByKey: string; shares: DraftShare[] } | { error: string } {
  if (nets.length === 0) return { error: 'No people are mapped for this row.' };

  const sum = nets.reduce((acc, n) => acc + n.net, 0);
  if (Math.abs(sum) > BALANCE_TOLERANCE) {
    return {
      error: `Per-person amounts sum to ${sum.toFixed(2)}, not 0.00 — this row can't be balanced.`,
    };
  }

  const payer = nets.reduce((best, n) => (n.net > best.net ? n : best), nets[0]);
  // Nets summing to zero with no positive entry means they are all zero.
  if (payer.net <= 0) {
    const soloKey =
      preferredPayerKey && nets.some((n) => n.personKey === preferredPayerKey)
        ? preferredPayerKey
        : nets[0].personKey;
    return { paidByKey: soloKey, shares: [{ personKey: soloKey, amount: round2(cost) }] };
  }

  const shares: DraftShare[] = nets.map((n) => ({
    personKey: n.personKey,
    amount: round2(n.personKey === payer.personKey ? cost - n.net : -n.net),
  }));

  const negative = shares.find((s) => s.amount < -0.005);
  if (negative) {
    return { error: 'A share came out negative — the per-person columns look inconsistent.' };
  }

  // Drop zero shares: a person listed in the export but not part of this row.
  const involved = shares.filter((s) => Math.abs(s.amount) > 0.005);
  return {
    paidByKey: payer.personKey,
    shares: involved.length > 0 ? involved : shares,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Same-day + same-description + same-amount. Deliberately strict. */
function duplicateKey(description: string, amount: number, isoDate: string): string {
  return `${normalize(description)}|${amount.toFixed(2)}|${isoDate.slice(0, 10)}`;
}

/**
 * Turn parsed rows into the dry-run preview: what would be created, what looks
 * like a duplicate, what cannot be imported and why. Never writes anything.
 *
 * `rows` includes the header row; it is consumed for names and excluded from the
 * drafts.
 */
export function buildImportPlan(
  rows: string[][],
  mapping: ColumnMapping,
  context: PlanContext
): ImportPlan {
  const [, ...dataRows] = rows;
  const drafts: DraftExpense[] = [];
  const skipped: SkippedRow[] = [];

  // Columns the user chose to ignore are dropped here rather than checked at
  // every use, which also narrows the target type for the switch below.
  const personColumns: { index: number; target: MappedPerson }[] = [];
  mapping.roles.forEach((role, index) => {
    if (role !== 'person') return;
    const target = mapping.people[index];
    if (!target || target.kind === 'ignore') return;
    personColumns.push({ index, target });
  });

  const people: PlanPerson[] = personColumns.map(({ index, target }) => {
    switch (target.kind) {
      case 'me':
        return { key: context.currentUser.id, name: context.currentUser.name, isNew: false };
      case 'friend': {
        const friend = context.friends.find((f) => f.id === target.friendId);
        return { key: target.friendId, name: friend?.name ?? 'Unknown', isNew: false };
      }
      case 'new':
        return { key: `new:${index}`, name: target.name, isNew: true };
    }
  });
  const keyForColumn = new Map(personColumns.map(({ index }, i) => [index, people[i].key]));

  const columnFor = (role: ColumnRole): number => mapping.roles.indexOf(role);
  const dateColumn = columnFor('date');
  const descriptionColumn = columnFor('description');
  const amountColumn = columnFor('amount');
  const categoryColumn = columnFor('category');
  const currencyColumn = columnFor('currency');

  const existingKeys = new Map<string, string>();
  for (const expense of context.existingExpenses) {
    if (expense.deletedAt) continue;
    existingKeys.set(duplicateKey(expense.description, expense.amount, expense.date), expense.id);
  }
  const rowKeys = new Map<string, number>();

  dataRows.forEach((row, rowIndex) => {
    const cell = (index: number): string => (index >= 0 ? (row[index] ?? '') : '');
    const description = cell(descriptionColumn).trim();
    const rawDate = cell(dateColumn).trim();
    const rawAmount = cell(amountColumn).trim();

    // Splitwise appends a running-balance footer. The literal text lands in the
    // *date* column ("Total balance,,,0.00,USD,-15.00,15.00"), which is why both
    // cells are checked. Dropped quietly rather than reported as a broken row.
    if (TOTAL_ROW.test(rawDate) || TOTAL_ROW.test(description)) {
      skipped.push({ rowIndex, reason: 'Splitwise total row' });
      return;
    }
    if (!rawDate && !description && !rawAmount) {
      skipped.push({ rowIndex, reason: 'blank row' });
      return;
    }

    const currency = (cell(currencyColumn).trim() || context.defaultCurrency || 'USD').toUpperCase();
    const category = toCategory(cell(categoryColumn));
    const date = parseDate(rawDate);
    const amount = parseAmount(rawAmount);

    const base = {
      rowIndex,
      description: description || '(no description)',
      amount: amount ?? 0,
      date: date ?? new Date().toISOString(),
      category,
      currency,
      paidByKey: '',
      shares: [] as DraftShare[],
    };

    if (!description) {
      drafts.push({ ...base, error: 'Missing a description.' });
      return;
    }
    if (date === null) {
      drafts.push({ ...base, error: `Couldn't read the date "${rawDate}".` });
      return;
    }
    if (amount === null) {
      drafts.push({ ...base, error: `Couldn't read the amount "${rawAmount}".` });
      return;
    }
    if (amount <= 0) {
      drafts.push({ ...base, error: 'Amount must be greater than zero.' });
      return;
    }

    const nets = personColumns.map(({ index }) => ({
      personKey: keyForColumn.get(index)!,
      net: parseAmount(cell(index)) ?? 0,
    }));
    const reconstructed = reconstructShares(amount, nets, context.currentUser.id);
    if ('error' in reconstructed) {
      drafts.push({ ...base, date, amount, error: reconstructed.error });
      return;
    }

    const key = duplicateKey(description, amount, date);
    const draft: DraftExpense = {
      ...base,
      date,
      amount,
      paidByKey: reconstructed.paidByKey,
      shares: reconstructed.shares,
      duplicateOfId: existingKeys.get(key),
      duplicateOfRow: rowKeys.get(key),
    };
    if (!rowKeys.has(key)) rowKeys.set(key, rowIndex);
    drafts.push(draft);
  });

  return { drafts, people, skipped };
}

/** Rows that are safe to import: no error, and not flagged as a duplicate. */
export function defaultSelection(plan: ImportPlan): Set<number> {
  return new Set(
    plan.drafts
      .filter((d) => !d.error && d.duplicateOfId === undefined && d.duplicateOfRow === undefined)
      .map((d) => d.rowIndex)
  );
}

export interface PlanSummary {
  importable: number;
  duplicates: number;
  errors: number;
  newFriends: number;
  total: number;
}

export function summarizePlan(plan: ImportPlan, selected: Set<number>): PlanSummary {
  const isDuplicate = (d: DraftExpense) =>
    d.duplicateOfId !== undefined || d.duplicateOfRow !== undefined;
  return {
    importable: plan.drafts.filter((d) => !d.error && selected.has(d.rowIndex)).length,
    duplicates: plan.drafts.filter((d) => !d.error && isDuplicate(d)).length,
    errors: plan.drafts.filter((d) => !!d.error).length,
    newFriends: countNewFriends(plan, selected),
    total: plan.drafts.length,
  };
}

/**
 * New friends the import would actually create — those referenced by a selected,
 * error-free row. A person column nobody in the selection uses creates nothing.
 */
function countNewFriends(plan: ImportPlan, selected: Set<number>): number {
  return referencedNewKeys(plan, selected).size;
}

function referencedNewKeys(plan: ImportPlan, selected: Set<number>): Set<string> {
  const newKeys = new Set(plan.people.filter((p) => p.isNew).map((p) => p.key));
  if (newKeys.size === 0) return new Set();
  const used = new Set<string>();
  for (const draft of plan.drafts) {
    if (draft.error || !selected.has(draft.rowIndex)) continue;
    if (newKeys.has(draft.paidByKey)) used.add(draft.paidByKey);
    for (const share of draft.shares) {
      if (newKeys.has(share.personKey)) used.add(share.personKey);
    }
  }
  return used;
}

// ---------- stage 4: materialization ----------

export interface MaterializedImport {
  friends: Friend[];
  expenses: Expense[];
}

/**
 * Turn the selected rows into the exact `Friend`/`Expense` records to persist.
 *
 * `newId` is injected rather than calling `crypto.randomUUID` directly so tests
 * can assert on stable ids.
 */
export function materializePlan(
  plan: ImportPlan,
  selected: Set<number>,
  newId: () => string = () => crypto.randomUUID()
): MaterializedImport {
  const usedNewKeys = referencedNewKeys(plan, selected);
  const idForKey = new Map<string, string>();
  const friends: Friend[] = [];

  for (const person of plan.people) {
    if (!person.isNew || !usedNewKeys.has(person.key)) continue;
    const id = newId();
    idForKey.set(person.key, id);
    friends.push({ id, name: person.name, email: '', avatar: generateAvatar(person.name) });
  }
  const resolve = (key: string): string => idForKey.get(key) ?? key;

  const expenses: Expense[] = plan.drafts
    .filter((d) => !d.error && selected.has(d.rowIndex))
    .map((draft) => ({
      id: newId(),
      description: draft.description,
      amount: draft.amount,
      paidBy: resolve(draft.paidByKey),
      payers: [{ userId: resolve(draft.paidByKey), amount: draft.amount }],
      splitWith: draft.shares.map((s) => ({ userId: resolve(s.personKey), amount: s.amount })),
      date: draft.date,
      category: draft.category,
      currency: draft.currency,
      groupId: null,
      deletedAt: null,
    }));

  return { friends, expenses };
}
