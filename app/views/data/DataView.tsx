import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ATTRIBUTE_SECTIONS, type AttributeSectionId } from '@app/attributes/sections';
import { EMPTY_ATTRIBUTE_SCHEMA } from '@app/extensions';
import { defaultMetricEvaluator } from '@app/metrics';
import { selectionEmphasis, type Emphasis, type Selection, type SelectionHandler } from '@core/viewer/selection';
import type { ViewProps } from '../contracts';
import { useRemembered } from '../panelMemory';
import { useEnabledMetrics } from '../three/enabledMetrics';
import { DataCellEditorContext, type CellEditorProps, type CellMove } from './cellEditing';
import { columnGroups, edgeTable, nodeTable, type DataCell, type DataColumn, type DataRow, type DataTable, type StoredSectionId } from './dataModel';
import { edgeEmphasis, nodeEmphasis, revealIn, revealSideways, selectionOf, type RowEmphasis } from './dataSelection';
import { JsonPane } from './JsonPane';
import './data.css';

/**
 * Data view (Programme P4): the same graph as text and as a table. A graph does not have to be a
 * diagram. Selection is shared both ways with every other view.
 *
 * - JSON (worktree D): exactly as saved; read-only (`JsonPane`).
 * - Table (worktree G): Function / Relationship, Geometry and Custom cells are editable; Identity
 *   and Calculated are locked. The view never builds or sends a command itself: the cell editor is
 *   provided by the shell (`DataCellEditorContext`) and uses the same validated commands as
 *   Properties, so every edit is one undo step. Without that provider the table is read-only.
 */

export const DATA_FORMATS = ['json', 'table'] as const;
export type DataFormat = (typeof DATA_FORMATS)[number];
const FORMAT_LABELS: Readonly<Record<DataFormat, string>> = { json: 'JSON', table: 'Table' };
const FORMAT_TITLES: Readonly<Record<DataFormat, string>> = {
  json: 'The design exactly as it is saved: stored values only, no calculated values or defaults. Read-only.',
  table: 'One row per node and per edge; columns grouped by attribute section.',
};

export function DataView({ design, selection, onSelect, project }: ViewProps) {
  const memory = useRemembered<DataFormat>('format:data');
  const [format, setFormatState] = useState<DataFormat>(() => memory?.load() ?? 'json');
  const setFormat = (f: DataFormat) => {
    setFormatState(f);
    memory?.save(f);
  };
  const emphasis = useMemo(() => selectionEmphasis(selection, design.doc.edges), [selection, design.doc.edges]);
  const editable = useContext(DataCellEditorContext) !== null && format === 'table';

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
        {editable ? (
          <span className="sgl-dataview-readonly" title="Click a cell, or press Enter on it, to edit. Enter or Tab applies, Esc cancels. Identity and Calculated are locked.">
            Click a cell to edit
          </span>
        ) : (
          <span className="sgl-dataview-readonly" title="The JSON shows the design exactly as saved. Change it in the Table, in Properties or in the other views.">
            Read-only
          </span>
        )}
      </div>
      {format === 'json' ? (
        <JsonPane design={design} emphasis={emphasis} selection={selection} onSelect={onSelect} />
      ) : (
        <TablePane design={design} project={project} emphasis={emphasis} selection={selection} onSelect={onSelect} />
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

// ── Table ────────────────────────────────────────────────────────────────────────────────────

/** The cell being edited. */
interface EditingCell {
  readonly collection: 'nodes' | 'edges';
  readonly rowId: number;
  readonly columnId: string;
  readonly initialText?: string;
}

/** What the cell being edited needs from the table (read only by `EditingCellSlot`). */
interface EditSession {
  readonly Editor: ComponentType<CellEditorProps>;
  readonly design: ViewProps['design'];
  readonly project: ViewProps['project'];
  readonly editing: EditingCell | null;
  readonly onClose: (move: CellMove) => void;
  readonly onFeedback: (feedback: ReactNode | null) => void;
}

const EditSessionContext = createContext<EditSession | null>(null);

/** Editable cells of a table in reading order (rows, then columns). */
const editableCells = (scope: ParentNode): HTMLElement[] => [...scope.querySelectorAll<HTMLElement>('tbody [data-editable]')];

function TablePane({
  design,
  project,
  emphasis,
  selection,
  onSelect,
}: {
  readonly design: ViewProps['design'];
  readonly project: ViewProps['project'];
  readonly emphasis: Emphasis;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
}) {
  const enabled = useEnabledMetrics();
  const Editor = useContext(DataCellEditorContext);
  const { doc, spatial } = design;
  const schema = project?.attributes ?? EMPTY_ATTRIBUTE_SCHEMA;
  const toolkit = project?.project ?? null;
  const inputs = useMemo(
    () => ({ ctx: { doc, spatial }, schema, enabled, evaluator: defaultMetricEvaluator, toolkit }),
    [doc, spatial, schema, enabled, toolkit],
  );
  const nodes = useMemo(() => nodeTable(inputs), [inputs]);
  const edges = useMemo(() => edgeTable(inputs), [inputs]);
  const scroller = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [feedback, setFeedback] = useState<ReactNode | null>(null);
  /** Where the focus goes once the editor is gone. */
  const focusAfter = useRef<HTMLElement | null>(null);

  // A message (or a corridor confirmation) belongs to the document it was made for.
  useEffect(() => setFeedback(null), [doc]);

  useEffect(() => {
    const container = scroller.current;
    if (!container || selection.kind === 'none') return;
    const el = container.querySelector<HTMLElement>(`tr[data-row="${selection.kind === 'node' ? 'nodes' : 'edges'}:${selection.id}"]`);
    const head = el?.closest('table')?.tHead;
    if (el) revealIn(container, el, head?.offsetHeight ?? 0, false);
  }, [selection, nodes, edges]);

  const focusCell = useCallback((el: HTMLElement) => {
    el.focus({ preventScroll: true });
    const container = scroller.current;
    if (!container) return;
    const table = el.closest('table');
    revealIn(container, el, table?.tHead?.offsetHeight ?? 0, false);
    revealSideways(container, el, table?.querySelector<HTMLElement>('tbody [data-column="id"]')?.offsetWidth ?? 0);
  }, []);

  useEffect(() => {
    if (editing !== null || !focusAfter.current) return;
    const el = focusAfter.current;
    focusAfter.current = null;
    if (el.isConnected) focusCell(el);
  }, [editing, focusCell]);

  const startEdit = useCallback(
    (cell: EditingCell) => {
      if (!Editor) return;
      setEditing((current) =>
        current && current.collection === cell.collection && current.rowId === cell.rowId && current.columnId === cell.columnId ? current : cell,
      );
      onSelect(selectionOf(cell.collection, cell.rowId));
    },
    [Editor, onSelect],
  );

  const session = useMemo((): EditSession | null => {
    if (!Editor) return null;
    const onClose = (move: CellMove) => {
      const container = scroller.current;
      if (editing && container && move !== 'none') {
        const here = container.querySelector<HTMLElement>(`tr[data-row="${editing.collection}:${editing.rowId}"] > [data-column="${CSS.escape(editing.columnId)}"]`);
        const table = here?.closest('table');
        if (here && table) {
          const all = editableCells(table);
          const i = all.indexOf(here);
          focusAfter.current = move === 'stay' ? here : (all[move === 'next' ? i + 1 : i - 1] ?? here);
        }
      }
      setEditing(null);
    };
    return { Editor, design, project, editing, onClose, onFeedback: setFeedback };
  }, [Editor, design, project, editing]);

  const tables = (
    <>
      <DataTableView table={nodes} title="Nodes" emphasis={emphasis} selection={selection} onSelect={onSelect} editing={editing} canEdit={Editor !== null} onStartEdit={startEdit} />
      <DataTableView table={edges} title="Edges" emphasis={emphasis} selection={selection} onSelect={onSelect} editing={editing} canEdit={Editor !== null} onStartEdit={startEdit} />
    </>
  );

  return (
    <div className="sgl-dataview-table-pane">
      {feedback !== null && <div className="sgl-dataview-feedback">{feedback}</div>}
      <div ref={scroller} className="sgl-dataview-scroll sgl-dataview-tables">
        {session ? <EditSessionContext.Provider value={session}>{tables}</EditSessionContext.Provider> : tables}
      </div>
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

const lockedSection = (section: AttributeSectionId): boolean => !ATTRIBUTE_SECTIONS[section].editable;

/** A key that types a character (starts editing with it). */
const typesCharacter = (event: KeyboardEvent): boolean => event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey;

function DataTableView({
  table,
  title,
  emphasis,
  selection,
  onSelect,
  editing,
  canEdit,
  onStartEdit,
}: {
  readonly table: DataTable;
  readonly title: string;
  readonly emphasis: Emphasis;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
  readonly editing: EditingCell | null;
  /** A cell editor is available (otherwise the table is read-only). */
  readonly canEdit: boolean;
  readonly onStartEdit: (cell: EditingCell) => void;
}) {
  const { collection, columns, rows } = table;
  const groups = useMemo(() => columnGroups(columns), [columns]);
  /** First column of each section after the first: drawn with a divider. */
  const starts = useMemo(() => new Set(columns.filter((c, i) => i > 0 && columns[i - 1]!.section !== c.section).map((c) => c.id)), [columns]);
  const selectedHere = (collection === 'nodes' && selection.kind === 'node') || (collection === 'edges' && selection.kind === 'edge') ? (selection as { id: number }).id : null;
  const tabbableId = selectedHere !== null && rows.some((r) => r.id === selectedHere) ? selectedHere : (rows[0]?.id ?? null);
  const select = useCallback((id: number) => onSelect(selectionOf(collection, id)), [onSelect, collection]);
  const startEdit = (rowId: number, columnId: string, initialText?: string) =>
    onStartEdit({ collection, rowId, columnId, ...(initialText !== undefined && { initialText }) });

  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement;
    // The editor handles its own keys.
    if (target.closest('[data-editing]')) return;
    const row = target.closest('tr');
    if (!row) return;
    const rowId = Number(row.dataset.id);
    const cellsOf = (tr: Element | null) => (tr ? [...tr.querySelectorAll<HTMLElement>(':scope > [data-editable]')] : []);
    const focus = (el: Element | null | undefined) => {
      if (el instanceof HTMLElement) {
        event.preventDefault();
        el.focus();
      }
    };

    // A focused editable cell.
    if (target !== row && target.matches('[data-editable]')) {
      const own = cellsOf(row);
      const i = own.indexOf(target);
      const column = target.dataset.column!;
      const sameColumn = (tr: Element | null) => tr?.querySelector<HTMLElement>(`:scope > [data-column="${CSS.escape(column)}"]`);
      switch (event.key) {
        case 'ArrowLeft':
          return focus(i > 0 ? own[i - 1] : row);
        case 'ArrowRight':
          return focus(own[i + 1]);
        case 'ArrowUp':
          return focus(sameColumn(row.previousElementSibling));
        case 'ArrowDown':
          return focus(sameColumn(row.nextElementSibling));
        case 'Escape':
          return focus(row);
        case 'Enter':
        case 'F2':
          event.preventDefault();
          return startEdit(rowId, column);
        default:
          if (typesCharacter(event)) {
            event.preventDefault();
            startEdit(rowId, column, event.key);
          }
          return;
      }
    }

    // A focused row (worktree D's navigation; ArrowRight enters its first editable cell).
    let next: Element | null = null;
    if (event.key === 'ArrowDown') next = row.nextElementSibling;
    else if (event.key === 'ArrowUp') next = row.previousElementSibling;
    else if (event.key === 'Home') next = row.parentElement?.firstElementChild ?? null;
    else if (event.key === 'End') next = row.parentElement?.lastElementChild ?? null;
    else if (event.key === 'ArrowRight') next = cellsOf(row)[0] ?? null;
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(rowId);
      return;
    } else return;
    focus(next);
  };

  /** A click selects the row everywhere; on an editable cell it also starts editing that cell. */
  const onClick = (event: MouseEvent<HTMLTableSectionElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-editing]')) return; // inside the editor
    const row = target.closest<HTMLElement>('tr[data-id]');
    if (!row) return;
    const cell = target.closest<HTMLElement>('[data-editable]');
    if (cell) startEdit(Number(row.dataset.id), cell.dataset.column!);
    else select(Number(row.dataset.id));
  };

  const emphasisOf = (id: number) => (collection === 'nodes' ? nodeEmphasis(emphasis, id) : edgeEmphasis(emphasis, id));
  const editingHere = editing?.collection === collection ? editing : null;

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
                  {lockedSection(g.section) && <LockIcon />}
                </th>
              ))}
            </tr>
            <tr className="sgl-dataview-columns">
              {columns.map((c) => (
                <th key={c.id} scope="col" data-section={c.section} data-column={c.id} title={c.title} className={cellClass(c, starts)}>
                  {c.label}
                  {!c.editable && <LockIcon />}
                  {/* The shared `.sgl-source-tag` style of app/ui/SourceTag (views may not import the shell's component). */}
                  {c.tag !== undefined && (
                    <span className="sgl-source-tag sgl-dataview-tag" title={c.tag === 'Yours' ? 'Added in this project: you can delete it in Attributes.' : 'Comes from the toolkit: it cannot be deleted.'}>
                      {c.tag}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody onKeyDown={onKeyDown} onClick={onClick}>
            {rows.map((r) => (
              <DataRowView
                key={r.id}
                collection={collection}
                row={r}
                columns={columns}
                starts={starts}
                emphasis={emphasisOf(r.id)}
                tabbable={r.id === tabbableId}
                canEdit={canEdit}
                editingColumn={editingHere?.rowId === r.id ? editingHere.columnId : null}
              />
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
  canEdit,
  editingColumn,
}: {
  readonly collection: 'nodes' | 'edges';
  readonly row: DataRow;
  readonly columns: readonly DataColumn[];
  readonly starts: ReadonlySet<string>;
  readonly emphasis: RowEmphasis;
  readonly tabbable: boolean;
  readonly canEdit: boolean;
  /** The column of this row being edited, if any. */
  readonly editingColumn: string | null;
}) {
  return (
    <tr
      data-row={`${collection}:${row.id}`}
      data-id={row.id}
      data-emphasis={emphasis ?? undefined}
      aria-current={emphasis === 'primary' ? 'true' : undefined}
      tabIndex={tabbable ? 0 : -1}
    >
      {columns.map((c) => (
        <DataCellView
          key={c.id}
          collection={collection}
          rowId={row.id}
          column={c}
          cell={row.cells[c.id]!}
          className={cellClass(c, starts)}
          editable={canEdit && c.editable}
          editing={editingColumn === c.id}
        />
      ))}
    </tr>
  );
});

const cellClass = (c: DataColumn, starts: ReadonlySet<string>): string | undefined =>
  [c.numeric ? 'num' : '', starts.has(c.id) ? 'sec-start' : ''].filter(Boolean).join(' ') || undefined;

const ORIGIN_HINT: Partial<Record<DataCell['origin'], string>> = { 'type-default': 'from type', default: 'default', invalid: 'invalid' };

/** One cell: the value, or its editor while it is edited. Locked cells are never focusable. */
function DataCellView({
  collection,
  rowId,
  column,
  cell,
  className,
  editable,
  editing,
}: {
  readonly collection: 'nodes' | 'edges';
  readonly rowId: number;
  readonly column: DataColumn;
  readonly cell: DataCell;
  readonly className: string | undefined;
  readonly editable: boolean;
  readonly editing: boolean;
}) {
  const hint = ORIGIN_HINT[cell.origin];
  const Cell = column.id === 'id' ? 'th' : 'td';
  const title = editable ? `${cell.title ? `${cell.title}\n` : ''}Click or press Enter to edit.` : cell.title;
  return (
    <Cell
      {...(Cell === 'th' && { scope: 'row' })}
      data-section={column.section}
      data-column={column.id}
      data-origin={cell.origin}
      data-editable={editable || undefined}
      data-editing={editing || undefined}
      tabIndex={editable && !editing ? -1 : undefined}
      className={className}
      title={editing ? undefined : title}
    >
      {editing ? (
        <EditingCellSlot collection={collection} rowId={rowId} column={column} />
      ) : (
        <>
          {cell.text}
          {hint && <span className="sgl-dataview-hint">{hint}</span>}
        </>
      )}
    </Cell>
  );
}

function EditingCellSlot({ collection, rowId, column }: { readonly collection: 'nodes' | 'edges'; readonly rowId: number; readonly column: DataColumn }) {
  const session = useContext(EditSessionContext);
  if (!session || !session.editing) return null;
  const { Editor, design, project, editing, onClose, onFeedback } = session;
  return (
    <Editor
      design={design}
      project={project}
      collection={collection}
      itemId={rowId}
      columnId={column.id}
      label={`${collection === 'nodes' ? 'Node' : 'Edge'} ${rowId}: ${column.label}`}
      {...(editing.initialText !== undefined && { initialText: editing.initialText })}
      onClose={onClose}
      onFeedback={onFeedback}
    />
  );
}
