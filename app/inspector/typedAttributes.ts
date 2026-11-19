import type { AttributeValue, Attributes } from '@app/document';
import type { RoomNode } from '@app/document/v2';
import type { DesignCommand } from '@app/spatial';
import { checkValue, describeSpec, specFor, type AttributeSpec, type AttributeSpecs, type ValueStatus } from '@app/extensions';
import { rowsToAttributes, type AttributeRow, type ParseResult } from './inspectorModel';

/** The one command these helpers build. */
export type SetAttributesCommand = Extract<DesignCommand, { readonly type: 'set-node-attributes' }>;

/** What the helpers read from a room. */
export type AttributedNode = Pick<RoomNode, 'id' | 'typeId' | 'attributes'>;

/**
 * Pure helpers for the type-aware part of the inspector. Typed-attribute semantics (what a value
 * must be, defaults) are the Stage 3A runtime's (`checkValue`, `describeSpec`, `specFor`); nothing
 * here re-implements them. Every edit becomes one `set-node-attributes` command that keeps all
 * other stored attributes — declared, invalid, undeclared or legacy — exactly as they are, and
 * no default is ever written implicitly.
 */

const own = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

export interface TypedField {
  readonly key: string;
  readonly spec: AttributeSpec;
  /** The stored value; undefined when the attribute is absent. */
  readonly stored: AttributeValue | undefined;
  /** `missing`: absent or null; `invalid`: stored but not acceptable (kept, flagged). */
  readonly status: ValueStatus;
  /** Shown as a hint only; never written by the inspector. */
  readonly defaultValue: AttributeValue | undefined;
  /** What the value must be, e.g. `one of "high", "medium", "low"`. */
  readonly accepts: string;
}

/** One field per declared attribute, in declaration order. */
export function typedFields(specs: AttributeSpecs, attributes: Attributes): TypedField[] {
  return Object.entries(specs).map(([key, spec]) => {
    const stored = own(attributes, key) ? attributes[key] : undefined;
    return { key, spec, stored, status: checkValue(spec, stored), defaultValue: spec.default, accepts: describeSpec(spec) };
  });
}

/** Stored attributes the type does not declare (kept unchanged; edited as free-form rows). */
export function undeclaredAttributes(specs: AttributeSpecs, attributes: Attributes): Attributes {
  return Object.fromEntries(Object.entries(attributes).filter(([key]) => !specFor(specs, key)));
}

/**
 * Value typed into a field's control, converted by kind only. Number text that is not a number
 * yields NaN, which `checkValue` rejects with the field's own description.
 */
export function parseFieldDraft(spec: AttributeSpec, draft: string): AttributeValue {
  switch (spec.kind) {
    case 'number':
      return draft.trim() === '' ? Number.NaN : Number(draft.trim());
    case 'boolean':
      return draft === 'true' ? true : draft === 'false' ? false : draft;
    case 'text':
    case 'enum':
      return draft;
  }
}

/** Text shown in a field's control for a stored value (empty when absent or null). */
export const fieldDraft = (field: TypedField): string =>
  field.stored === undefined || field.stored === null ? '' : String(field.stored);

/**
 * Command that sets declared attribute `key` to `value`, or removes it when `value` is undefined
 * (back to "no value": the default, if any, applies on read). The value must be valid for the
 * declaration. All other stored attributes are kept, in their original order.
 */
export function setTypedAttributeCommand(
  node: AttributedNode,
  specs: AttributeSpecs,
  key: string,
  value: AttributeValue | undefined,
): ParseResult<SetAttributesCommand> {
  const spec = specFor(specs, key);
  if (!spec) return { ok: false, message: `"${key}" is not declared by type "${node.typeId}"` };
  if (value !== undefined && checkValue(spec, value) !== 'ok') {
    return { ok: false, message: `"${key}" must be ${describeSpec(spec)}` };
  }
  const attributes: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(node.attributes)) {
    if (k !== key) attributes[k] = v;
    else if (value !== undefined) attributes[k] = value;
  }
  if (value !== undefined && !own(node.attributes, key)) attributes[key] = value;
  return { ok: true, value: { type: 'set-node-attributes', nodeId: node.id, attributes } };
}

/**
 * Command that replaces the node's undeclared attributes with `rows` (the free-form editor)
 * while keeping every declared attribute exactly as stored. A row may not use a declared name.
 */
export function setUndeclaredAttributesCommand(
  node: AttributedNode,
  specs: AttributeSpecs,
  rows: readonly AttributeRow[],
): ParseResult<SetAttributesCommand> {
  const parsed = rowsToAttributes(rows);
  if (!parsed.ok) return parsed;
  const clash = Object.keys(parsed.value).find((key) => specFor(specs, key));
  if (clash !== undefined) {
    return { ok: false, message: `"${clash}" is declared by type "${node.typeId}": edit it in the typed fields above` };
  }
  // Original order: declared values stay in place, kept free-form keys too; new keys go last.
  const attributes: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(node.attributes)) {
    if (specFor(specs, k)) attributes[k] = v;
    else if (own(parsed.value, k)) attributes[k] = parsed.value[k]!;
  }
  for (const [k, v] of Object.entries(parsed.value)) if (!own(attributes, k)) attributes[k] = v;
  return { ok: true, value: { type: 'set-node-attributes', nodeId: node.id, attributes } };
}
