import {
  corridorChoiceLabel,
  CORRIDOR_PARTS,
  CORRIDOR_WIDTH_PART,
  customAttributeSource,
  customAttributeTag,
  GEOMETRY_AXES,
  NODE_BUILT_IN_ATTRIBUTES,
  type AttributeSectionId,
} from '@app/attributes/sections';
import { designCorridorLook, formatCorridorWidth, serializeDesignV2, type AttributeValue, type DesignDocumentV2, type RelationshipEdge } from '@app/document';
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

/**
 * Stored key of a node/edge record → its section. `corridor` (an edge's own walls / roof) is a
 * built-in Geometry attribute. Lines inside a multi-line value (`custom`, `corridor`) keep the
 * section of their key.
 */
const RECORD_KEY_SECTION: Readonly<Record<string, StoredSectionId>> = {
  id: 'identity',
  source: 'identity',
  target: 'identity',
  function: 'required',
  relationship: 'required',
  corridor: 'geometry',
  position: 'geometry',
  size: 'geometry',
  custom: 'custom',
};

const COLLECTION_LINE = /^ {2}"(nodes|edges)": \[/;
const TOP_LEVEL_KEY = /^ {2}"/;
const RECORD_KEY = /^ {6}"([^"]+)":/;

/**
 * The design exactly as saved (`serializeDesignV2`: stored values only — no calculated values, no
 * resolved defaults), split into lines that know their record and section. Relies on the canonical
 * two-space layout of `serializeDesignV2` / `formatJson` (nodes/edges at indent 2, records at 4,
 * keys at 6, a multi-line value's inner lines deeper; arrays of numbers on their key's line) and on
 * records being written in document order.
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
  /** A short note after the value, instead of the origin's usual one ("default", "from type"). */
  readonly hint?: string;
}

export interface DataColumn {
  /**
   * Stable id: built-in attribute id, `<attribute>.<x|y|z>` for one value of Position / Size,
   * `corridor.<walls|roof|width>` for one value of an edge's Corridor, `custom:<fieldId>` or `calc:<metricId>`.
   */
  readonly id: string;
  /** The column heading; for one value of Position / Size / Corridor its label (`x`, `z (Level)`, `walls`). */
  readonly label: string;
  /**
   * Position / Size / Corridor: the attribute this value column belongs to (one heading spans its
   * value columns); `title` is the heading's tooltip.
   */
  readonly attribute?: { readonly id: string; readonly label: string; readonly title: string };
  readonly section: AttributeSectionId;
  readonly title?: string;
  readonly numeric?: boolean;
  /**
   * Whether the cells of this column can be edited (P4, G): Function / Relationship, Geometry
   * (Position, Size, Corridor) and Custom. Identity and Calculated are locked.
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

/**
 * Attribute headings of a table: one per column, except that the value columns of Position, Size
 * (three each) and Corridor (three) share one heading spanning them. `split`: the heading has value
 * columns under it.
 */
export function attributeHeadings(columns: readonly DataColumn[]): { readonly id: string; readonly label: string; readonly span: number; readonly split: boolean; readonly first: DataColumn }[] {
  const out: { id: string; label: string; span: number; split: boolean; first: DataColumn }[] = [];
  for (const c of columns) {
    const last = out[out.length - 1];
    if (c.attribute && last && last.split && last.id === c.attribute.id) last.span += 1;
    else out.push(c.attribute ? { id: c.attribute.id, label: c.attribute.label, span: 1, split: true, first: c } : { id: c.id, label: c.label, span: 1, split: false, first: c });
  }
  return out;
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
export function customCell(r: EffectiveAttribute, functionId?: string): DataCell {
  if (r.stored === 'invalid')
    return { text: JSON.stringify(r.storedValue) ?? String(r.storedValue), origin: 'invalid', title: `Stored value is not valid for “${r.field.label}”; ${r.source === 'none' ? 'no value applies' : `${formatValue(r.value)} applies instead`}.` };
  if (r.source === 'instance') return { text: formatValue(r.value), origin: 'stored', title: 'Stored on this item.' };
  if (r.source === 'type-default')
    return { text: formatValue(r.value), origin: 'type-default', title: `Not stored on this item: the default for Function “${functionId ?? ''}”.` };
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
  /** Each function's readable name (`functionNameResolver`); default: the id. */
  readonly functionName?: (functionId: string) => string;
}

/** The heading of a Geometry attribute (`Position`, `Size`). */
const geometryHeading = (id: string): string => NODE_BUILT_IN_ATTRIBUTES.find((a) => a.id === id)?.name ?? id;

/**
 * One row per node, columns in the order of the saved JSON keys: id · function · position (x | y |
 * z) · size (x | y | z) · custom attributes; then the calculated values (never saved), locked.
 */
export function nodeTable({ ctx, schema, enabled, evaluator, toolkit, functionName = (id) => id }: TableInputs): DataTable {
  const columns: DataColumn[] = [
    { id: 'id', label: 'ID', section: 'identity', title: 'Stored as "id". Never changes.', numeric: true, editable: false },
    { id: 'function', label: 'Function', section: 'required', title: 'Stored as "function".', editable: true },
    ...GEOMETRY_AXES.map((g) => ({
      id: g.id,
      label: g.label,
      attribute: { id: g.part, label: geometryHeading(g.part), title: `Stored as "${g.part}": three values, x | y | z.` },
      section: 'geometry' as const,
      title: `${g.name}: stored as "${g.part}"[${g.axis}], in cells.`,
      numeric: true,
      editable: true,
    })),
    ...schema.nodes.map(customColumn('nodes', toolkit)),
    ...calculatedColumns('nodes', enabled, evaluator),
  ];
  const rows = ctx.doc.nodes.map((n): DataRow => {
    const name = functionName(n.function);
    // The Function cell shows the current name; the stored id is in its title when it differs.
    const cells: Record<string, DataCell> = { id: stored(n.id), function: stored(name, name === n.function ? undefined : `Stored as "${n.function}".`) };
    for (const g of GEOMETRY_AXES) cells[g.id] = stored(n[g.part][g.axis]);
    for (const r of resolveNodeAttributes(schema, n)) cells[`custom:${r.field.id}`] = customCell(r, name);
    Object.assign(cells, calculatedCells(ctx, 'nodes', enabled, evaluator, n.id));
    return { id: n.id, cells };
  });
  return { collection: 'nodes', columns, rows };
}

/**
 * The corridor walls / roof cells of a relationship, like Properties: its own value plain; without
 * one, the design's Corridors card value marked "default". When no corridor is generated now (the
 * rooms touch, or it is unresolved) the value still shows and stays editable, marked "not built":
 * it is used only when a corridor is generated.
 */
function corridorCells(edge: RelationshipEdge, ctx: MetricContext): Record<string, DataCell> {
  const card = designCorridorLook(ctx.doc.settings);
  const built = ctx.spatial.byEdge.get(edge.id)?.status === 'routed';
  const unused = built ? '' : '\nNo corridor is generated for this edge now; the value is used only if one is.';
  const out: Record<string, DataCell> = {};
  for (const p of CORRIDOR_PARTS) {
    const own = edge.corridor?.[p.part];
    out[p.id] =
      own !== undefined
        ? { text: corridorChoiceLabel(p, own), origin: 'stored', title: `Stored on this edge as "corridor".${p.part}: "${own}".${unused}`, ...(!built && { hint: 'not built' }) }
        : {
            text: corridorChoiceLabel(p, card[p.part]),
            origin: 'default',
            title: `Not stored: the design’s Corridors card applies (Building Designer → Corridors).${unused}`,
            hint: built ? 'default' : 'default · not built',
          };
  }
  const w = CORRIDOR_WIDTH_PART;
  const ownWidth = edge.corridor?.width;
  out[w.id] =
    ownWidth !== undefined
      ? { text: formatCorridorWidth(ownWidth), origin: 'stored', title: `Stored on this edge as "corridor".width: ${ownWidth} (metres).${unused}`, ...(!built && { hint: 'not built' }) }
      : {
          text: formatCorridorWidth(card.width),
          origin: 'default',
          title: `Not stored: the design’s Corridors card applies (Building Designer → Corridors).${unused}`,
          hint: built ? 'default' : 'default · not built',
        };
  return out;
}

/**
 * One row per edge, columns in the order of the saved JSON keys: id · source · target ·
 * relationship · corridor (walls | roof | width) · custom attributes; then the calculated values (never
 * saved), locked.
 */
export function edgeTable({ ctx, schema, enabled, evaluator, toolkit }: TableInputs): DataTable {
  const columns: DataColumn[] = [
    { id: 'id', label: 'ID', section: 'identity', title: 'Stored as "id". Never changes.', numeric: true, editable: false },
    { id: 'source', label: 'Source', section: 'identity', title: 'Stored as "source": the id of the first node.', editable: false },
    { id: 'target', label: 'Target', section: 'identity', title: 'Stored as "target": the id of the second node.', editable: false },
    { id: 'relationship', label: 'Relationship', section: 'required', title: 'Stored as "relationship".', editable: true },
    ...[...CORRIDOR_PARTS, CORRIDOR_WIDTH_PART].map((p) => ({
      id: p.id,
      label: p.label,
      attribute: {
        id: 'corridor',
        label: 'Corridor',
        title: 'Stored as "corridor": this edge’s own corridor look, three values, walls | roof | width. Used only when a corridor is generated; not stored, the design’s Corridors card applies.',
      },
      section: 'geometry' as const,
      title: `${p.name}: stored as "corridor".${p.part}${p.part === 'width' ? ' (metres)' : ''}; empty uses the Corridors card.`,
      editable: true,
      ...(p.part === 'width' && { numeric: true }),
    })),
    ...schema.edges.map(customColumn('edges', toolkit)),
    ...calculatedColumns('edges', enabled, evaluator),
  ];
  const typeOf = new Map(ctx.doc.nodes.map((n) => [n.id, n.function]));
  /** "3 · kitchen": the endpoint's id and Function. */
  const endpoint = (id: number): DataCell => stored(typeOf.has(id) ? `${id} · ${typeOf.get(id)!}` : String(id), `Stored as ${id}.`);
  const rows = ctx.doc.edges.map((e): DataRow => {
    const cells: Record<string, DataCell> = {
      id: stored(e.id),
      source: endpoint(e.source),
      target: endpoint(e.target),
      relationship: stored(KIND_PRESENTATION[e.relationship].label, `Stored as "${e.relationship}".`),
      ...corridorCells(e, ctx),
    };
    for (const r of resolveEdgeAttributes(schema, e)) cells[`custom:${r.field.id}`] = customCell(r);
    Object.assign(cells, calculatedCells(ctx, 'edges', enabled, evaluator, e.id));
    return { id: e.id, cells };
  });
  return { collection: 'edges', columns, rows };
}
