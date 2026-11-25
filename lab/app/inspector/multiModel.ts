import type { AttributeValue, Attributes } from '@app/document';
import {
  checkFieldValue,
  describeField,
  resolveEdgeAttributes,
  resolveNodeAttributes,
  writeFieldValue,
  type AttributeCollection,
  type AttributeField,
  type EffectiveAttribute,
  type ProjectAttributeSchema,
} from '@app/extensions';
import type { DesignCommand } from '@app/spatial';

/**
 * Pure rules of Properties for a multi-selection (2026-11-23): every attribute that can be edited
 * for one node or edge can be edited for several at once, except Position and Size (several rooms
 * cannot take one place). Each edit is ONE command, so ONE Undo step.
 */

export interface MultiItem {
  readonly id: number;
  readonly function?: string;
  readonly custom: Attributes;
}

/** One value shared by every selected item, or `mixed` with the distinct texts (for the hint). */
export type Shared<T> = { readonly kind: 'same'; readonly value: T } | { readonly kind: 'mixed'; readonly values: readonly string[] };

/** The shared value of `values` (compared as JSON), or `mixed`. */
export function sharedValue<T>(values: readonly T[], text: (value: T) => string = (v) => JSON.stringify(v) ?? '—'): Shared<T> {
  const keys = [...new Set(values.map((v) => JSON.stringify(v) ?? 'undefined'))];
  if (keys.length <= 1 && values.length > 0) return { kind: 'same', value: values[0]! };
  const seen = new Map<string, string>();
  for (const v of values) seen.set(JSON.stringify(v) ?? 'undefined', text(v));
  return { kind: 'mixed', values: [...seen.values()] };
}

/** Each selected item's resolved custom attributes, per field id (same field list for every item). */
export function resolveMulti(schema: ProjectAttributeSchema, collection: AttributeCollection, items: readonly MultiItem[]): ReadonlyMap<string, readonly EffectiveAttribute[]> {
  const out = new Map<string, EffectiveAttribute[]>();
  for (const item of items) {
    const resolved = collection === 'nodes' ? resolveNodeAttributes(schema, { function: item.function ?? '', custom: item.custom }) : resolveEdgeAttributes(schema, item);
    for (const r of resolved) {
      const list = out.get(r.field.id) ?? [];
      list.push(r);
      out.set(r.field.id, list);
    }
  }
  return out;
}

/**
 * What a field's control shows for several items: the stored state shared by all (`own value`,
 * `explicit none`, or `inherit` = no own value; inherited defaults may differ per Function), else mixed.
 */
export type StoredState = { readonly kind: 'value'; readonly value: AttributeValue } | { readonly kind: 'none' } | { readonly kind: 'inherit' } | { readonly kind: 'invalid' };

export const storedStateOf = (r: EffectiveAttribute): StoredState =>
  r.stored === 'invalid' ? { kind: 'invalid' } : r.source === 'instance' ? (r.value === null ? { kind: 'none' } : { kind: 'value', value: r.value as AttributeValue }) : { kind: 'inherit' };

export const storedStateText = (s: StoredState): string =>
  s.kind === 'value' ? (typeof s.value === 'boolean' ? (s.value ? 'yes' : 'no') : String(s.value)) : s.kind === 'none' ? 'no value' : s.kind === 'invalid' ? 'invalid' : 'default';

export type MultiCommandResult = { readonly ok: true; readonly command: DesignCommand | null } | { readonly ok: false; readonly message: string };

/**
 * ONE command giving every item the same value of `field` (`undefined` = remove the own value so
 * the default applies again; `null` = explicit no value). Each item keeps its other stored values.
 * `command: null` when no item would change.
 */
export function multiFieldCommand(collection: AttributeCollection, items: readonly MultiItem[], field: AttributeField, value: AttributeValue | undefined): MultiCommandResult {
  if (value !== undefined && value !== null && checkFieldValue(field, value) !== 'ok') {
    return { ok: false, message: `“${field.label}” must be ${describeField(field)}` };
  }
  const custom: Record<string, Attributes> = {};
  for (const item of items) {
    const next = writeFieldValue(field, item.custom, value);
    if (JSON.stringify(next) !== JSON.stringify(item.custom)) custom[item.id] = next;
  }
  if (Object.keys(custom).length === 0) return { ok: true, command: null };
  return { ok: true, command: collection === 'nodes' ? { type: 'set-nodes-custom', custom } : { type: 'set-edges-custom', custom } };
}
