import type { AttributeValue } from '@app/document';
import {
  checkFieldValue,
  describeField,
  type ActiveToolkit,
  type AttributeField,
  type DefaultValue,
  type EffectiveAttribute,
  type FieldKind,
} from '@app/extensions';

/**
 * Pure helpers for the Attributes manager and the custom-attribute part of Properties
 * (programme phase 03). No React here, so every rule is unit-tested.
 */

/** Text of a default/value for display: "40", "yes", "“high”", "—". */
export function formatFieldValue(value: AttributeValue | undefined): string {
  if (value === undefined) return '—';
  if (value === null) return 'no value';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return `“${value}”`;
  return String(value);
}

export type DraftParse = { readonly ok: true; readonly value: DefaultValue | undefined } | { readonly ok: false; readonly message: string };

/**
 * A typed draft for a default or instance value. Empty text = no value (`undefined`). Numbers must
 * be finite; booleans are "true"/"false"; everything is then checked against the field.
 */
export function parseValueDraft(field: Pick<AttributeField, 'kind' | 'values' | 'min' | 'max' | 'label'>, draft: string): DraftParse {
  const text = field.kind === 'text' ? draft : draft.trim();
  if (text === '') return { ok: true, value: undefined };
  let value: DefaultValue;
  switch (field.kind) {
    case 'number': {
      const n = Number(text);
      if (!Number.isFinite(n)) return { ok: false, message: `“${field.label}” must be a number` };
      value = n;
      break;
    }
    case 'boolean':
      if (text !== 'true' && text !== 'false') return { ok: false, message: `“${field.label}” must be yes or no` };
      value = text === 'true';
      break;
    default:
      value = text;
  }
  return checkFieldValue(field, value) === 'ok' ? { ok: true, value } : { ok: false, message: `“${field.label}” must be ${describeField(field)}` };
}

/** "high, medium,low" → ["high", "medium", "low"] (trimmed, empty entries dropped). */
export const parseChoices = (text: string): string[] =>
  text
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');

/** Where an effective value comes from, in one short phrase for Properties. */
export function sourceText(r: EffectiveAttribute, functionId?: string): { readonly chip: string; readonly tone: 'set' | 'inherited' | 'none' | 'warning' } {
  if (r.stored === 'invalid') return { chip: 'invalid stored value', tone: 'warning' };
  if (r.source === 'instance') return r.value === null ? { chip: 'set to no value', tone: 'set' } : { chip: 'set here', tone: 'set' };
  if (r.source === 'type-default') return { chip: `${functionId ?? 'function'} default`, tone: 'inherited' };
  if (r.source === 'schema-default') return { chip: 'default', tone: 'inherited' };
  return { chip: 'no value', tone: 'none' };
}

/** Text describing what "Use default" falls back to. */
export const inheritedText = (r: EffectiveAttribute, functionId?: string): string =>
  r.inheritedSource === 'type-default'
    ? `${functionId ?? 'function'} default ${formatFieldValue(r.inherited)}`
    : r.inheritedSource === 'schema-default'
      ? `default ${formatFieldValue(r.inherited)}`
      : 'no default';

/** Node types offered for type defaults: the project's valid types plus types used in the open design. */
export function typeChoices(project: Pick<ActiveToolkit, 'functions'> | null, usedTypeIds: readonly string[]): { readonly id: string; readonly label: string }[] {
  const out = new Map<string, string>();
  for (const t of project?.functions ?? []) if (t.status.ok) out.set(t.id, t.definition.label);
  for (const id of usedTypeIds) if (!out.has(id)) out.set(id, id);
  return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, label]) => ({ id, label }));
}

export const KIND_HELP: Readonly<Record<FieldKind, string>> = {
  text: 'Any text, e.g. a note.',
  number: 'A number, optionally with a smallest and largest value.',
  boolean: 'Yes or no.',
  enum: 'One of a fixed list of choices.',
};

/**
 * `<select>` option values for an instance control: "inherit" (use the default), "null" (explicit
 * no value) or "v:<json>" (a value). Encoded so a choice can never collide with the sentinels.
 */
export const INHERIT = 'inherit';
export const EXPLICIT_NONE = 'null';
export const encodeChoice = (value: DefaultValue): string => `v:${JSON.stringify(value)}`;
export function decodeChoice(option: string): AttributeValue | undefined {
  if (option === INHERIT) return undefined;
  if (option === EXPLICIT_NONE) return null;
  return JSON.parse(option.slice(2)) as DefaultValue;
}
