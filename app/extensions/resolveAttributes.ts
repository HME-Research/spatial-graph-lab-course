import type { AttributeValue } from '@app/document';
import {
  checkFieldValue,
  fieldKeys,
  type AttributeCollection,
  type AttributeField,
  type DefaultValue,
  type ProjectAttributeSchema,
} from './projectAttributes';

/**
 * THE effective-attribute resolver. Every consumer — Properties, Graph 2D display options,
 * conformance, Student API contexts and transformations — reads custom values through these
 * functions, so they all agree.
 *
 * Precedence for one field of one instance:
 *   1. a valid stored instance value (explicit `null` = an explicit "no value" override);
 *   2. the node type's default for that field (nodes only);
 *   3. the field's schema default;
 *   4. no value (`undefined`).
 * An INVALID stored value is kept and flagged, and resolution continues with 2–4 as if it were
 * absent. Values are found under the field's current key, else under a former key (renames).
 */

export type AttributeSource = 'instance' | 'type-default' | 'schema-default' | 'none';

/** What is stored for the field: nothing, an explicit null, a valid value or an invalid one. */
export type StoredStatus = 'absent' | 'null' | 'ok' | 'invalid';

export interface EffectiveAttribute {
  readonly field: AttributeField;
  /** Effective value; `null` = explicitly no value; `undefined` = nothing anywhere. */
  readonly value: AttributeValue | undefined;
  readonly source: AttributeSource;
  readonly stored: StoredStatus;
  /** The raw stored value (undefined when absent). */
  readonly storedValue: unknown;
  /** The key the stored value was found under (a former key after a rename), when present. */
  readonly storedKey?: string;
  /** Former keys that ALSO hold a different value, hidden by `storedKey` (kept, never dropped). */
  readonly shadowedKeys?: readonly string[];
  /** What applies without the instance value: the type default, else the schema default. */
  readonly inherited: DefaultValue | undefined;
  readonly inheritedSource: 'type-default' | 'schema-default' | 'none';
}

const own = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

type Stored = { readonly [key: string]: unknown };

/** Where a field's stored value is: current key first, then former keys (newest first). */
export function storedKeyOf(field: AttributeField, attributes: Stored): string | undefined {
  return fieldKeys(field).find((k) => own(attributes, k));
}

export function resolveField(field: AttributeField, attributes: Stored, typeDefault?: DefaultValue): EffectiveAttribute {
  const usableTypeDefault = typeDefault !== undefined && checkFieldValue(field, typeDefault) === 'ok' ? typeDefault : undefined;
  const inherited = usableTypeDefault ?? field.default;
  const inheritedSource = usableTypeDefault !== undefined ? 'type-default' : field.default !== undefined ? 'schema-default' : 'none';
  const key = storedKeyOf(field, attributes);
  const storedValue = key === undefined ? undefined : attributes[key];
  const status: StoredStatus = key === undefined ? 'absent' : storedValue === null ? 'null' : checkFieldValue(field, storedValue) === 'ok' ? 'ok' : 'invalid';
  const shadowed = key === undefined ? [] : fieldKeys(field).filter((k) => k !== key && own(attributes, k) && attributes[k] !== storedValue);
  const base = {
    field,
    stored: status,
    storedValue,
    ...(key !== undefined && { storedKey: key }),
    ...(shadowed.length > 0 && { shadowedKeys: shadowed }),
    inherited,
    inheritedSource,
  } as const;
  if (status === 'ok') return { ...base, value: storedValue as AttributeValue, source: 'instance' };
  if (status === 'null') return { ...base, value: null, source: 'instance' };
  return { ...base, value: inherited, source: inheritedSource };
}

const typeDefaultsOf = (schema: ProjectAttributeSchema, functionId: string | undefined) =>
  functionId !== undefined && own(schema.nodeTypeDefaults, functionId) ? schema.nodeTypeDefaults[functionId]! : {};

/** Every node field, in schema order, for one node. Unknown types simply have no type defaults. */
export function resolveNodeAttributes(schema: ProjectAttributeSchema, node: { readonly function: string; readonly custom: Stored }): EffectiveAttribute[] {
  const defaults = typeDefaultsOf(schema, node.function);
  return schema.nodes.map((field) => resolveField(field, node.custom, own(defaults, field.id) ? defaults[field.id] : undefined));
}

/** Every edge field, in schema order, for one edge (schema defaults only; kind is irrelevant). */
export function resolveEdgeAttributes(schema: ProjectAttributeSchema, edge: { readonly custom: Stored }): EffectiveAttribute[] {
  return schema.edges.map((field) => resolveField(field, edge.custom));
}

/** `key → effective value` for fields that have one (explicit null included). */
export function effectiveRecord(resolved: readonly EffectiveAttribute[]): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const r of resolved) if (r.value !== undefined) out[r.field.key] = r.value;
  return out;
}

export const effectiveNodeValues = (schema: ProjectAttributeSchema, node: { readonly function: string; readonly custom: Stored }) =>
  effectiveRecord(resolveNodeAttributes(schema, node));

export const effectiveEdgeValues = (schema: ProjectAttributeSchema, edge: { readonly custom: Stored }) =>
  effectiveRecord(resolveEdgeAttributes(schema, edge));

/**
 * Stored attributes that no field of the collection answers to (deleted fields, legacy data,
 * values from other projects). They are kept exactly as stored and never written implicitly.
 */
export function attributesOutsideSchema(
  schema: ProjectAttributeSchema,
  collection: AttributeCollection,
  attributes: { readonly [key: string]: AttributeValue },
): Record<string, AttributeValue> {
  const known = new Set(schema[collection].flatMap(fieldKeys));
  return Object.fromEntries(Object.entries(attributes).filter(([k]) => !known.has(k)));
}

/**
 * The attribute map after setting `field` to `value` (`undefined` = remove the instance value so
 * the inherited default applies again; `null` = explicit "no value"). The current key is written.
 * A former key is removed only when it held the value being replaced (or the same value as the
 * current key); a former key holding a DIFFERENT, hidden value is kept (no silent loss; it is
 * reported by conformance). All other attributes keep their values and order. The value is NOT
 * validated here (callers check `checkFieldValue` first).
 */
export function writeFieldValue(
  field: AttributeField,
  attributes: { readonly [key: string]: AttributeValue },
  value: AttributeValue | undefined,
): Record<string, AttributeValue> {
  const source = storedKeyOf(field, attributes);
  const sourceValue = source === undefined ? undefined : attributes[source];
  const keys = new Set(fieldKeys(field).filter((k) => k === field.key || k === source || attributes[k] === sourceValue));
  const out: Record<string, AttributeValue> = {};
  let written = false;
  for (const [k, v] of Object.entries(attributes)) {
    if (!keys.has(k)) out[k] = v;
    else if (k === field.key && value !== undefined) {
      out[k] = value;
      written = true;
    }
  }
  if (value !== undefined && !written) out[field.key] = value;
  return out;
}

/**
 * What views display for one node or edge: the effective value of every field that has one (in
 * schema order), followed by stored values outside the schema (legacy data, kept as stored).
 * Read-only presentation data; never written back.
 */
export function viewAttributes(
  schema: ProjectAttributeSchema,
  collection: AttributeCollection,
  item: { readonly function?: string; readonly custom: { readonly [key: string]: AttributeValue } },
): Record<string, AttributeValue> {
  const resolved = collection === 'nodes' ? resolveNodeAttributes(schema, { function: item.function ?? '', custom: item.custom }) : resolveEdgeAttributes(schema, item);
  return { ...effectiveRecord(resolved), ...attributesOutsideSchema(schema, collection, item.custom) };
}

/** Keys views may offer for display: every field key (schema order), then keys outside the schema in use. */
export function displayKeys(
  schema: ProjectAttributeSchema,
  collection: AttributeCollection,
  items: readonly { readonly custom: { readonly [key: string]: AttributeValue } }[],
): string[] {
  const fieldKeys = schema[collection].map((f) => f.key);
  const outside = new Set<string>();
  for (const item of items) for (const key of Object.keys(attributesOutsideSchema(schema, collection, item.custom))) outside.add(key);
  return [...fieldKeys, ...[...outside].sort()];
}
