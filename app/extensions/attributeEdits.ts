import type { AttributeValue } from '@app/document';
import type { ActiveProject } from './activate';
import {
  checkFieldValue,
  describeField,
  FIELD_KIND_LABELS,
  fieldKeys,
  findField,
  keyProblem,
  normaliseSchema,
  parseAttributeSchema,
  type AttributeCollection,
  type AttributeField,
  type DefaultValue,
  type FieldKind,
  type ProjectAttributeSchema,
} from './projectAttributes';
import { humanizeKey } from './attributeBaseline';
import { storedKeyOf } from './resolveAttributes';

/**
 * Pure edit operations on a project attribute schema. Each returns the new (validated) schema
 * and a history label, or a refusal with a plain-language reason. Nothing here touches designs:
 * stored values are never rewritten, renamed or deleted by a schema edit (see projectAttributes).
 *
 * Safety rules (docs/PROJECT-ATTRIBUTES.md):
 * - keys are unique per collection, ignoring case, including former keys of other fields;
 * - system property names are reserved;
 * - a change that would make a known stored value or a default invalid is refused — no
 *   coercion, no silent data loss. "Known" = the designs passed in `usage` (the open design and
 *   the project's design files); other exported files are checked when they are opened, where
 *   invalid values are kept and flagged, never dropped.
 */

export interface NewField {
  readonly key: string;
  readonly label?: string;
  readonly kind: FieldKind;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly default?: DefaultValue;
  readonly description?: string;
}

/** `null` removes an optional part. */
export interface FieldPatch {
  readonly label?: string;
  readonly description?: string | null;
  readonly default?: DefaultValue | null;
  readonly values?: readonly string[];
  readonly min?: number | null;
  readonly max?: number | null;
}

export type SchemaEdit =
  | { readonly type: 'add-field'; readonly collection: AttributeCollection; readonly field: NewField }
  | { readonly type: 'update-field'; readonly collection: AttributeCollection; readonly fieldId: string; readonly patch: FieldPatch }
  | { readonly type: 'rename-field'; readonly collection: AttributeCollection; readonly fieldId: string; readonly key: string }
  | {
      readonly type: 'change-field-kind';
      readonly collection: AttributeCollection;
      readonly fieldId: string;
      readonly kind: FieldKind;
      readonly values?: readonly string[];
      readonly min?: number;
      readonly max?: number;
    }
  | { readonly type: 'delete-field'; readonly collection: AttributeCollection; readonly fieldId: string }
  | { readonly type: 'move-field'; readonly collection: AttributeCollection; readonly fieldId: string; readonly toIndex: number }
  /** `value: null` removes the type default (the schema default applies again). */
  | { readonly type: 'set-type-default'; readonly typeId: string; readonly fieldId: string; readonly value: DefaultValue | null };

export type EditOutcome =
  | { readonly ok: true; readonly schema: ProjectAttributeSchema; readonly label: string; readonly fieldId?: string }
  | { readonly ok: false; readonly reason: string };

/** Designs whose stored values an edit must respect. */
export interface DesignSample {
  readonly id: string;
  /** Human name, e.g. "two-storey-example (open)". */
  readonly label: string;
  readonly nodes: readonly { readonly id: string; readonly typeId: string; readonly attributes: { readonly [key: string]: AttributeValue } }[];
  readonly edges: readonly { readonly id: string; readonly attributes: { readonly [key: string]: AttributeValue } }[];
}

export interface EditContext {
  readonly usage?: readonly DesignSample[];
}

const what = (collection: AttributeCollection) => (collection === 'nodes' ? 'node' : 'edge');
const refuse = (reason: string): EditOutcome => ({ ok: false, reason });

/** Why `key` cannot be used by field `selfId` (null: it can). */
export function keyConflict(schema: ProjectAttributeSchema, collection: AttributeCollection, key: string, selfId?: string): string | null {
  const problem = keyProblem(key);
  if (problem) return problem;
  for (const field of schema[collection]) {
    if (field.id === selfId) continue;
    if (field.key.toLowerCase() === key.toLowerCase()) return `another ${what(collection)} field already uses the key "${field.key}"`;
    if ((field.formerKeys ?? []).some((k) => k.toLowerCase() === key.toLowerCase())) {
      return `"${key}" is a former key of the ${what(collection)} field "${field.key}" (values stored under it belong to that field)`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Usage

export interface FieldUsageEntry {
  readonly designId: string;
  readonly label: string;
  /** Instances that store a value for the field (including explicit null). */
  readonly count: number;
}

export interface FieldUsage {
  readonly designs: readonly FieldUsageEntry[];
  readonly total: number;
  /** Every stored non-null value (for kind/limit checks). */
  readonly values: readonly unknown[];
}

/**
 * The designs whose values schema edits must respect: the project's valid design files plus the
 * open design. When the open design was loaded from one of those files, the open (possibly
 * edited) version replaces the file's version.
 */
export function designSamples(
  project: Pick<ActiveProject, 'designs'> | null,
  open: { readonly doc: Omit<DesignSample, 'id' | 'label'>; readonly source: string } | null,
): DesignSample[] {
  const out: DesignSample[] = [];
  for (const design of project?.designs ?? []) {
    if (!design.result.ok || design.file === open?.source) continue;
    out.push({ id: design.id, label: design.id, nodes: design.result.value.nodes, edges: design.result.value.edges });
  }
  if (open) {
    const name = open.source.split('/').pop()?.replace(/\.json$/, '') ?? open.source;
    out.unshift({ id: `open:${open.source}`, label: `${name} (open)`, nodes: open.doc.nodes, edges: open.doc.edges });
  }
  return out;
}

export function fieldUsage(field: AttributeField, collection: AttributeCollection, designs: readonly DesignSample[] = []): FieldUsage {
  const values: unknown[] = [];
  const entries: FieldUsageEntry[] = [];
  for (const design of designs) {
    let count = 0;
    for (const item of design[collection]) {
      const key = storedKeyOf(field, item.attributes);
      if (key === undefined) continue;
      count++;
      if (item.attributes[key] !== null) values.push(item.attributes[key]);
    }
    if (count > 0) entries.push({ designId: design.id, label: design.label, count });
  }
  return { designs: entries, total: entries.reduce((n, e) => n + e.count, 0), values };
}

/** Stored values that would be invalid under `candidate` (field shape after an edit). */
function invalidUnder(candidate: AttributeField, usage: FieldUsage): unknown[] {
  return usage.values.filter((v) => checkFieldValue(candidate, v) !== 'ok');
}

const preview = (values: readonly unknown[]) =>
  `${values
    .slice(0, 3)
    .map((v) => JSON.stringify(v))
    .join(', ')}${values.length > 3 ? ', …' : ''}`;

/** Type defaults of `fieldId` that are not valid for `candidate`. */
function invalidTypeDefaults(schema: ProjectAttributeSchema, candidate: AttributeField): string[] {
  return Object.entries(schema.nodeTypeDefaults)
    .filter(([, defaults]) => Object.prototype.hasOwnProperty.call(defaults, candidate.id) && checkFieldValue(candidate, defaults[candidate.id]) !== 'ok')
    .map(([typeId]) => typeId);
}

/** Refusal text if `candidate` would invalidate defaults or known stored values, else null. */
function shapeChangeProblem(schema: ProjectAttributeSchema, collection: AttributeCollection, candidate: AttributeField, context: EditContext): string | null {
  if (candidate.default !== undefined && checkFieldValue(candidate, candidate.default) !== 'ok') {
    return `the default ${JSON.stringify(candidate.default)} would not be ${describeField(candidate)}; change or remove the default first`;
  }
  if (collection === 'nodes') {
    const types = invalidTypeDefaults(schema, candidate);
    if (types.length > 0) return `the default for type${types.length === 1 ? '' : 's'} ${types.map((t) => `“${t}”`).join(', ')} would not be ${describeField(candidate)}; change or remove ${types.length === 1 ? 'it' : 'them'} first`;
  }
  const usage = fieldUsage(candidate, collection, context.usage);
  const bad = invalidUnder(candidate, usage);
  if (bad.length > 0) {
    return `${bad.length} stored value${bad.length === 1 ? '' : 's'} (${preview(bad)}) would not be ${describeField(candidate)}. Values are never converted automatically: change ${bad.length === 1 ? 'it' : 'them'} first, or add a new field instead`;
  }
  return null;
}

/**
 * Every edit result goes through the SAME validation as a stored or imported record (Zod limits
 * plus structural rules), so an edit can never produce a schema that fails to load again.
 */
function finish(schema: ProjectAttributeSchema, label: string, fieldId?: string): EditOutcome {
  const parsed = parseAttributeSchema(normaliseSchema(schema));
  if (!parsed.ok) return refuse(parsed.problems.join('; '));
  return { ok: true, schema: parsed.value, label, ...(fieldId !== undefined && { fieldId }) };
}

function replaceField(schema: ProjectAttributeSchema, collection: AttributeCollection, field: AttributeField): ProjectAttributeSchema {
  return { ...schema, [collection]: schema[collection].map((f) => (f.id === field.id ? field : f)) };
}

function withoutOptional(field: AttributeField, keys: readonly ('values' | 'min' | 'max' | 'default' | 'description')[]): AttributeField {
  const out: Record<string, unknown> = { ...field };
  for (const k of keys) delete out[k];
  return out as unknown as AttributeField;
}

/** A field id derived from the key, unique in the collection. */
export function newFieldId(schema: ProjectAttributeSchema, collection: AttributeCollection, key: string): string {
  let id = key;
  for (let n = 2; schema[collection].some((f) => f.id === id); n++) id = `${key}-${n}`;
  return id;
}

export function applySchemaEdit(schema: ProjectAttributeSchema, edit: SchemaEdit, context: EditContext = {}): EditOutcome {
  switch (edit.type) {
    case 'add-field': {
      const { collection, field: input } = edit;
      const conflict = keyConflict(schema, collection, input.key);
      if (conflict) return refuse(conflict);
      const label = (input.label ?? '').trim() || humanizeKey(input.key);
      const field: AttributeField = {
        id: newFieldId(schema, collection, input.key),
        key: input.key,
        label,
        kind: input.kind,
        ...(input.kind === 'enum' && { values: [...(input.values ?? [])] }),
        ...(input.kind === 'number' && input.min !== undefined && { min: input.min }),
        ...(input.kind === 'number' && input.max !== undefined && { max: input.max }),
        ...(input.default !== undefined && { default: input.default }),
        ...(input.description !== undefined && input.description.trim() !== '' && { description: input.description.trim() }),
      };
      if (field.kind === 'enum' && (field.values ?? []).length === 0) return refuse('a choice field needs at least one value');
      const problem = shapeChangeProblem(schema, collection, field, context);
      if (problem) return refuse(problem);
      return finish({ ...schema, [collection]: [...schema[collection], field] }, `Add ${what(collection)} field “${field.key}”`, field.id);
    }

    case 'update-field': {
      const { collection, fieldId, patch } = edit;
      const field = findField(schema, collection, fieldId);
      if (!field) return refuse(`there is no ${what(collection)} field with id "${fieldId}"`);
      let next: AttributeField = { ...field };
      if (patch.label !== undefined) {
        if (patch.label.trim() === '') return refuse('the label must not be empty');
        next = { ...next, label: patch.label.trim() };
      }
      if (patch.description !== undefined) {
        next = patch.description === null || patch.description.trim() === '' ? withoutOptional(next, ['description']) : { ...next, description: patch.description.trim() };
      }
      if (patch.values !== undefined) {
        if (field.kind !== 'enum') return refuse('only choice fields have values');
        if (patch.values.length === 0) return refuse('a choice field needs at least one value');
        next = { ...next, values: [...patch.values] };
      }
      for (const bound of ['min', 'max'] as const) {
        const v = patch[bound];
        if (v === undefined) continue;
        if (field.kind !== 'number') return refuse('only number fields have min/max');
        next = v === null ? withoutOptional(next, [bound]) : { ...next, [bound]: v };
      }
      if (next.min !== undefined && next.max !== undefined && next.min > next.max) return refuse(`min (${next.min}) is greater than max (${next.max})`);
      if (patch.default !== undefined) next = patch.default === null ? withoutOptional(next, ['default']) : { ...next, default: patch.default };
      const problem = shapeChangeProblem(schema, collection, next, context);
      if (problem) return refuse(problem);
      return finish(replaceField(schema, collection, next), `Edit ${what(collection)} field “${field.key}”`, field.id);
    }

    case 'rename-field': {
      const { collection, fieldId, key } = edit;
      const field = findField(schema, collection, fieldId);
      if (!field) return refuse(`there is no ${what(collection)} field with id "${fieldId}"`);
      if (key === field.key) return refuse(`the field is already called "${key}"`);
      if (key.toLowerCase() === field.key.toLowerCase()) {
        return refuse(`"${key}" differs from "${field.key}" only in upper/lower case; keys ignore case, so choose a different name`);
      }
      const conflict = keyConflict(schema, collection, key, field.id);
      if (conflict) return refuse(conflict);
      // Renaming back to a former key makes it current again; the old current key becomes former.
      const former = [field.key, ...(field.formerKeys ?? []).filter((k) => k.toLowerCase() !== key.toLowerCase())];
      const next: AttributeField = { ...field, key, formerKeys: former, ...(field.label === field.key && { label: key }) };
      return finish(replaceField(schema, collection, next), `Rename ${what(collection)} field “${field.key}” to “${key}”`, field.id);
    }

    case 'change-field-kind': {
      const { collection, fieldId, kind } = edit;
      const field = findField(schema, collection, fieldId);
      if (!field) return refuse(`there is no ${what(collection)} field with id "${fieldId}"`);
      if (kind === field.kind) return refuse(`the field is already ${FIELD_KIND_LABELS[kind]}`);
      let next = withoutOptional(field, ['values', 'min', 'max']);
      next = { ...next, kind };
      if (kind === 'enum') {
        if (!edit.values || edit.values.length === 0) return refuse('a choice field needs at least one value');
        next = { ...next, values: [...edit.values] };
      }
      if (kind === 'number') {
        if (edit.min !== undefined) next = { ...next, min: edit.min };
        if (edit.max !== undefined) next = { ...next, max: edit.max };
      }
      const problem = shapeChangeProblem(schema, collection, next, context);
      if (problem) return refuse(`“${field.key}” cannot become ${FIELD_KIND_LABELS[kind]}: ${problem}`);
      return finish(replaceField(schema, collection, next), `Change ${what(collection)} field “${field.key}” to ${FIELD_KIND_LABELS[kind]}`, field.id);
    }

    case 'delete-field': {
      const { collection, fieldId } = edit;
      const field = findField(schema, collection, fieldId);
      if (!field) return refuse(`there is no ${what(collection)} field with id "${fieldId}"`);
      const nodeTypeDefaults =
        collection === 'nodes'
          ? Object.fromEntries(
              Object.entries(schema.nodeTypeDefaults).map(([typeId, d]) => [typeId, Object.fromEntries(Object.entries(d).filter(([id]) => id !== fieldId))]),
            )
          : schema.nodeTypeDefaults;
      return finish(
        { ...schema, [collection]: schema[collection].filter((f) => f.id !== fieldId), nodeTypeDefaults },
        `Delete ${what(collection)} field “${field.key}”`,
      );
    }

    case 'move-field': {
      const { collection, fieldId, toIndex } = edit;
      const list = [...schema[collection]];
      const from = list.findIndex((f) => f.id === fieldId);
      if (from < 0) return refuse(`there is no ${what(collection)} field with id "${fieldId}"`);
      const to = Math.max(0, Math.min(list.length - 1, Math.trunc(toIndex)));
      if (to === from) return refuse('the field is already there');
      const [field] = list.splice(from, 1);
      list.splice(to, 0, field!);
      return finish({ ...schema, [collection]: list }, `Move ${what(collection)} field “${field!.key}”`, field!.id);
    }

    case 'set-type-default': {
      const { typeId, fieldId, value } = edit;
      const field = findField(schema, 'nodes', fieldId);
      if (!field) return refuse(`there is no node field with id "${fieldId}"`);
      const current = schema.nodeTypeDefaults[typeId] ?? {};
      if (value !== null && checkFieldValue(field, value) !== 'ok') return refuse(`the default for “${typeId}” must be ${describeField(field)}`);
      const nextDefaults = { ...current };
      if (value === null) {
        if (!Object.prototype.hasOwnProperty.call(current, fieldId)) return refuse(`type “${typeId}” has no own default for “${field.key}”`);
        delete nextDefaults[fieldId];
      } else nextDefaults[fieldId] = value;
      return finish(
        { ...schema, nodeTypeDefaults: { ...schema.nodeTypeDefaults, [typeId]: nextDefaults } },
        value === null ? `Remove the “${typeId}” default of “${field.key}”` : `Set the “${typeId}” default of “${field.key}”`,
        field.id,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Student code references (heuristic)

export interface AlgorithmReference {
  readonly algorithmId: string;
  readonly file: string;
  readonly keys: readonly string[];
}

/**
 * Algorithms of the project whose code MAY read one of `keys` (as a quoted string or a property
 * access). A heuristic on the loaded function source: it can miss computed keys and report
 * unrelated words. Shown as a warning only; algorithms are never edited.
 */
export function algorithmReferences(project: Pick<ActiveProject, 'algorithms'> | null, keys: readonly string[]): AlgorithmReference[] {
  if (!project || keys.length === 0) return [];
  const out: AlgorithmReference[] = [];
  for (const entry of project.algorithms) {
    const run = (entry.definition as { run?: unknown }).run;
    if (typeof run !== 'function') continue;
    let source: string;
    try {
      source = Function.prototype.toString.call(run);
    } catch {
      continue;
    }
    const found = keys.filter((key) => new RegExp(`(['"\`])${key}\\1|\\.${key}\\b`).test(source));
    if (found.length > 0) out.push({ algorithmId: entry.id, file: entry.file, keys: found });
  }
  return out;
}

/** Every key a field answers to, for reference checks. */
export const referenceKeys = (field: AttributeField): readonly string[] => fieldKeys(field);
