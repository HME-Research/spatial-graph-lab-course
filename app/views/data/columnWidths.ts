/**
 * Resizable Data table columns (owner 2026-11-20). A column the student resized has a fixed width
 * (its text is cut with "…" when narrower); the others keep their natural width. Widths are kept per
 * viewport and table (panel memory), never in the document. Pure.
 */

export const MIN_COLUMN_WIDTH = 40;
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
 * CSS for the resized columns of one table: every heading and cell of the column (matched by
 * `data-column`) gets that width; longer text ends with "…". `scope` is the table's
 * `data-width-scope` value.
 */
export function columnWidthCss(scope: string, widths: ColumnWidths): string {
  const table = `.sgl-dataview-table[data-width-scope=${JSON.stringify(scope)}]`;
  return Object.entries(widths)
    .map(([id, w]) => {
      const px = `${clampColumnWidth(w)}px`;
      return `${table} [data-column=${JSON.stringify(id)}]{width:${px};min-width:${px};max-width:${px};overflow:hidden;text-overflow:ellipsis}`;
    })
    .join('\n');
}
