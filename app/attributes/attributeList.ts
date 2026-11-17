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

/**
 * Pure model of the Attributes panel (UI refinement 2026-11-17): ONE list per collection that
 * students read as "attributes". Required attributes come first, then the project's custom
 * attributes in project order, then the calculated attributes shown for the project in catalogue
 * order. The internal distinctions (system-backed, schema field, metric) stay here, for what each
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

export interface RequiredAttribute {
  readonly id: string;
  readonly name: string;
  readonly typeText: string;
  readonly info: string;
}

/**
 * Required attributes of the actual graph model: a node's Function (`typeId`) and Level
 * (`grid[2]`); an edge's relationship (`kind`, Access or Open). Nothing is invented to mirror the
 * Node list.
 */
export const REQUIRED_ATTRIBUTES: Readonly<Record<AttributeCollection, readonly RequiredAttribute[]>> = {
  nodes: [
    { id: 'function', name: 'Function', typeText: 'Choice', info: 'What the room is used for. Every node has one; choose it in Properties. Add more functions here.' },
    { id: 'level', name: 'Level', typeText: 'Number', info: 'The storey the room stands on. Edit it in Properties, or move the room.' },
  ],
  edges: [{ id: 'relationship', name: 'Relationship', typeText: 'Choice', info: 'Access (a door or floor opening) or Open (no wall between the rooms). Choose it in Properties.' }],
};

export type AttributeRow =
  | { readonly kind: 'required'; readonly id: string; readonly name: string; readonly typeText: string; readonly info: string }
  | { readonly kind: 'custom'; readonly id: string; readonly name: string; readonly typeText: string; readonly field: AttributeField }
  | { readonly kind: 'calculated'; readonly id: string; readonly name: string; readonly typeText: string; readonly metric: CatalogueMetric };

/** What a calculated attribute's values are, in plain words: "Number · m²", "Yes/No", "Text". */
export function metricValueText(metric: Pick<CatalogueMetric, 'valueKind' | 'unit'>): string {
  if (metric.valueKind === 'boolean') return 'Yes/No';
  if (metric.valueKind === 'text') return 'Text';
  return metric.unit ? `Number · ${metric.unit}` : 'Number';
}

/** The unified list for one collection. */
export function attributeRows(
  collection: AttributeCollection,
  schema: ProjectAttributeSchema,
  enabledMetrics: EnabledMetricIds,
  catalogue: readonly CatalogueMetric[] = METRIC_CATALOGUE,
): AttributeRow[] {
  const on = new Set(enabledMetrics);
  return [
    ...REQUIRED_ATTRIBUTES[collection].map((r) => ({ kind: 'required' as const, ...r })),
    ...schema[collection].map((field) => ({ kind: 'custom' as const, id: field.id, name: field.label, typeText: TYPE_LABELS[field.kind], field })),
    ...catalogue
      .filter((m) => m.collection === collection && on.has(m.id))
      .map((metric) => ({ kind: 'calculated' as const, id: metric.id, name: metric.label, typeText: 'Calculated', metric })),
  ];
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
  const required = REQUIRED_ATTRIBUTES[collection].find((r) => norm(r.name) === n);
  if (required) return `“${required.name}” is a required attribute. Choose another name.`;
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
      for (const [k, v] of Object.entries(item.attributes)) {
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
    for (const item of collection === 'nodes' ? design.nodes : design.edges) if (Object.keys(item.attributes).some((k) => keys.has(k))) here++;
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
  /** Defined by the course (code) project: read-only here. */
  readonly fromCourse: boolean;
  /** Nodes using it across every scenario. */
  readonly used: number;
}

export const MAX_FUNCTION_NAME = 60;

/** Course functions first (their order), then project functions (their order). */
export function functionRows(
  courseTypes: readonly { readonly id: string; readonly label: string }[],
  projectFunctions: readonly { readonly id: string; readonly label: string }[],
  usedTypeIds: readonly string[],
): FunctionRow[] {
  const counts = new Map<string, number>();
  for (const id of usedTypeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const course = new Set(courseTypes.map((t) => t.id));
  return [
    ...courseTypes.map((t) => ({ id: t.id, label: t.label, fromCourse: true, used: counts.get(t.id) ?? 0 })),
    ...projectFunctions.filter((f) => !course.has(f.id)).map((f) => ({ id: f.id, label: f.label, fromCourse: false, used: counts.get(f.id) ?? 0 })),
  ];
}

/** Why `label` cannot name a function (null: it can). Unique ignoring case, also against course functions. */
export function functionNameProblem(label: string, rows: readonly FunctionRow[], selfId?: string): string | null {
  const n = norm(label);
  if (n === '') return 'Enter a name.';
  if (label.trim().length > MAX_FUNCTION_NAME) return `Use at most ${MAX_FUNCTION_NAME} characters.`;
  const other = rows.find((r) => r.id !== selfId && (norm(r.label) === n || r.id === n));
  return other ? `There is already a function called “${other.label}”.` : null;
}

/** A unique document type id for a new function: "Reading room" → "reading-room". */
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
