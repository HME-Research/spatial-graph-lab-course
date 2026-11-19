import type { AttributeValue } from '@app/document';
import { checkFieldValue, describeField, writeFieldValue, type AttributeField } from '@app/extensions';
import type { DesignCommand } from '@app/spatial';

/**
 * Commands that change ONE custom value of one node or edge (docs/PROJECT-ATTRIBUTES.md). Each is
 * one `set-node-attributes` / `set-edge-attributes` command, so one edit = one undo step.
 *
 * - `value` = a valid value: an explicit instance value (override);
 * - `value` = null: explicit "no value" (overrides any default);
 * - `value` = undefined: clear the override — the type or field default applies again.
 *
 * All other stored attributes (other fields, values outside the schema) are kept as stored.
 */

export type FieldCommandResult = { readonly ok: true; readonly command: DesignCommand } | { readonly ok: false; readonly message: string };

type Stored = { readonly [key: string]: AttributeValue };

function check(field: AttributeField, value: AttributeValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  return checkFieldValue(field, value) === 'ok' ? null : `“${field.label}” must be ${describeField(field)}`;
}

export function setNodeFieldCommand(node: { readonly id: number; readonly attributes: Stored }, field: AttributeField, value: AttributeValue | undefined): FieldCommandResult {
  const problem = check(field, value);
  if (problem) return { ok: false, message: problem };
  return { ok: true, command: { type: 'set-node-attributes', nodeId: node.id, attributes: writeFieldValue(field, node.attributes, value) } };
}

export function setEdgeFieldCommand(edge: { readonly id: number; readonly attributes: Stored }, field: AttributeField, value: AttributeValue | undefined): FieldCommandResult {
  const problem = check(field, value);
  if (problem) return { ok: false, message: problem };
  return { ok: true, command: { type: 'set-edge-attributes', edgeId: edge.id, attributes: writeFieldValue(field, edge.attributes, value) } };
}
