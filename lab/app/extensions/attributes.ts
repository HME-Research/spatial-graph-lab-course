import type { AttributeValue } from '@app/document';
import type { AttributeSpec, AttributeSpecs } from '@student-api';

/**
 * The single implementation of typed-attribute semantics, shared by conformance checking,
 * parameter validation, `customOf` and transformation operations. Expects a definition that
 * has already passed runtime validation (definitions.ts).
 */

/** `missing`: absent or null. `invalid`: present but not acceptable for the spec. */
export type ValueStatus = 'ok' | 'missing' | 'invalid';

export function checkValue(spec: AttributeSpec, value: unknown): ValueStatus {
  if (value === undefined || value === null) return 'missing';
  switch (spec.kind) {
    case 'number':
      return typeof value === 'number' &&
        Number.isFinite(value) &&
        (spec.min === undefined || value >= spec.min) &&
        (spec.max === undefined || value <= spec.max)
        ? 'ok'
        : 'invalid';
    case 'text':
      return typeof value === 'string' ? 'ok' : 'invalid';
    case 'boolean':
      return typeof value === 'boolean' ? 'ok' : 'invalid';
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value) ? 'ok' : 'invalid';
  }
}

/** Human-readable description of what a spec accepts, for messages. */
export function describeSpec(spec: AttributeSpec): string {
  switch (spec.kind) {
    case 'number': {
      const range =
        spec.min !== undefined && spec.max !== undefined
          ? ` from ${spec.min} to ${spec.max}`
          : spec.min !== undefined
            ? ` ≥ ${spec.min}`
            : spec.max !== undefined
              ? ` ≤ ${spec.max}`
              : '';
      return `a number${range}`;
    }
    case 'text':
      return 'text';
    case 'boolean':
      return 'true or false';
    case 'enum':
      return `one of ${spec.values.map((v) => JSON.stringify(v)).join(', ')}`;
  }
}

const own = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** The declared spec for `key`, ignoring inherited properties such as "toString". */
export const specFor = (specs: AttributeSpecs, key: string): AttributeSpec | undefined =>
  own(specs, key) ? specs[key] : undefined;

/** Valid stored value, otherwise the default, otherwise undefined. */
export function effectiveValue(spec: AttributeSpec, stored: unknown): AttributeValue | undefined {
  return checkValue(spec, stored) === 'ok' ? (stored as AttributeValue) : spec.default;
}

/**
 * Effective values for every declared attribute (keys without a value are omitted). Never writes
 * to `stored`; undeclared stored attributes are not included.
 */
export function effectiveAttributes(
  specs: AttributeSpecs,
  stored: { readonly [key: string]: unknown },
): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const [key, spec] of Object.entries(specs)) {
    const value = effectiveValue(spec, own(stored, key) ? stored[key] : undefined);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
