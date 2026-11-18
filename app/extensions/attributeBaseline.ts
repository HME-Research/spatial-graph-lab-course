import type { AttributeSpec, ToolkitAttributeSpec, ToolkitDefinition } from '@student-api';
import type { RegisteredNodeType } from './activate';
import { diagnostic, type ExtensionDiagnostic } from './diagnostics';
import {
  checkFieldValue,
  fieldKeys,
  keyProblem,
  normaliseSchema,
  schemaSignature,
  type AttributeCollection,
  type AttributeField,
  type DefaultValue,
  type ProjectAttributeSchema,
} from './projectAttributes';

/**
 * The attribute schema a project's FILES describe: its immutable baseline. Built from
 * `defineToolkit({ attributes: { nodes, edges } })` and, for nodes, from the attributes its node
 * types declare (the union of all valid types; a type's `default` becomes that type's default).
 *
 * The baseline seeds the project's stored schema when the browser has none. It is never compared
 * with the stored schema as a second authority; a changed baseline is only reported, and merging
 * it is an explicit, additive operation (`mergeBaseline`).
 */

export interface AttributeBaseline {
  readonly schema: ProjectAttributeSchema;
  readonly signature: string;
  /** Conflicting or unusable declarations (the first declaration in file order wins). */
  readonly diagnostics: readonly ExtensionDiagnostic[];
}

/** "daylight" → "Daylight", "floorArea" → "Floor area", "room_count" → "Room count". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The spec part that defines what values are valid (no default, label or help). */
const shapeOf = (spec: AttributeSpec): string =>
  JSON.stringify([spec.kind, spec.kind === 'enum' ? spec.values : null, spec.kind === 'number' ? [spec.min ?? null, spec.max ?? null] : null]);

function fieldFromSpec(key: string, spec: ToolkitAttributeSpec | AttributeSpec, withDefault: boolean): AttributeField {
  const extra = spec as { label?: unknown; description?: unknown };
  return {
    id: key,
    key,
    label: typeof extra.label === 'string' && extra.label !== '' ? extra.label : humanizeKey(key),
    kind: spec.kind,
    ...(spec.kind === 'enum' && { values: [...spec.values] }),
    ...(spec.kind === 'number' && spec.min !== undefined && { min: spec.min }),
    ...(spec.kind === 'number' && spec.max !== undefined && { max: spec.max }),
    ...(withDefault && spec.default !== undefined && { default: spec.default }),
    ...(typeof extra.description === 'string' && extra.description !== '' && { description: extra.description }),
  };
}

/**
 * Derive the baseline. `definition` must have passed `toolkitDefinitionSchema`; only node types
 * with an ok status contribute (broken definitions are already reported as errors).
 */
export function deriveAttributeBaseline(
  projectId: string,
  definition: ToolkitDefinition,
  nodeTypes: readonly Pick<RegisteredNodeType, 'id' | 'file' | 'definition' | 'status'>[],
): AttributeBaseline {
  const diagnostics: ExtensionDiagnostic[] = [];
  const projectFile = `toolkits/${projectId}/toolkit.ts`;
  const fields: Record<AttributeCollection, AttributeField[]> = { nodes: [], edges: [] };
  /** lower-case key → shape signature and where it was declared. */
  const declared: Record<AttributeCollection, Map<string, { field: AttributeField; shape: string; where: string }>> = {
    nodes: new Map(),
    edges: new Map(),
  };

  for (const collection of ['nodes', 'edges'] as const) {
    for (const [key, spec] of Object.entries(definition.attributes?.[collection] ?? {})) {
      const problem = keyProblem(key);
      if (problem) {
        diagnostics.push(
          diagnostic('invalid-attribute-schema', 'error', { kind: 'file', path: projectFile }, `attributes.${collection}: ${problem}; the field was ignored`, {
            attribute: key,
            detail: collection,
          }),
        );
        continue;
      }
      if (declared[collection].has(key.toLowerCase())) {
        diagnostics.push(
          diagnostic(
            'attribute-declaration-conflict',
            'warning',
            { kind: 'file', path: projectFile },
            `attributes.${collection}: "${key}" differs only in upper/lower case from another field; it was ignored`,
            { attribute: key, detail: collection },
          ),
        );
        continue;
      }
      const field = fieldFromSpec(key, spec, true);
      fields[collection].push(field);
      declared[collection].set(key.toLowerCase(), { field, shape: shapeOf(spec), where: projectFile });
    }
  }

  const nodeTypeDefaults: Record<string, Record<string, DefaultValue>> = {};
  for (const type of nodeTypes) {
    if (!type.status.ok) continue;
    for (const [key, spec] of Object.entries(type.definition.attributes ?? {})) {
      const subject = { kind: 'file', path: type.file } as const;
      const problem = keyProblem(key);
      if (problem) {
        diagnostics.push(
          diagnostic('attribute-declaration-conflict', 'warning', subject, `type "${type.id}" declares attribute "${key}": ${problem}. It is not a project field; stored values are kept`, {
            attribute: key,
          }),
        );
        continue;
      }
      let entry = declared.nodes.get(key.toLowerCase());
      if (!entry) {
        const field = fieldFromSpec(key, spec, false);
        fields.nodes.push(field);
        entry = { field, shape: shapeOf(spec), where: type.file };
        declared.nodes.set(key.toLowerCase(), entry);
      } else if (entry.field.key !== key || entry.shape !== shapeOf(spec)) {
        diagnostics.push(
          diagnostic(
            'attribute-declaration-conflict',
            'warning',
            subject,
            `type "${type.id}" declares node attribute "${key}" differently from ${entry.where}; the project field keeps the first declaration (${entry.field.kind})`,
            { attribute: key },
          ),
        );
      }
      if (spec.default !== undefined) {
        if (checkFieldValue(entry.field, spec.default) === 'ok') (nodeTypeDefaults[type.id] ??= {})[entry.field.id] = spec.default;
        else {
          diagnostics.push(
            diagnostic(
              'attribute-declaration-conflict',
              'warning',
              subject,
              `type "${type.id}" gives "${key}" the default ${JSON.stringify(spec.default)}, which does not fit the project field (${entry.field.kind}); the default is ignored`,
              { attribute: key, detail: 'default' },
            ),
          );
        }
      }
    }
  }

  const schema = normaliseSchema({ nodes: fields.nodes, edges: fields.edges, nodeTypeDefaults });
  return { schema, signature: schemaSignature(schema), diagnostics };
}

/**
 * Add what the baseline has and `current` lacks: fields whose key (current or former, ignoring
 * case) is unknown in `current`, and type defaults for fields `current` has but that type does
 * not set yet. Never changes or removes anything `current` already has.
 */
export function mergeBaseline(
  current: ProjectAttributeSchema,
  baseline: ProjectAttributeSchema,
): { readonly schema: ProjectAttributeSchema; readonly added: readonly string[] } {
  const added: string[] = [];
  const next: Record<AttributeCollection, AttributeField[]> = { nodes: [...current.nodes], edges: [...current.edges] };
  /** baseline node field id → id of the matching field in the merged schema. */
  const nodeIdMap = new Map<string, string>();
  for (const collection of ['nodes', 'edges'] as const) {
    for (const field of baseline[collection]) {
      const match = next[collection].find((f) => fieldKeys(f).some((k) => k.toLowerCase() === field.key.toLowerCase()));
      if (match) {
        if (collection === 'nodes') nodeIdMap.set(field.id, match.id);
        continue;
      }
      let id = field.id;
      for (let n = 2; next[collection].some((f) => f.id === id); n++) id = `${field.id}-${n}`;
      next[collection].push({ ...field, id });
      if (collection === 'nodes') nodeIdMap.set(field.id, id);
      added.push(`${collection === 'nodes' ? 'node' : 'edge'} field "${field.key}"`);
    }
  }
  const nodeTypeDefaults: Record<string, Record<string, DefaultValue>> = {};
  for (const [typeId, defaults] of Object.entries(current.nodeTypeDefaults)) nodeTypeDefaults[typeId] = { ...defaults };
  for (const [typeId, defaults] of Object.entries(baseline.nodeTypeDefaults)) {
    for (const [baseFieldId, value] of Object.entries(defaults)) {
      const fieldId = nodeIdMap.get(baseFieldId);
      const field = next.nodes.find((f) => f.id === fieldId);
      if (!field || fieldId === undefined || checkFieldValue(field, value) !== 'ok') continue;
      const own = (nodeTypeDefaults[typeId] ??= {});
      if (!Object.prototype.hasOwnProperty.call(own, fieldId)) {
        own[fieldId] = value;
        added.push(`default of "${field.key}" for type "${typeId}"`);
      }
    }
  }
  return { schema: normaliseSchema({ nodes: next.nodes, edges: next.edges, nodeTypeDefaults }), added };
}
