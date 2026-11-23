import {
  checkFieldValue,
  fieldKeys,
  keyConflict,
  type AttributeCollection,
  type AttributeField,
  type DesignSample,
  type FieldKind,
  type ProjectAttributeSchema,
} from '@app/extensions';
import { METRIC_CATALOGUE, type CatalogueMetric, type EnabledMetricIds } from '@app/metrics';
import {
  ATTRIBUTE_SECTION_IDS,
  EDGE_BUILT_IN_ATTRIBUTES,
  NODE_BUILT_IN_ATTRIBUTES,
  type AttributeSectionId,
  type BuiltInAttribute,
  type CustomAttributeSource,
} from './sections';

/**
 * Pure model of the Attributes panel (UI refinement 2026-11-17; sections: Programme P4): ONE list
 * per collection that students read as "attributes", grouped into the five sections of
 * `sections.ts` (Identity, Required by the app, Geometry, Custom, Calculated). The internal distinctions (system-backed, schema field, metric) stay here, for what each
 * row may do; the list itself never shows identifiers.
 */

/** Student-facing names of attribute types. */
export const TYPE_LABELS: Readonly<Record<FieldKind, string>> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Yes/No',
  enum: 'Choice',
};

export const TYPE_HELP: Readonly<Record<FieldKind, string>> = {
  text: 'Any text, such as a note.',
  number: 'A number, optionally between a smallest and a largest value.',
  boolean: 'Yes or no.',
  enum: 'One of a fixed list of options.',
};

/** A built-in row (Identity, Required by the app, Geometry): not a schema field, never deleted. */
export interface BuiltInRowInfo {
  readonly typeText: string;
  readonly info: string;
}

/**
 * Short information on each built-in attribute of the real graph model (`sections.ts` gives the
 * membership and order): a node's id, `function`, `position` and `size` (each ONE attribute of three
 * values); an edge's id, endpoints, `relationship` (Access or Open) and `corridor` (walls | roof).
 * Nothing is invented.
 */
export const BUILT_IN_INFO: Readonly<Record<AttributeCollection, Readonly<Record<string, BuiltInRowInfo>>>> = {
  nodes: {
    id: { typeText: 'Number', info: 'The node’s permanent number. The app gives it when the node is created; it never changes and is never reused.' },
    function: { typeText: 'Choice', info: 'What the room is used for. Every node has one; choose it in Properties. Add more functions here.' },
    position: { typeText: 'Numbers x | y | z', info: 'Where the room’s lowest corner is, in cells: x, y and z (z is the Level, the storey it stands on). Edit it in Properties, or move the room.' },
    size: { typeText: 'Numbers x | y | z', info: 'How many cells the room spans along x and y, and how many storeys tall it is (z, Floors). Edit it in Properties, or resize the room.' },
  },
  edges: {
    id: { typeText: 'Number', info: 'The edge’s permanent number. The app gives it when the edge is created; it never changes and is never reused.' },
    source: { typeText: 'Node', info: 'The node the edge starts from. It never changes: to join other nodes, add another edge.' },
    target: { typeText: 'Node', info: 'The node the edge leads to. It never changes: to join other nodes, add another edge.' },
    relationship: { typeText: 'Choice', info: 'Access (a door or floor opening) or Open (no wall between the rooms). Choose it in Properties.' },
    corridor: {
      typeText: 'Choices walls | roof',
      info: 'How this edge’s corridor looks: walls Enclosed or Open, roof Flat, Pergola or None. Used only when a corridor is generated (the rooms do not touch). Not set: the design’s Corridors card applies. Edit it in Properties or the Data table.',
    },
  },
};

export const builtInAttributes = (collection: AttributeCollection): readonly BuiltInAttribute[] =>
  collection === 'nodes' ? NODE_BUILT_IN_ATTRIBUTES : EDGE_BUILT_IN_ATTRIBUTES;

export type BuiltInRow = {
  readonly kind: BuiltInAttribute['section'];
  readonly id: string;
  readonly name: string;
  readonly typeText: string;
  readonly info: string;
};

/** A row's `kind` is its section (`sections.ts`). */
export type AttributeRow =
  | BuiltInRow
  | {
      readonly kind: 'custom';
      readonly id: string;
      readonly name: string;
      readonly typeText: string;
      readonly field: AttributeField;
      readonly source: CustomAttributeSource;
    }
  | { readonly kind: 'calculated'; readonly id: string; readonly name: string; readonly typeText: string; readonly metric: CatalogueMetric };

/**
 * The notice after "Add toolkit attributes". `mergeBaseline` lists both new fields
 * ('node field "x"' / 'edge field "x"') and new per-Function defaults ('default of …'); only the
 * fields are attributes, so they are counted separately (a toolkit with 2 attributes and 6
 * Functions must not report "14 attributes").
 */
export function toolkitMergeNotice(added: readonly string[]): string {
  const fields = added.filter((a) => /^(node|edge) field /.test(a)).length;
  const defaults = added.length - fields;
  if (added.length === 0) return 'Nothing new to add from the toolkit.';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (fields === 0) return `Added ${plural(defaults, 'Function default')} from the toolkit.`;
  return defaults === 0
    ? `Added ${plural(fields, 'attribute')} from the toolkit.`
    : `Added ${plural(fields, 'attribute')} and ${plural(defaults, 'Function default')} from the toolkit.`;
}

/** What a calculated attribute's values are, in plain words: "Number · m²", "Yes/No", "Text". */
export function metricValueText(metric: Pick<CatalogueMetric, 'valueKind' | 'unit'>): string {
  if (metric.valueKind === 'boolean') return 'Yes/No';
  if (metric.valueKind === 'text') return 'Text';
  return metric.unit ? `Number · ${metric.unit}` : 'Number';
}

/**
 * The list for one collection, in section order: Identity, Required by the app, Geometry (nodes:
 * Position, Size; edges: Corridor), Custom in project order (each with its source), Calculated in
 * catalogue order.
 */
export function attributeRows(
  collection: AttributeCollection,
  schema: ProjectAttributeSchema,
  enabledMetrics: EnabledMetricIds,
  catalogue: readonly CatalogueMetric[] = METRIC_CATALOGUE,
  sourceOf: (field: AttributeField) => CustomAttributeSource = () => ({ kind: 'yours' }),
): AttributeRow[] {
  const on = new Set(enabledMetrics);
  return [
    ...builtInAttributes(collection).map((b): BuiltInRow => ({ kind: b.section, id: b.id, name: b.name, ...BUILT_IN_INFO[collection][b.id]! })),
    ...schema[collection].map((field) => ({ kind: 'custom' as const, id: field.id, name: field.label, typeText: TYPE_LABELS[field.kind], field, source: sourceOf(field) })),
    ...catalogue
      .filter((m) => m.collection === collection && on.has(m.id))
      .map((metric) => ({ kind: 'calculated' as const, id: metric.id, name: metric.label, typeText: 'Calculated', metric })),
  ];
}

/** The rows grouped by section, in section order; empty sections are left out. */
export function sectionedRows(rows: readonly AttributeRow[]): { readonly section: AttributeSectionId; readonly rows: readonly AttributeRow[] }[] {
  return ATTRIBUTE_SECTION_IDS.map((section) => ({ section, rows: rows.filter((r) => r.kind === section) })).filter((g) => g.rows.length > 0);
}

/** Calculated attributes that can still be added (not yet shown), optionally filtered by text. */
export function availableCalculated(
  collection: AttributeCollection,
  enabledMetrics: EnabledMetricIds,
  query = '',
  catalogue: readonly CatalogueMetric[] = METRIC_CATALOGUE,
): CatalogueMetric[] {
  const on = new Set(enabledMetrics);
  const q = query.trim().toLowerCase();
  return catalogue.filter(
    (m) => m.collection === collection && !on.has(m.id) && (q === '' || m.label.toLowerCase().includes(q) || m.definition.toLowerCase().includes(q)),
  );
}

export const MAX_ATTRIBUTE_NAME = 60;

const norm = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Why `name` cannot be the display name of a custom attribute (null: it can). Names are unique in
 * their list, ignoring case and extra spaces, also against the required and calculated
 * attributes, so the unified list never shows two rows with the same name.
 */
export function attributeNameProblem(
  name: string,
  collection: AttributeCollection,
  schema: ProjectAttributeSchema,
  selfId?: string,
  catalogue: readonly CatalogueMetric[] = METRIC_CATALOGUE,
): string | null {
  const n = norm(name);
  if (n === '') return 'Enter a name.';
  if (name.trim().length > MAX_ATTRIBUTE_NAME) return `Use at most ${MAX_ATTRIBUTE_NAME} characters.`;
  const builtIn = builtInAttributes(collection).find((r) => norm(r.name) === n);
  if (builtIn) return `“${builtIn.name}” is a ${builtIn.section === 'required' ? 'required' : 'built-in'} attribute. Choose another name.`;
  const other = schema[collection].find((f) => f.id !== selfId && norm(f.label) === n);
  if (other) return `There is already an attribute called “${other.label}”.`;
  const metric = catalogue.find((m) => m.collection === collection && norm(m.label) === n);
  if (metric) return `“${metric.label}” is a calculated attribute. Choose another name, for example “${metric.label} (entered)”.`;
  return null;
}

/** "Floor finish" → "floor_finish"; accents removed; never empty; starts with a letter. */
export function keyStem(name: string): string {
  let stem = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (stem === '') stem = 'attribute';
  if (!/^[a-z]/.test(stem)) stem = `a_${stem}`;
  return stem.slice(0, 34).replace(/_+$/, '');
}

/**
 * A safe, unique identifier (the JSON key stored in designs) for a NEW attribute named `name`.
 * Students never type it. It is valid (`keyConflict`: pattern, reserved words, other keys and
 * former keys, ignoring case) and avoids keys for which `blocked` returns true (for example keys
 * that already hold values that would not fit the new attribute). The identifier never changes
 * when the attribute's name changes later, so stored values and algorithm references stay valid.
 */
export function generateAttributeKey(name: string, schema: ProjectAttributeSchema, collection: AttributeCollection, blocked: (key: string) => boolean = () => false): string {
  const stem = keyStem(name);
  for (let n = 1; n < 1000; n++) {
    const key = n === 1 ? stem : `${stem}_${n}`;
    if (keyConflict(schema, collection, key) === null && !blocked(key)) return key;
  }
  // Unreachable in practice (1000 collisions); still a valid, unique fallback.
  return `attribute_${Date.now().toString(36)}`;
}

/**
 * True when some known design stores, under `key`, a value that the new attribute `draft` would not
 * accept (for example values left behind by a deleted attribute of another type). Such a key is not
 * reused, so adding an attribute never turns stored data into errors; a key whose stored values
 * fit is reused, which brings those values back.
 */
export function keyHasIncompatibleValues(
  samples: readonly DesignSample[],
  collection: AttributeCollection,
  key: string,
  draft: Pick<AttributeField, 'kind' | 'values' | 'min' | 'max'>,
): boolean {
  const lower = key.toLowerCase();
  for (const design of samples) {
    for (const item of collection === 'nodes' ? design.nodes : design.edges) {
      for (const [k, v] of Object.entries(item.custom)) {
        if (k.toLowerCase() !== lower || v === null) continue;
        if (checkFieldValue(draft, v) !== 'ok') return true;
      }
    }
  }
  return false;
}

/** Designs whose values attribute edits must respect: every scenario of the open project, then extra samples. */
export function scenarioSamples(
  scenarios: readonly { readonly id: string; readonly name: string; readonly doc: Omit<DesignSample, 'id' | 'label'> }[],
  extra: readonly DesignSample[] = [],
): DesignSample[] {
  return [...scenarios.map((s) => ({ id: `scenario:${s.id}`, label: s.name, nodes: s.doc.nodes, edges: s.doc.edges })), ...extra];
}

/** Values stored for `field` across `samples` (explicit "no value" included), per design. */
export function storedValueCount(field: AttributeField, collection: AttributeCollection, samples: readonly DesignSample[]): { readonly total: number; readonly designs: number } {
  const keys = new Set(fieldKeys(field));
  let total = 0;
  let designs = 0;
  for (const design of samples) {
    let here = 0;
    for (const item of collection === 'nodes' ? design.nodes : design.edges) if (Object.keys(item.custom).some((k) => keys.has(k))) here++;
    total += here;
    if (here > 0) designs++;
  }
  return { total, designs };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "3 values in 2 scenarios" / "no values entered yet". */
export function storedValueText(count: { readonly total: number; readonly designs: number }): string {
  return count.total === 0 ? 'no values entered yet' : `${plural(count.total, 'value')} in ${plural(count.designs, 'scenario')}`;
}

// ── Functions (node types) ──────────────────────────────────────────────────────────────────

export interface FunctionRow {
  readonly id: string;
  readonly label: string;
  /** Defined by the toolkit: read-only here. */
  readonly fromToolkit: boolean;
  /** Nodes using it across every scenario. */
  readonly used: number;
}

export const MAX_FUNCTION_NAME = 60;

/** Toolkit functions first (their order), then project functions (their order). */
export function functionRows(
  toolkitTypes: readonly { readonly id: string; readonly label: string }[],
  projectFunctions: readonly { readonly id: string; readonly label: string }[],
  usedTypeIds: readonly string[],
): FunctionRow[] {
  const counts = new Map<string, number>();
  for (const id of usedTypeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const toolkit = new Set(toolkitTypes.map((t) => t.id));
  return [
    ...toolkitTypes.map((t) => ({ id: t.id, label: t.label, fromToolkit: true, used: counts.get(t.id) ?? 0 })),
    ...projectFunctions.filter((f) => !toolkit.has(f.id)).map((f) => ({ id: f.id, label: f.label, fromToolkit: false, used: counts.get(f.id) ?? 0 })),
  ];
}

/**
 * Why `label` cannot name a function (null: it can). Names are compared with names only (ignoring
 * case and spacing), never with ids: an id is fixed when a function is created and keeps its first
 * name after a rename, so "x" renamed to "y" frees the name "x" (the new function gets a fresh id,
 * see `generateFunctionId`). `removedToolkit`: toolkit functions removed from this project; their
 * names are refused too, because restoring one is what gives back its façade, colour and defaults.
 */
export function functionNameProblem(label: string, rows: readonly FunctionRow[], selfId?: string, removedToolkit: readonly FunctionRow[] = []): string | null {
  const n = norm(label);
  if (n === '') return 'Enter a name.';
  if (label.trim().length > MAX_FUNCTION_NAME) return `Use at most ${MAX_FUNCTION_NAME} characters.`;
  const other = rows.find((r) => r.id !== selfId && norm(r.label) === n);
  if (other) return `There is already a function called “${other.label}”.`;
  const removed = removedToolkit.find((r) => r.id !== selfId && norm(r.label) === n);
  return removed ? `“${removed.label}” is a toolkit function removed from this project. Restore it below instead.` : null;
}

/** `label` with the first free number suffix ("Gallery" → "Gallery 2"), unique ignoring case among `takenLabels`. */
export function suffixedFunctionName(label: string, takenLabels: readonly string[]): string {
  const taken = new Set(takenLabels.map(norm));
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const name = `${label.trim().slice(0, MAX_FUNCTION_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(norm(name))) return name;
  }
}

/** Why a removed toolkit function cannot be restored (null: it can): a shown function now has its name. */
export function restoreProblem(row: FunctionRow, shown: readonly FunctionRow[]): string | null {
  const other = shown.find((r) => r.id !== row.id && norm(r.label) === norm(row.label));
  return other ? `Rename “${other.label}” first: two functions cannot share a name.` : null;
}

/**
 * A unique document type id for a new function: "Reading room" → "reading-room". `takenIds` must
 * include every id still referenced anywhere (existing functions, Designer cards, attribute
 * defaults), so a new function never inherits a deleted one's stored settings.
 */
export function generateFunctionId(label: string, takenIds: readonly string[]): string {
  let stem = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (stem === '') stem = 'function';
  if (!/^[a-z]/.test(stem)) stem = `f-${stem}`;
  stem = stem.slice(0, 56).replace(/-+$/, '');
  const taken = new Set(takenIds);
  for (let n = 1; ; n++) {
    const id = n === 1 ? stem : `${stem}-${n}`;
    if (!taken.has(id)) return id;
  }
}
