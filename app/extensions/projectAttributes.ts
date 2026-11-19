import { z } from 'zod';
import { typeIdSchema, type AttributeValue } from '@app/document';
import { zodMessages } from './definitions';
import { toolkitIdSchema } from './discover';
import { diagnostic, fail, ok, type ExtensionDiagnostic, type ExtensionResult } from './diagnostics';

/**
 * Project-wide custom attribute schema — the contract (Phase 01 of the next-development
 * programme; see docs/PROJECT-ATTRIBUTES.md).
 *
 * - The schema belongs to the PROJECT. Every node of every design in the project has the same
 *   node fields; every edge has the same edge fields. The two collections are disjoint.
 * - Designs store instance values only, sparsely, in the existing v2 `attributes` maps, keyed by
 *   the field's current `key` (or a former key, see `formerKeys`). Designs never store schema.
 * - Each field has a permanent `id` (identity across renames) and a `key` (the JSON attribute
 *   name). Renaming changes `key` and records the old key in `formerKeys`, so values stored under
 *   it are still read; nothing in any design is rewritten.
 * - Node types may give a field a different default (`nodeTypeDefaults[typeId][fieldId]`). Type
 *   defaults never add or remove fields. Edges have schema defaults only.
 * - System properties (ids, type, geometry, endpoints, kind, corridor …) are reserved and
 *   can never be schema fields.
 *
 * Pure: no storage, React or Three.js. Persistence lives in app/session/projectAttributeStore.ts.
 */

export type AttributeCollection = 'nodes' | 'edges';
export const ATTRIBUTE_COLLECTIONS: readonly AttributeCollection[] = ['nodes', 'edges'];

export const FIELD_KINDS = ['text', 'number', 'boolean', 'enum'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** A non-null attribute value: what a default can be. */
export type DefaultValue = Exclude<AttributeValue, null>;

export interface AttributeField {
  /** Permanent identity; never changes while the field exists; unique in its collection (a deleted field's id may be reused — nothing persistent refers to it). */
  readonly id: string;
  /** JSON attribute name in designs (unique in the collection, ignoring case). */
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
  /** enum only: the allowed values. */
  readonly values?: readonly string[];
  /** number only: inclusive bounds. */
  readonly min?: number;
  readonly max?: number;
  /** Schema default (applies to every node/edge without an instance value or type default). */
  readonly default?: DefaultValue;
  readonly description?: string;
  /** Keys the field had before renames, newest first. Values stored under them are still read. */
  readonly formerKeys?: readonly string[];
}

export interface ProjectAttributeSchema {
  readonly nodes: readonly AttributeField[];
  readonly edges: readonly AttributeField[];
  /** typeId → fieldId → default for nodes of that type. Only node fields; never adds fields. */
  readonly nodeTypeDefaults: { readonly [typeId: string]: { readonly [fieldId: string]: DefaultValue } };
}

export const EMPTY_ATTRIBUTE_SCHEMA: ProjectAttributeSchema = Object.freeze({ nodes: [], edges: [], nodeTypeDefaults: {} });

// ---------------------------------------------------------------------------------------------
// Names

/**
 * Keys that name system properties or JavaScript internals. Compared case-insensitively. They are
 * never custom fields, so Properties always shows them separately and the schema editor cannot
 * delete or redefine them.
 */
export const RESERVED_ATTRIBUTE_KEYS: readonly string[] = [
  // node system properties
  'id',
  'displayid',
  'typeid',
  'type',
  'grid',
  'size',
  'position',
  'diagram',
  'attributes',
  // edge system properties
  'source',
  'target',
  'kind',
  'corridor',
  // JavaScript object internals
  '__proto__',
  'constructor',
  'prototype',
  'tostring',
  'valueof',
  'hasownproperty',
];

export const ATTRIBUTE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export const isReservedKey = (key: string): boolean => RESERVED_ATTRIBUTE_KEYS.includes(key.toLowerCase());

/** Why `key` cannot be a field key at all (independent of other fields), or null. */
export function keyProblem(key: string): string | null {
  if (key.trim() === '') return 'the key must not be empty';
  if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
    return `"${key}" is not a valid key: use 1–40 letters, digits or "_", starting with a letter (e.g. "capacity")`;
  }
  if (isReservedKey(key)) return `"${key}" is reserved for a built-in property and cannot be a custom field`;
  return null;
}

/** Every key a field answers to: its current key, then former keys (newest first). */
export const fieldKeys = (field: AttributeField): readonly string[] => [field.key, ...(field.formerKeys ?? [])];

// ---------------------------------------------------------------------------------------------
// Values

/** `missing`: absent or null. `invalid`: present but not acceptable for the field. */
export type FieldValueStatus = 'ok' | 'missing' | 'invalid';

export function checkFieldValue(field: Pick<AttributeField, 'kind' | 'values' | 'min' | 'max'>, value: unknown): FieldValueStatus {
  if (value === undefined || value === null) return 'missing';
  switch (field.kind) {
    case 'number':
      return typeof value === 'number' &&
        Number.isFinite(value) &&
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max)
        ? 'ok'
        : 'invalid';
    case 'text':
      return typeof value === 'string' ? 'ok' : 'invalid';
    case 'boolean':
      return typeof value === 'boolean' ? 'ok' : 'invalid';
    case 'enum':
      return typeof value === 'string' && (field.values ?? []).includes(value) ? 'ok' : 'invalid';
  }
}

/** What a field accepts, for messages: "a number ≥ 0", "one of "high", "low"". */
export function describeField(field: Pick<AttributeField, 'kind' | 'values' | 'min' | 'max'>): string {
  switch (field.kind) {
    case 'number': {
      const { min, max } = field;
      const range =
        min !== undefined && max !== undefined ? ` from ${min} to ${max}` : min !== undefined ? ` ≥ ${min}` : max !== undefined ? ` ≤ ${max}` : '';
      return `a number${range}`;
    }
    case 'text':
      return 'text';
    case 'boolean':
      return 'true or false';
    case 'enum':
      return `one of ${(field.values ?? []).map((v) => JSON.stringify(v)).join(', ')}`;
  }
}

export const FIELD_KIND_LABELS: Readonly<Record<FieldKind, string>> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Yes / no',
  enum: 'Choice',
};

// ---------------------------------------------------------------------------------------------
// Validation of a whole schema (imports, stored records, results of edits)

const finite = z.number().refine(Number.isFinite, { error: 'must be a finite number' });
const defaultValueSchema = z.union([z.string(), finite, z.boolean()], { error: 'a default must be text, a number or true/false' });

const fieldSchema = z.strictObject({
  id: z.string().regex(FIELD_ID_PATTERN, { error: 'field id must be 1–64 letters, digits, "_" or "-", starting with a letter' }),
  key: z.string(),
  label: z.string().min(1, { error: 'label must not be empty' }).max(100),
  kind: z.enum(FIELD_KINDS, { error: `kind must be one of: ${FIELD_KINDS.join(', ')}` }),
  values: z.array(z.string().min(1, { error: 'choice values must not be empty' })).min(1).optional(),
  min: finite.optional(),
  max: finite.optional(),
  default: defaultValueSchema.optional(),
  description: z.string().max(500).optional(),
  formerKeys: z.array(z.string()).optional(),
});

const schemaShape = z.strictObject({
  nodes: z.array(fieldSchema),
  edges: z.array(fieldSchema),
  nodeTypeDefaults: z.record(typeIdSchema, z.record(z.string(), defaultValueSchema)).default({}),
});

/** Structural problems that Zod cannot express (uniqueness, kinds, defaults, references). */
export function schemaProblems(schema: ProjectAttributeSchema): string[] {
  const problems: string[] = [];
  for (const collection of ATTRIBUTE_COLLECTIONS) {
    const ids = new Set<string>();
    const keys = new Map<string, string>(); // lower-case key → field id
    for (const [i, field] of schema[collection].entries()) {
      const where = `${collection}[${i}] ("${field.key}")`;
      if (ids.has(field.id)) problems.push(`${where}: field id "${field.id}" is used twice`);
      ids.add(field.id);
      const ownKeys = fieldKeys(field);
      for (const [n, key] of ownKeys.entries()) {
        const problem = keyProblem(key);
        if (problem) problems.push(`${where}: ${n === 0 ? '' : 'former key: '}${problem}`);
        const other = keys.get(key.toLowerCase());
        if (other !== undefined && other !== field.id) problems.push(`${where}: key "${key}" is already used by another ${collection === 'nodes' ? 'node' : 'edge'} field`);
        else if (other === field.id && n > 0) problems.push(`${where}: key "${key}" appears twice in this field`);
        keys.set(key.toLowerCase(), field.id);
      }
      if (field.kind === 'enum') {
        if (!field.values || field.values.length === 0) problems.push(`${where}: a choice field needs at least one value`);
        else if (new Set(field.values).size !== field.values.length) problems.push(`${where}: choice values must be unique`);
      } else if (field.values !== undefined) problems.push(`${where}: only choice fields have values`);
      if (field.kind !== 'number' && (field.min !== undefined || field.max !== undefined)) problems.push(`${where}: only number fields have min/max`);
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) problems.push(`${where}: min is greater than max`);
      if (field.default !== undefined && checkFieldValue(field, field.default) !== 'ok') {
        problems.push(`${where}: default ${JSON.stringify(field.default)} must be ${describeField(field)}`);
      }
    }
  }
  const nodeFields = new Map(schema.nodes.map((f) => [f.id, f] as const));
  for (const [typeId, defaults] of Object.entries(schema.nodeTypeDefaults)) {
    for (const [fieldId, value] of Object.entries(defaults)) {
      const field = nodeFields.get(fieldId);
      if (!field) problems.push(`nodeTypeDefaults.${typeId}.${fieldId}: there is no node field with id "${fieldId}"`);
      else if (checkFieldValue(field, value) !== 'ok') {
        problems.push(`nodeTypeDefaults.${typeId}.${fieldId}: ${JSON.stringify(value)} must be ${describeField(field)}`);
      }
    }
  }
  return problems;
}

/** Validate unknown data as a schema. Never throws. */
export function parseAttributeSchema(raw: unknown): { ok: true; value: ProjectAttributeSchema } | { ok: false; problems: string[] } {
  const parsed = schemaShape.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: zodMessages(parsed.error.issues) };
  const schema = normaliseSchema(parsed.data as ProjectAttributeSchema);
  const problems = schemaProblems(schema);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: schema };
}

/** Drop empty optional parts so equal schemas have equal signatures. */
export function normaliseSchema(schema: ProjectAttributeSchema): ProjectAttributeSchema {
  const field = (f: AttributeField): AttributeField => ({
    id: f.id,
    key: f.key,
    label: f.label,
    kind: f.kind,
    ...(f.values !== undefined && { values: [...f.values] }),
    ...(f.min !== undefined && { min: f.min }),
    ...(f.max !== undefined && { max: f.max }),
    ...(f.default !== undefined && { default: f.default }),
    ...(f.description !== undefined && f.description !== '' && { description: f.description }),
    ...(f.formerKeys !== undefined && f.formerKeys.length > 0 && { formerKeys: [...f.formerKeys] }),
  });
  const nodeTypeDefaults: Record<string, Record<string, DefaultValue>> = {};
  for (const typeId of Object.keys(schema.nodeTypeDefaults).sort()) {
    const entries = Object.entries(schema.nodeTypeDefaults[typeId] ?? {});
    if (entries.length > 0) nodeTypeDefaults[typeId] = Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return { nodes: schema.nodes.map(field), edges: schema.edges.map(field), nodeTypeDefaults };
}

/** Deterministic text identity of a schema (field order is significant). */
export const schemaSignature = (schema: ProjectAttributeSchema): string => JSON.stringify(normaliseSchema(schema));

export const findField = (schema: ProjectAttributeSchema, collection: AttributeCollection, fieldId: string): AttributeField | undefined =>
  schema[collection].find((f) => f.id === fieldId);

/** The field that answers to `key` (current or former key, case-sensitive as stored), if any. */
export const fieldForKey = (schema: ProjectAttributeSchema, collection: AttributeCollection, key: string): AttributeField | undefined =>
  schema[collection].find((f) => f.key === key) ?? schema[collection].find((f) => (f.formerKeys ?? []).includes(key));

// ---------------------------------------------------------------------------------------------
// The persisted / exported record

export const ATTRIBUTE_RECORD_FORMAT = 'spatial-graph-lab/project-attributes';
export const ATTRIBUTE_RECORD_VERSION = 1;

/**
 * What is stored in the browser for a project and what Export/Import exchange. `baseline` is the
 * signature of the schema derived from the toolkit's files when this record was created or last
 * merged with them: if the files change later, the app can tell (and offer an explicit merge).
 */
export interface ProjectAttributeRecord {
  readonly format: typeof ATTRIBUTE_RECORD_FORMAT;
  readonly formatVersion: typeof ATTRIBUTE_RECORD_VERSION;
  readonly projectId: string;
  readonly schema: ProjectAttributeSchema;
  readonly baseline: string;
  /** ISO time of the last change (informational only). */
  readonly savedAt?: string;
}

const recordShape = z.strictObject({
  format: z.literal(ATTRIBUTE_RECORD_FORMAT, { error: `not a Spatial Graph Lab project attribute file (format must be "${ATTRIBUTE_RECORD_FORMAT}")` }),
  formatVersion: z.number(),
  // Owner scope: the toolkit id, or the saved project's own id when it has no toolkit.
  projectId: toolkitIdSchema,
  schema: z.unknown(),
  baseline: z.string(),
  savedAt: z.string().optional(),
});

export function makeAttributeRecord(projectId: string, schema: ProjectAttributeSchema, baseline: string, savedAt?: string): ProjectAttributeRecord {
  return {
    format: ATTRIBUTE_RECORD_FORMAT,
    formatVersion: ATTRIBUTE_RECORD_VERSION,
    projectId,
    schema: normaliseSchema(schema),
    baseline,
    ...(savedAt !== undefined && { savedAt }),
  };
}

/** Canonical JSON text of a record (stable key order, trailing newline). */
export function serializeAttributeRecord(record: ProjectAttributeRecord): string {
  const { format, formatVersion, projectId, baseline, savedAt } = record;
  return `${JSON.stringify({ format, formatVersion, projectId, schema: normaliseSchema(record.schema), baseline, ...(savedAt !== undefined && { savedAt }) }, null, 2)}\n`;
}

export interface ReadRecordOptions {
  /** The project the record must belong to. */
  readonly projectId: string;
  /** Accept a record of a different project (an explicit user decision). */
  readonly allowOtherProject?: boolean;
}

/**
 * Read a stored or imported record. Checks JSON, format, version, project id and the schema
 * itself; every failure is an error diagnostic and nothing is returned.
 */
export function readAttributeRecord(text: string, options: ReadRecordOptions): ExtensionResult<ProjectAttributeRecord> {
  const subject = { kind: 'toolkit', id: options.projectId } as const;
  const err = (code: 'invalid-attribute-schema' | 'attribute-schema-project-mismatch' | 'attribute-schema-version', message: string, detail?: string) =>
    fail<ProjectAttributeRecord>([diagnostic(code, 'error', subject, message, detail !== undefined ? { detail } : {})]);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return err('invalid-attribute-schema', `the attribute file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = recordShape.safeParse(raw);
  if (!parsed.success) return err('invalid-attribute-schema', `the attribute file is invalid: ${zodMessages(parsed.error.issues).join('; ')}`);
  const data = parsed.data;
  if (data.formatVersion !== ATTRIBUTE_RECORD_VERSION) {
    return err(
      'attribute-schema-version',
      `the attribute file has format version ${data.formatVersion}; this app reads version ${ATTRIBUTE_RECORD_VERSION} only`,
    );
  }
  if (data.projectId !== options.projectId && !options.allowOtherProject) {
    return err(
      'attribute-schema-project-mismatch',
      `the attribute file belongs to project "${data.projectId}", not "${options.projectId}"`,
      data.projectId,
    );
  }
  const schema = parseAttributeSchema(data.schema);
  if (!schema.ok) return err('invalid-attribute-schema', `the attribute schema is invalid: ${schema.problems.join('; ')}`);
  return ok(makeAttributeRecord(options.projectId, schema.value, data.baseline, data.savedAt));
}

export type { ExtensionDiagnostic };
