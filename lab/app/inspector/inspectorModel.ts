import type { AttributeValue, Attributes, GridCoord } from '@app/document';

/**
 * Pure form helpers for the inspector. Drafts are plain strings so inputs stay controlled;
 * they are converted to typed values only when the user applies them. The app's command
 * validation remains authoritative; these checks only give earlier, friendlier messages.
 */

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export type AttributeValueKind = 'text' | 'number' | 'boolean' | 'none';

export const ATTRIBUTE_KIND_LABELS: Readonly<Record<AttributeValueKind, string>> = {
  text: 'text',
  number: 'number',
  boolean: 'yes / no',
  none: 'empty (null)',
};

export interface AttributeRow {
  readonly key: string;
  readonly kind: AttributeValueKind;
  /** Draft text; for booleans "true" or "false"; ignored for "none". */
  readonly value: string;
}

export function attributeKindOf(value: AttributeValue): AttributeValueKind {
  if (value === null) return 'none';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
}

export function attributesToRows(attributes: Attributes): AttributeRow[] {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    kind: attributeKindOf(value),
    value: value === null ? '' : String(value),
  }));
}

/** Default draft value when a row's kind changes. */
export function defaultDraftFor(kind: AttributeValueKind): string {
  return kind === 'boolean' ? 'true' : kind === 'number' ? '0' : '';
}

export function parseAttributeValue(row: AttributeRow): ParseResult<AttributeValue> {
  switch (row.kind) {
    case 'none':
      return { ok: true, value: null };
    case 'text':
      return { ok: true, value: row.value };
    case 'boolean':
      if (row.value === 'true') return { ok: true, value: true };
      if (row.value === 'false') return { ok: true, value: false };
      return { ok: false, message: `"${row.key}" must be yes or no` };
    case 'number': {
      const text = row.value.trim();
      const n = Number(text);
      return text !== '' && Number.isFinite(n)
        ? { ok: true, value: n }
        : { ok: false, message: `"${row.key}" must be a number (got "${row.value}")` };
    }
  }
}

/** Build a full attribute record (for `set-node-custom`, which replaces the record). */
export function rowsToAttributes(rows: readonly AttributeRow[]): ParseResult<Attributes> {
  const attributes: Record<string, AttributeValue> = {};
  for (const [i, row] of rows.entries()) {
    const key = row.key.trim();
    if (key === '') return { ok: false, message: `attribute ${i + 1} needs a name` };
    if (Object.hasOwn(attributes, key)) return { ok: false, message: `attribute "${key}" is listed twice` };
    const parsed = parseAttributeValue({ ...row, key });
    if (!parsed.ok) return parsed;
    attributes[key] = parsed.value;
  }
  return { ok: true, value: attributes };
}

export type GridDraft = readonly [string, string, string];

export const gridToDraft = (grid: GridCoord): GridDraft => [String(grid[0]), String(grid[1]), String(grid[2])];

const AXES = ['x', 'y', 'z (storey)'] as const;

export function parseGridDraft(draft: GridDraft): ParseResult<GridCoord> {
  const values: number[] = [];
  for (const [i, text] of draft.entries()) {
    const t = text.trim();
    const n = Number(t);
    if (t === '' || !Number.isInteger(n)) return { ok: false, message: `${AXES[i]} must be a whole number` };
    values.push(n + 0);
  }
  return { ok: true, value: [values[0]!, values[1]!, values[2]!] };
}

export const sameGrid = (a: GridCoord, b: GridCoord): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
