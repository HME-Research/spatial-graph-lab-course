import { MAX_ROOM_SIZE, type AttributeValue, type DesignDocumentV2, type GraphIssue, type RelationshipKind } from '@app/document';
import { resolveEdgeAttributes, resolveNodeAttributes, type EffectiveAttribute } from '@app/extensions';
import type { DesignCommand } from '@app/spatial';
import { decodeChoice, encodeChoice, EXPLICIT_NONE, formatFieldValue, inheritedText, INHERIT, parseValueDraft } from '@app/attributes/attributesModel';
import { RELATIONSHIP_KIND_CHOICES } from '@app/ui/labels';
import type { ProjectViewContext } from '@app/views/project';
import { setEdgeFieldCommand, setNodeFieldCommand } from './fieldCommands';
import { geometryDraftEdit, GEOMETRY_ROWS, parseTypeId, typeMenu, type Triple } from './propertiesModel';

/**
 * Pure model behind one editable cell of the Data view's table (Programme P4, worktree G). It
 * reuses the models of Properties so a cell edits exactly like the matching Properties row:
 * - Function: the same menu (`typeMenu`) → `set-node-type`;
 * - Relationship: Access / Open → `change-edge-kind`;
 * - Geometry (Position x | y | z, Size x | y | z; one cell per value): `geometryDraftEdit` → the host previews it
 *   (`proposeEdit`) and sends `set-node-geometry`, like Properties and the gizmo;
 * - Custom: `parseValueDraft` / the choice encoding of Properties → `set-node-custom` /
 *   `set-edge-custom` (`fieldCommands`), keeping every other stored value.
 * Identity and Calculated columns have no editor. No React here.
 */

export interface CellChoice {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type CellEditorSpec =
  /** A choice list. `other`: a value may also be typed (Function without a project). */
  | { readonly kind: 'choice'; readonly current: string; readonly options: readonly CellChoice[]; readonly other?: boolean }
  /** A text or number field. `reset`: the item has its own value that "Use default" removes. */
  | {
      readonly kind: 'input';
      readonly type: 'text' | 'number';
      readonly draft: string;
      readonly placeholder: string;
      readonly reset?: { readonly title: string };
      readonly min?: number;
      readonly max?: number;
    };

/** What the editor sends back. */
export type CellInput =
  | { readonly kind: 'draft'; readonly text: string }
  | { readonly kind: 'choice'; readonly value: string }
  /** "Use default": remove the item's own value. */
  | { readonly kind: 'reset' };

export type GeometryRequest = { readonly position?: Triple; readonly size?: Triple };

export type CellCommit =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'invalid'; readonly issue: GraphIssue }
  | { readonly kind: 'command'; readonly command: DesignCommand }
  /** Preview with `proposeEdit`, then send `set-node-geometry` (the Properties path). */
  | { readonly kind: 'geometry'; readonly nodeId: number; readonly request: GeometryRequest; readonly action: 'move' | 'resize' };

const issue = (path: GraphIssue['path'], message: string): GraphIssue => ({ path, code: 'schema', message });

const CUSTOM_PREFIX = 'custom:';

function customOf(doc: DesignDocumentV2, project: ProjectViewContext | undefined, collection: 'nodes' | 'edges', itemId: number, columnId: string) {
  if (!columnId.startsWith(CUSTOM_PREFIX) || !project) return null;
  const fieldId = columnId.slice(CUSTOM_PREFIX.length);
  const schema = project.attributes;
  if (collection === 'nodes') {
    const node = doc.nodes.find((n) => n.id === itemId);
    const r = node && resolveNodeAttributes(schema, node).find((x) => x.field.id === fieldId);
    return node && r ? { item: node, function: node.function as string | undefined, r } : null;
  }
  const edge = doc.edges.find((e) => e.id === itemId);
  const r = edge && resolveEdgeAttributes(schema, edge).find((x) => x.field.id === fieldId);
  return edge && r ? { item: edge, function: undefined, r } : null;
}

/** The choice-list value Properties shows for a Yes/No or Choice attribute. */
const currentChoice = (r: EffectiveAttribute): string =>
  r.stored === 'ok' ? encodeChoice(r.storedValue as string | boolean) : r.stored === 'null' ? EXPLICIT_NONE : INHERIT;

/** The editor for one cell, or null when the cell is locked or the item / column is unknown. */
export function cellEditorSpec(
  doc: DesignDocumentV2,
  project: ProjectViewContext | undefined,
  collection: 'nodes' | 'edges',
  itemId: number,
  columnId: string,
): CellEditorSpec | null {
  if (collection === 'nodes') {
    const node = doc.nodes.find((n) => n.id === itemId);
    if (!node) return null;
    if (columnId === 'function') {
      const menu = typeMenu(project?.project ?? null, doc.nodes.map((n) => n.function), node.function);
      return { kind: 'choice', current: node.function, options: menu.options, ...(menu.allowCustom && { other: true }) };
    }
    const row = GEOMETRY_ROWS.find((g) => g.id === columnId);
    if (row) {
      const isSize = row.part === 'size';
      return { kind: 'input', type: 'number', draft: String(node[row.part][row.axis]), placeholder: '', ...(isSize && { min: 1, max: MAX_ROOM_SIZE }) };
    }
  } else {
    const edge = doc.edges.find((e) => e.id === itemId);
    if (!edge) return null;
    if (columnId === 'relationship')
      return { kind: 'choice', current: edge.relationship, options: RELATIONSHIP_KIND_CHOICES.map((c) => ({ value: c.value, label: c.label })) };
  }

  const custom = customOf(doc, project, collection, itemId, columnId);
  if (!custom) return null;
  const { r, function: functionId } = custom;
  const { field } = r;
  const inherit = inheritedText(r, functionId);
  if (field.kind === 'enum' || field.kind === 'boolean') {
    const values: CellChoice[] =
      field.kind === 'enum'
        ? (field.values ?? []).map((v) => ({ value: encodeChoice(v), label: v }))
        : [
            { value: encodeChoice(true), label: 'yes' },
            { value: encodeChoice(false), label: 'no' },
          ];
    return {
      kind: 'choice',
      current: currentChoice(r),
      options: [{ value: INHERIT, label: `Use default (${inherit})` }, ...values, { value: EXPLICIT_NONE, label: 'No value' }],
    };
  }
  return {
    kind: 'input',
    type: field.kind === 'number' ? 'number' : 'text',
    draft: r.stored === 'ok' ? String(r.storedValue) : '',
    placeholder: r.stored === 'null' ? 'no value (set)' : r.inherited !== undefined ? `${formatFieldValue(r.inherited)} (default)` : 'no value',
    ...(r.source === 'instance' && { reset: { title: `Remove this value; ${inherit} applies again` } }),
    ...(field.min !== undefined && { min: field.min }),
    ...(field.max !== undefined && { max: field.max }),
  };
}

const geometryName = (id: string): string => GEOMETRY_ROWS.find((g) => g.id === id)?.name ?? id;

/**
 * What committing `input` to a cell does: nothing (same value), a readable refusal (nothing is
 * sent), one validated design command (one undo step), or a geometry request to preview first.
 */
export function cellCommit(
  doc: DesignDocumentV2,
  project: ProjectViewContext | undefined,
  collection: 'nodes' | 'edges',
  itemId: number,
  columnId: string,
  input: CellInput,
): CellCommit {
  const spec = cellEditorSpec(doc, project, collection, itemId, columnId);
  if (!spec) return { kind: 'invalid', issue: issue([collection], 'This value cannot be edited here.') };

  if (collection === 'nodes' && columnId === 'function') {
    if (spec.kind !== 'choice' || input.kind === 'reset') return { kind: 'unchanged' };
    let functionId: string;
    if (input.kind === 'draft') {
      // Typing a function id is offered only without a project, like Properties' "Other type…".
      if (!spec.other) return { kind: 'invalid', issue: issue(['nodes', 'function'], 'Choose one of the functions this project offers.') };
      const parsed = parseTypeId(input.text);
      if (!parsed.ok) return { kind: 'invalid', issue: issue(['nodes', 'function'], parsed.message) };
      functionId = parsed.value;
    } else {
      if (input.value === spec.current) return { kind: 'unchanged' };
      if (!spec.options.some((o) => o.value === input.value && !o.disabled))
        return { kind: 'invalid', issue: issue(['nodes', 'function'], `“${input.value}” is not a function this project offers.`) };
      functionId = input.value;
    }
    return functionId === spec.current ? { kind: 'unchanged' } : { kind: 'command', command: { type: 'set-node-type', nodeId: itemId, function: functionId } };
  }

  if (collection === 'edges' && columnId === 'relationship') {
    if (input.kind !== 'choice' || spec.kind !== 'choice') return { kind: 'unchanged' };
    if (!spec.options.some((o) => o.value === input.value)) return { kind: 'invalid', issue: issue(['edges', 'relationship'], 'Choose Access or Open.') };
    return input.value === spec.current
      ? { kind: 'unchanged' }
      : { kind: 'command', command: { type: 'change-edge-kind', edgeId: itemId, relationship: input.value as RelationshipKind } };
  }

  const row = collection === 'nodes' ? GEOMETRY_ROWS.find((g) => g.id === columnId) : undefined;
  if (row) {
    if (input.kind !== 'draft') return { kind: 'unchanged' };
    const node = doc.nodes.find((n) => n.id === itemId)!;
    const decision = geometryDraftEdit(node, columnId, geometryName(columnId), input.text, MAX_ROOM_SIZE);
    if (decision.kind === 'unchanged') return decision;
    if (decision.kind === 'invalid') return { kind: 'invalid', issue: issue([row.part], `${decision.message}.`) };
    return { kind: 'geometry', nodeId: itemId, request: decision.request, action: decision.request.size ? 'resize' : 'move' };
  }

  const custom = customOf(doc, project, collection, itemId, columnId);
  if (!custom) return { kind: 'invalid', issue: issue([collection], 'This value cannot be edited here.') };
  const { r, item } = custom;
  const path: GraphIssue['path'] = ['custom', r.field.key];
  let value: AttributeValue | undefined;
  if (input.kind === 'reset') {
    if (r.source !== 'instance' && r.stored !== 'invalid') return { kind: 'unchanged' };
    value = undefined;
  } else if (input.kind === 'choice') {
    if (spec.kind !== 'choice' || input.value === spec.current) return { kind: 'unchanged' };
    if (!spec.options.some((o) => o.value === input.value)) return { kind: 'invalid', issue: issue(path, `Choose one of the listed values for “${r.field.label}”.`) };
    value = decodeChoice(input.value);
  } else {
    if (spec.kind !== 'input' || input.text === spec.draft) return { kind: 'unchanged' };
    const parsed = parseValueDraft(r.field, input.text);
    if (!parsed.ok) return { kind: 'invalid', issue: issue(path, parsed.message) };
    value = parsed.value;
    // An empty field on an inherited value changes nothing (it is still inherited).
    if (value === undefined && r.source !== 'instance' && r.stored !== 'invalid') return { kind: 'unchanged' };
  }
  const result = collection === 'nodes' ? setNodeFieldCommand(item, r.field, value) : setEdgeFieldCommand(item, r.field, value);
  return result.ok ? { kind: 'command', command: result.command } : { kind: 'invalid', issue: issue(path, result.message) };
}
