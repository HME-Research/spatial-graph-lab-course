import { customAttributeSource, customAttributeTag, type AttributeSectionId } from '@app/attributes/sections';
import { serializeDesignV2, type AttributeValue, type DesignDocumentV2 } from '@app/document';
import {
  resolveEdgeAttributes,
  resolveNodeAttributes,
  type ActiveToolkit,
  type AttributeCollection,
  type AttributeField,
  type EffectiveAttribute,
  type ProjectAttributeSchema,
} from '@app/extensions';
import { enabledMetrics, formatMetricValue, type EnabledMetricIds, type MetricContext, type MetricEvaluator } from '@app/metrics';
import { KIND_PRESENTATION } from '@app/views/presentation';

/**
 * Data view model (Programme P4, worktree D). Pure: no React. The Data view shows the SAME graph
 * as text (the stored JSON, exactly as exported) and as tables (one row per node / edge, columns
 * grouped by the attribute sections of `app/attributes/sections.ts`). Nothing here produces a
 * command: the table only marks which columns can be edited (worktree G); the edits go through the
 * cell editor the shell provides (`cellEditing.ts`).
 */

// ── JSON ─────────────────────────────────────────────────────────────────────────────────────

/** Which node or edge record a JSON line belongs to. */
export interface RecordRef {
  readonly collection: 'nodes' | 'edges';
  readonly id: number;
}

/** Sections a stored JSON line can belong to (calculated values are never stored). */
export type StoredSectionId = Exclude<AttributeSectionId, 'calculated'>;

export interface JsonLine {
  /** 1-based line number. */
  readonly number: number;
  readonly text: string;
  /** The node/edge record the line is part of (its braces included), or null. */
  readonly record: RecordRef | null;
  /** The attribute section of the line inside a record (null for braces and lines outside records). */
  readonly section: StoredSectionId | null;
}

/** A run of consecutive lines: one whole node/edge record, or the text between records. */
export interface JsonBlock {
  readonly key: string;
  readonly record: RecordRef | null;
  readonly lines: readonly JsonLine[];
}

/** Stored key of a node/edge record → its section. `connectorStyle` belongs to the relationship (Required). */
const RECORD_KEY_SECTION: Readonly<Record<string, StoredSectionId>> = {
  id: 'identity',
  source: 'identity',
  target: 'identity',
  typeId: 'required',
  kind: 'required',
  connectorStyle: 'required',
  grid: 'geometry',
  size: 'geometry',
  attributes: 'custom',
};

const COLLECTION_LINE = /^ {2}"(nodes|edges)": \[/;
const TOP_LEVEL_KEY = /^ {2}"/;
const RECORD_KEY = /^ {6}"([^"]+)":/;

/**
 * The design exactly as saved (`serializeDesignV2`: stored values only — no calculated values, no
 * resolved defaults), split into lines that know their record and section. Relies on the canonical
 * two-space layout of `serializeDesignV2` (nodes/edges at indent 2, records at 4, keys at 6) and
 * on records being written in document order.
 */
export function jsonLines(doc: DesignDocumentV2): JsonLine[] {
  const text = serializeDesignV2(doc).replace(/\n$/, '');
  const out: JsonLine[] = [];
  let collection: 'nodes' | 'edges' | null = null;
  let index = -1;
  let record: RecordRef | null = null;
  let section: StoredSectionId | null = null;
  text.split('\n').forEach((line, i) => {
    const collectionMatch = COLLECTION_LINE.exec(line);
    if (collectionMatch) {
      collection = collectionMatch[1] as 'nodes' | 'edges';
      index = -1;
    } else if (TOP_LEVEL_KEY.test(line)) collection = null;

    if (collection !== null && line === '    {') {
      index += 1;
      const item = (collection === 'nodes' ? doc.nodes : doc.edges)[index];
      record = item ? { collection, id: item.id } : null;
      section = null;
      out.push({ number: i + 1, text: line, record, section: null });
      return;
    }
    if (record !== null && (line === '    }' || line === '    },')) {
      out.push({ number: i + 1, text: line, record, section: null });
      record = null;
      section = null;
      return;
    }
    if (record !== null) {
      const key = RECORD_KEY.exec(line);
      if (key) section = RECORD_KEY_SECTION[key[1]!] ?? null;
    }
    out.push({ number: i + 1, text: line, record, section: record === null ? null : section });
  });
  return out;
}

const sameRecord = (a: RecordRef | null, b: RecordRef | null): boolean =>
  a === b || (a !== null && b !== null && a.collection === b.collection && a.id === b.id);

/** Consecutive lines grouped into record blocks and the blocks between them (for memoised rendering). */
export function jsonBlocks(lines: readonly JsonLine[]): JsonBlock[] {
  const blocks: { key: string; record: RecordRef | null; lines: JsonLine[] }[] = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    if (last && sameRecord(last.record, line.record)) last.lines.push(line);
    else
      blocks.push({
        key: line.record ? `${line.record.collection}:${line.record.id}` : `text:${line.number}`,
        record: line.record,
        lines: [line],
      });
  }
  return blocks;
}

// ── Table ────────────────────────────────────────────────────────────────────────────────────

/** How a cell's value relates to what is stored on the item. */
export type CellOrigin = 'stored' | 'type-default' | 'default' | 'none' | 'invalid' | 'calculated';

export interface DataCell {
  readonly text: string;
  /** Tooltip with the exact stored value or where the value comes from. */
  readonly title?: string;
  readonly origin: CellOrigin;
}

export interface DataColumn {
  /** Stable id: built-in attribute id, `custom:<fieldId>` or `calc:<metricId>`. */
  readonly id: string;
  readonly label: string;
  readonly section: AttributeSectionId;
  readonly title?: string;
  readonly numeric?: boolean;
  /**
   * Whether the cells of this column can be edited (P4, G): Function / Relationship, Geometry and
   * Custom. Identity and Calculated are locked.
   */
  readonly editable: boolean;
  /** Custom columns: where the attribute comes from, `Toolkit: <name>` or `Yours` (`customAttributeTag`). */
  readonly tag?: string;
}

export interface DataRow {
  readonly id: number;
  /** Cells by column id (every column has one). */
  readonly cells: Readonly<Record<string, DataCell>>;
}

export interface DataTable {
  readonly collection: 'nodes' | 'edges';
  readonly columns: readonly DataColumn[];
  readonly rows: readonly DataRow[];
}

/** Column groups in section order, skipping empty sections. */
export function columnGroups(columns: readonly DataColumn[]): { readonly section: AttributeSectionId; readonly span: number }[] {
  const groups: { section: AttributeSectionId; span: number }[] = [];
  for (const c of columns) {
    const last = groups[groups.length - 1];
    if (last && last.section === c.section) last.span += 1;
    else groups.push({ section: c.section, span: 1 });
  }
  return groups;
}

/** Plain text of an attribute value: "40", "yes", "high", "no value", "—". */
export function formatValue(value: AttributeValue | undefined): string {
  if (value === undefined) return '—';
  if (value === null) return 'no value';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

const stored = (value: string | number, title?: string): DataCell => ({ text: String(value), origin: 'stored', ...(title !== undefined && { title }) });

/** A custom attribute cell from THE resolver: own values plain, inherited ones marked. */
export function customCell(r: EffectiveAttribute, typeId?: string): DataCell {
  if (r.stored === 'invalid')
    return { text: JSON.stringify(r.storedValue) ?? String(r.storedValue), origin: 'invalid', title: `Stored value is not valid for “${r.field.label}”; ${r.source === 'none' ? 'no value applies' : `${formatValue(r.value)} applies instead`}.` };
  if (r.source === 'instance') return { text: formatValue(r.value), origin: 'stored', title: 'Stored on this item.' };
  if (r.source === 'type-default')
    return { text: formatValue(r.value), origin: 'type-default', title: `Not stored on this item: the default for Function “${typeId ?? ''}”.` };
  if (r.source === 'schema-default') return { text: formatValue(r.value), origin: 'default', title: 'Not stored on this item: the attribute’s default.' };
  return { text: '—', origin: 'none', title: 'No value stored and no default.' };
}

/** The parts of the active toolkit that decide where a custom attribute comes from. */
export type AttributeToolkit = Pick<ActiveToolkit, 'definition' | 'attributeBaseline'>;

const customColumn =
  (collection: AttributeCollection, toolkit: AttributeToolkit | null | undefined) =>
  (f: AttributeField): DataColumn => ({
    id: `custom:${f.id}`,
    label: f.label,
    section: 'custom',
    title: `${f.label} (stored as "${f.key}")${f.description ? `\n${f.description}` : ''}`,
    numeric: f.kind === 'number',
    editable: true,
    tag: customAttributeTag(customAttributeSource(f, collection, toolkit)),
  });

function calculatedColumns(collection: 'nodes' | 'edges', enabled: EnabledMetricIds, evaluator: MetricEvaluator): DataColumn[] {
  return enabledMetrics(enabled, collection, evaluator.metrics).map((m) => ({
    id: `calc:${m.id}`,
    label: m.label,
    section: 'calculated',
    title: `${m.description ?? m.label}\nCalculated from the design: read-only, never saved.`,
    numeric: m.valueKind === 'number',
    editable: false,
  }));
}

function calculatedCells(ctx: MetricContext, collection: 'nodes' | 'edges', enabled: EnabledMetricIds, evaluator: MetricEvaluator, id: number): Record<string, DataCell> {
  const out: Record<string, DataCell> = {};
  for (const m of enabledMetrics(enabled, collection, evaluator.metrics))
    out[`calc:${m.id}`] = { text: formatMetricValue(m, evaluator.value(ctx, m.id, id)), origin: 'calculated' };
  return out;
}

export interface TableInputs {
  readonly ctx: MetricContext;
  readonly schema: ProjectAttributeSchema;
  readonly enabled: EnabledMetricIds;
  readonly evaluator: MetricEvaluator;
  /** The active toolkit, for the `Toolkit: <name>` / `Yours` tags of custom columns (none: Yours). */
  readonly toolkit?: AttributeToolkit | null;
}

const GEOMETRY = [
  { id: 'position-x', label: 'Position X', axis: 'grid', i: 0 },
  { id: 'position-y', label: 'Position Y', axis: 'grid', i: 1 },
  { id: 'level', label: 'Level', axis: 'grid', i: 2 },
  { id: 'size-x', label: 'Size X', axis: 'size', i: 0 },
  { id: 'size-y', label: 'Size Y', axis: 'size', i: 1 },
  { id: 'floors', label: 'Floors', axis: 'size', i: 2 },
] as const;

/** One row per node: Identity · Required · Geometry · Custom · Calculated. */
export function nodeTable({ ctx, schema, enabled, evaluator, toolkit }: TableInputs): DataTable {
  const columns: DataColumn[] = [
    { id: 'id', label: 'ID', section: 'identity', title: 'Stored as "id". Never changes.', numeric: true, editable: false },
    { id: 'function', label: 'Function', section: 'required', title: 'Stored as "typeId".', editable: true },
    ...GEOMETRY.map((g) => ({
      id: g.id,
      label: g.label,
      section: 'geometry' as const,
      title: `Stored as "${g.axis}"[${g.i}], in voxels.`,
      numeric: true,
      editable: true,
    })),
    ...schema.nodes.map(customColumn('nodes', toolkit)),
    ...calculatedColumns('nodes', enabled, evaluator),
  ];
  const rows = ctx.doc.nodes.map((n): DataRow => {
    const cells: Record<string, DataCell> = { id: stored(n.id), function: stored(n.typeId) };
    for (const g of GEOMETRY) cells[g.id] = stored(n[g.axis][g.i]);
    for (const r of resolveNodeAttributes(schema, n)) cells[`custom:${r.field.id}`] = customCell(r, n.typeId);
    Object.assign(cells, calculatedCells(ctx, 'nodes', enabled, evaluator, n.id));
    return { id: n.id, cells };
  });
  return { collection: 'nodes', columns, rows };
}

/** One row per edge: Identity (ID, Source, Target) · Required · Custom · Calculated. */
export function edgeTable({ ctx, schema, enabled, evaluator, toolkit }: TableInputs): DataTable {
  const columns: DataColumn[] = [
    { id: 'id', label: 'ID', section: 'identity', title: 'Stored as "id". Never changes.', numeric: true, editable: false },
    { id: 'source', label: 'Source', section: 'identity', title: 'Stored as "source": the id of the first node.', editable: false },
    { id: 'target', label: 'Target', section: 'identity', title: 'Stored as "target": the id of the second node.', editable: false },
    { id: 'relationship', label: 'Relationship', section: 'required', title: 'Stored as "kind".', editable: true },
    ...schema.edges.map(customColumn('edges', toolkit)),
    ...calculatedColumns('edges', enabled, evaluator),
  ];
  const typeOf = new Map(ctx.doc.nodes.map((n) => [n.id, n.typeId]));
  /** "3 · kitchen": the endpoint's id and Function. */
  const endpoint = (id: number): DataCell => stored(typeOf.has(id) ? `${id} · ${typeOf.get(id)!}` : String(id), `Stored as ${id}.`);
  const rows = ctx.doc.edges.map((e): DataRow => {
    const cells: Record<string, DataCell> = {
      id: stored(e.id),
      source: endpoint(e.source),
      target: endpoint(e.target),
      relationship: stored(KIND_PRESENTATION[e.kind].label, `Stored as "${e.kind}".`),
    };
    for (const r of resolveEdgeAttributes(schema, e)) cells[`custom:${r.field.id}`] = customCell(r);
    Object.assign(cells, calculatedCells(ctx, 'edges', enabled, evaluator, e.id));
    return { id: e.id, cells };
  });
  return { collection: 'edges', columns, rows };
}
