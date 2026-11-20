/**
 * Resizable Data table columns (owner 2026-11-20), like a spreadsheet: a column the student resized
 * has exactly that width, also narrower than its text (values are cut with "…", headings wrap); the
 * others keep their natural width; double-clicking the edge fits the column to its content again. Widths are kept per
 * viewport and table (panel memory), never in the document. Pure.
 */

export const MIN_COLUMN_WIDTH = 24;
/** Left + right padding of a table cell (data.css: `padding: 4px 10px`). */
export const CELL_PADDING_X = 20;
export const MAX_COLUMN_WIDTH = 800;
/** Arrow-key step of a column resize handle, in px. */
export const COLUMN_KEY_STEP = 10;

export type ColumnWidths = Readonly<Record<string, number>>;

export const clampColumnWidth = (width: number): number => Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));

/** The widths after setting (or, with null, clearing) one column's width. */
export function withColumnWidth(widths: ColumnWidths, columnId: string, width: number | null): ColumnWidths {
  const next: Record<string, number> = { ...widths };
  if (width === null) delete next[columnId];
  else next[columnId] = clampColumnWidth(width);
  return next;
}

/** The new width for a key on a resize handle (ArrowLeft / ArrowRight), or null for other keys. */
export function keyboardColumnWidth(current: number, key: string): number | null {
  if (key === 'ArrowLeft') return clampColumnWidth(current - COLUMN_KEY_STEP);
  if (key === 'ArrowRight') return clampColumnWidth(current + COLUMN_KEY_STEP);
  return null;
}

/**
 * CSS for the resized columns of one table: the content box of every heading and cell of the column
 * (matched by `data-column`) gets the width minus the cell padding. Sizing the content, not the cell,
 * is what lets a column become narrower than its text: browsers never shrink a table cell below its
 * content. `scope` is the table's `data-width-scope` value.
 */
export function columnWidthCss(scope: string, widths: ColumnWidths): string {
  const table = `.sgl-dataview-table[data-width-scope=${JSON.stringify(scope)}]`;
  return Object.entries(widths)
    .map(([id, w]) => {
      const column = `${table} [data-column=${JSON.stringify(id)}]`;
      const px = `${clampColumnWidth(w) - CELL_PADDING_X}px`;
      return `${column} > .sgl-dataview-cell,${column} > .sgl-dataview-head{width:${px};min-width:${px};max-width:${px}}`;
    })
    .join('\n');
}

/**
 * A column heading on two lines (owner 2026-11-20: narrower columns by default, like a spreadsheet's
 * wrapped header): a trailing part in brackets goes on its own line, e.g. "z (Level)" → "z" /
 * "(Level)", "Target area (m²)" → "Target area" / "(m²)". Labels without one stay on one line.
 */
export function headingLines(label: string): readonly [string, string | null] {
  const match = /^(.*\S)\s+(\([^()]*\))$/.exec(label);
  return match ? [match[1]!, match[2]!] : [label, null];
}
