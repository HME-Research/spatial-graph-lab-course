import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { ATTRIBUTE_SECTIONS, type AttributeSectionId } from '@app/attributes/sections';
import { EMPTY_ATTRIBUTE_SCHEMA } from '@app/extensions';
import { defaultMetricEvaluator } from '@app/metrics';
import { selectEdge, selectionEmphasis, selectNode, type Emphasis, type Selection, type SelectionHandler } from '@core/viewer/selection';
import type { ViewProps } from '../contracts';
import { useRemembered } from '../panelMemory';
import { useEnabledMetrics } from '../three/enabledMetrics';
import {
  columnGroups,
  edgeTable,
  jsonBlocks,
  jsonLines,
  nodeTable,
  type DataCell,
  type DataColumn,
  type DataRow,
  type DataTable,
  type JsonBlock,
  type RecordRef,
  type StoredSectionId,
} from './dataModel';
import './data.css';

/**
 * Data view (Programme P4, worktree D): the same graph as text and as a table. A graph does not
 * have to be a diagram. Selection is shared both ways with every other view; the view is
 * read-only and never issues a command (table editing comes later, through the validated
 * commands — cells are rendered by `DataCellView` so an editor can be slotted in there).
 */

export const DATA_FORMATS = ['json', 'table'] as const;
export type DataFormat = (typeof DATA_FORMATS)[number];
const FORMAT_LABELS: Readonly<Record<DataFormat, string>> = { json: 'JSON', table: 'Table' };
const FORMAT_TITLES: Readonly<Record<DataFormat, string>> = {
  json: 'The design exactly as it is saved: stored values only, no calculated values or defaults.',
  table: 'One row per node and per edge; columns grouped by attribute section.',
};

type RowEmphasis = 'primary' | 'secondary' | null;

const nodeEmphasis = (e: Emphasis, id: number): RowEmphasis => (e.primaryNodes.has(id) ? 'primary' : e.secondaryNodes.has(id) ? 'secondary' : null);
const edgeEmphasis = (e: Emphasis, id: number): RowEmphasis => (e.edges.has(id) ? 'primary' : null);
const recordEmphasis = (e: Emphasis, r: RecordRef): RowEmphasis => (r.collection === 'nodes' ? nodeEmphasis(e, r.id) : edgeEmphasis(e, r.id));
const selectionOf = (collection: 'nodes' | 'edges', id: number): Selection => (collection === 'nodes' ? selectNode(id) : selectEdge(id));

/**
 * Scroll `container` (only — never the page) so `el` is visible below `topInset` px (a sticky
 * header). `start`: bring the element's top into view when any part of it is hidden.
 */
function revealIn(container: HTMLElement, el: HTMLElement, topInset: number, start: boolean): void {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = c.top + topInset;
  if (r.top < top || (start && r.bottom > c.bottom)) container.scrollTop += r.top - top - (start ? 24 : 4);
  else if (r.bottom > c.bottom) container.scrollTop += r.bottom - c.bottom + 4;
}

export function DataView({ design, selection, onSelect, project }: ViewProps) {
  const memory = useRemembered<DataFormat>('format:data');
  const [format, setFormatState] = useState<DataFormat>(() => memory?.load() ?? 'json');
  const setFormat = (f: DataFormat) => {
    setFormatState(f);
    memory?.save(f);
  };
  const emphasis = useMemo(() => selectionEmphasis(selection, design.doc.edges), [selection, design.doc.edges]);

  return (
    <div className="sgl-dataview" data-view-surface="data" data-data-format={format}>
      <div className="sgl-dataview-toolbar">
        <div className="segmented" role="group" aria-label="Show the design as">
          {DATA_FORMATS.map((f) => (
            <button key={f} type="button" aria-pressed={f === format} onClick={() => setFormat(f)} title={FORMAT_TITLES[f]} data-data-format-option={f}>
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
        <SectionKey format={format} />
        <span className="sgl-dataview-readonly" title="Change the design in Properties or in the other views. This view only shows it.">
          Read-only
        </span>
      </div>
      {format === 'json' ? (
        <JsonPane design={design} emphasis={emphasis} selection={selection} onSelect={onSelect} />
      ) : (
        <TablePane design={design} schema={project?.attributes ?? EMPTY_ATTRIBUTE_SCHEMA} emphasis={emphasis} selection={selection} onSelect={onSelect} />
      )}
    </div>
  );
}

/** Short section names for the column-group headers and the JSON colour key. */
const SECTION_HEAD: Readonly<Record<AttributeSectionId, string>> = {
  identity: 'Identity',
  required: 'Required',
  geometry: 'Geometry',
  custom: 'Custom',
  calculated: 'Calculated',
};

const STORED_SECTIONS: readonly StoredSectionId[] = ['identity', 'required', 'geometry', 'custom'];

/** Colour key of the JSON gutter marks (the table names its column groups itself). */
function SectionKey({ format }: { readonly format: DataFormat }) {
  if (format !== 'json') return null;
  return (
    <ul className="sgl-dataview-key" aria-label="Line colours: attribute sections">
      {STORED_SECTIONS.map((s) => (
        <li key={s} data-section={s} title={ATTRIBUTE_SECTIONS[s].summary}>
          {SECTION_HEAD[s]}
        </li>
      ))}
    </ul>
  );
}

// ── JSON ─────────────────────────────────────────────────────────────────────────────────────

const KEY_LINE = /^(\s*)("(?:[^"\\]|\\.)*")(: ?)(.*)$/;

function JsonPane({
  design,
  emphasis,
  selection,
  onSelect,
}: {
  readonly design: ViewProps['design'];
  readonly emphasis: Emphasis;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
}) {
  const lines = useMemo(() => jsonLines(design.doc), [design.doc]);
  const blocks = useMemo(() => jsonBlocks(lines), [lines]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scroller.current;
    if (!container || selection.kind === 'none') return;
    const el = container.querySelector<HTMLElement>(`[data-record="${selection.kind === 'node' ? 'nodes' : 'edges'}:${selection.id}"]`);
    if (el) revealIn(container, el, 0, true);
  }, [selection, blocks]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-record]');
    if (!el) return;
    const [collection, id] = el.dataset.record!.split(':') as ['nodes' | 'edges', string];
    onSelect(selectionOf(collection, Number(id)));
  };

  return (
    <div
      ref={scroller}
      className="sgl-dataview-scroll sgl-dataview-json"
      role="region"
      aria-label="Design as JSON, as saved"
      tabIndex={0}
      onClick={onClick}
      style={{ '--sgl-dataview-ln': `${String(lines.length).length}ch` } as CSSProperties}
    >
      <div className="sgl-dataview-code">
        {blocks.map((b) => (
          <JsonBlockView key={b.key} block={b} emphasis={b.record ? recordEmphasis(emphasis, b.record) : null} />
        ))}
      </div>
    </div>
  );
}

const JsonBlockView = memo(function JsonBlockView({ block, emphasis }: { readonly block: JsonBlock; readonly emphasis: RowEmphasis }) {
  const lines = block.lines.map((l) => {
    const m = KEY_LINE.exec(l.text);
    return (
      <div key={l.number} className="sgl-dataview-line" data-section={l.section ?? undefined}>
        <span className="sgl-dataview-mark" aria-hidden="true" />
        <span className="sgl-dataview-ln" aria-hidden="true">
          {l.number}
        </span>
        <span className="sgl-dataview-text">
          {m ? (
            <>
              {m[1]}
              <span className="sgl-dataview-key-name">{m[2]}</span>
              {m[3]}
              {m[4]}
            </>
          ) : (
            l.text
          )}
        </span>
      </div>
    );
  });
  if (!block.record) return <>{lines}</>;
  const label = `${block.record.collection === 'nodes' ? 'Node' : 'Edge'} ${block.record.id}`;
  return (
    <div className="sgl-dataview-record" data-record={`${block.record.collection}:${block.record.id}`} data-emphasis={emphasis ?? undefined} title={`${label}: click to select`}>
      {lines}
    </div>
  );
});

// ── Table ────────────────────────────────────────────────────────────────────────────────────

function TablePane({
  design,
  schema,
  emphasis,
  selection,
  onSelect,
}: {
  readonly design: ViewProps['design'];
  readonly schema: NonNullable<ViewProps['project']>['attributes'];
  readonly emphasis: Emphasis;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
}) {
  const enabled = useEnabledMetrics();
  const { doc, spatial } = design;
  const inputs = useMemo(() => ({ ctx: { doc, spatial }, schema, enabled, evaluator: defaultMetricEvaluator }), [doc, spatial, schema, enabled]);
  const nodes = useMemo(() => nodeTable(inputs), [inputs]);
  const edges = useMemo(() => edgeTable(inputs), [inputs]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scroller.current;
    if (!container || selection.kind === 'none') return;
    const el = container.querySelector<HTMLElement>(`tr[data-row="${selection.kind === 'node' ? 'nodes' : 'edges'}:${selection.id}"]`);
    const head = el?.closest('table')?.tHead;
    if (el) revealIn(container, el, head?.offsetHeight ?? 0, false);
  }, [selection, nodes, edges]);

  return (
    <div ref={scroller} className="sgl-dataview-scroll sgl-dataview-tables">
      <DataTableView table={nodes} title="Nodes" emphasis={emphasis} selection={selection} onSelect={onSelect} />
      <DataTableView table={edges} title="Edges" emphasis={emphasis} selection={selection} onSelect={onSelect} />
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="sgl-dataview-lock" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <rect x="1.5" y="4.5" width="7" height="5" rx="1" fill="currentColor" />
      <path d="M3 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}


function DataTableView({
  table,
  title,
  emphasis,
  selection,
  onSelect,
}: {
  readonly table: DataTable;
  readonly title: string;
  readonly emphasis: Emphasis;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
}) {
  const { collection, columns, rows } = table;
  const groups = useMemo(() => columnGroups(columns), [columns]);
  /** First column of each section after the first: drawn with a divider. */
  const starts = useMemo(() => new Set(columns.filter((c, i) => i > 0 && columns[i - 1]!.section !== c.section).map((c) => c.id)), [columns]);
  const selectedHere = (collection === 'nodes' && selection.kind === 'node') || (collection === 'edges' && selection.kind === 'edge') ? (selection as { id: number }).id : null;
  const tabbableId = selectedHere !== null && rows.some((r) => r.id === selectedHere) ? selectedHere : (rows[0]?.id ?? null);
  const select = useCallback((id: number) => onSelect(selectionOf(collection, id)), [onSelect, collection]);

  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const row = (event.target as HTMLElement).closest('tr');
    if (!row) return;
    let next: Element | null = null;
    if (event.key === 'ArrowDown') next = row.nextElementSibling;
    else if (event.key === 'ArrowUp') next = row.previousElementSibling;
    else if (event.key === 'Home') next = row.parentElement?.firstElementChild ?? null;
    else if (event.key === 'End') next = row.parentElement?.lastElementChild ?? null;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(Number(row.dataset.id));
      return;
    } else return;
    event.preventDefault();
    if (next instanceof HTMLElement) next.focus();
  };

  const emphasisOf = (id: number) => (collection === 'nodes' ? nodeEmphasis(emphasis, id) : edgeEmphasis(emphasis, id));

  return (
    <section className="sgl-dataview-table-wrap" aria-label={title}>
      <h3 className="sgl-dataview-table-title">
        {title} <span className="sgl-dataview-count">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="meta sgl-dataview-empty">{collection === 'nodes' ? 'No nodes yet.' : 'No edges yet.'}</p>
      ) : (
        <table className="sgl-dataview-table" aria-label={`${title}: one row per ${collection === 'nodes' ? 'node' : 'edge'}`} data-table={collection}>
          <thead>
            <tr className="sgl-dataview-groups">
              {groups.map((g) => (
                <th key={g.section} scope="colgroup" colSpan={g.span} data-section={g.section} title={ATTRIBUTE_SECTIONS[g.section].summary}>
                  {SECTION_HEAD[g.section]}
                  {g.section === 'calculated' && <LockIcon />}
                </th>
              ))}
            </tr>
            <tr className="sgl-dataview-columns">
              {columns.map((c) => (
                <th key={c.id} scope="col" data-section={c.section} data-column={c.id} title={c.title} className={cellClass(c, starts)}>
                  {c.label}
                  {c.section === 'calculated' && <LockIcon />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody onKeyDown={onKeyDown}>
            {rows.map((r) => (
              <DataRowView key={r.id} collection={collection} row={r} columns={columns} starts={starts} emphasis={emphasisOf(r.id)} tabbable={r.id === tabbableId} onSelect={select} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const DataRowView = memo(function DataRowView({
  collection,
  row,
  columns,
  starts,
  emphasis,
  tabbable,
  onSelect,
}: {
  readonly collection: 'nodes' | 'edges';
  readonly row: DataRow;
  readonly columns: readonly DataColumn[];
  readonly starts: ReadonlySet<string>;
  readonly emphasis: RowEmphasis;
  readonly tabbable: boolean;
  readonly onSelect: (id: number) => void;
}) {
  return (
    <tr
      data-row={`${collection}:${row.id}`}
      data-id={row.id}
      data-emphasis={emphasis ?? undefined}
      aria-current={emphasis === 'primary' ? 'true' : undefined}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onSelect(row.id)}
    >
      {columns.map((c) => (
        <DataCellView key={c.id} column={c} cell={row.cells[c.id]!} className={cellClass(c, starts)} />
      ))}
    </tr>
  );
});

const cellClass = (c: DataColumn, starts: ReadonlySet<string>): string | undefined =>
  [c.numeric ? 'num' : '', starts.has(c.id) ? 'sec-start' : ''].filter(Boolean).join(' ') || undefined;

const ORIGIN_HINT: Partial<Record<DataCell['origin'], string>> = { 'type-default': 'from type', default: 'default', invalid: 'invalid' };

/** One read-only cell. Worktree G slots its editors in here (Identity and Calculated stay locked). */
function DataCellView({ column, cell, className }: { readonly column: DataColumn; readonly cell: DataCell; readonly className: string | undefined }) {
  const hint = ORIGIN_HINT[cell.origin];
  const Cell = column.id === 'id' ? 'th' : 'td';
  return (
    <Cell
      {...(Cell === 'th' && { scope: 'row' })}
      data-section={column.section}
      data-column={column.id}
      data-origin={cell.origin}
      className={className}
      title={cell.title}
    >
      {cell.text}
      {hint && <span className="sgl-dataview-hint">{hint}</span>}
    </Cell>
  );
}
