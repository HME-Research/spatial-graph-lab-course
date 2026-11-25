import { selectEdge, selectNode, type Emphasis, type Selection } from '@core/viewer/selection';
import type { RecordRef } from './dataModel';

/** Selection helpers shared by the JSON and table panes of the Data view. */

export type RowEmphasis = 'primary' | 'secondary' | null;

export const nodeEmphasis = (e: Emphasis, id: number): RowEmphasis => (e.primaryNodes.has(id) ? 'primary' : e.secondaryNodes.has(id) ? 'secondary' : null);
export const edgeEmphasis = (e: Emphasis, id: number): RowEmphasis => (e.edges.has(id) ? 'primary' : null);
export const recordEmphasis = (e: Emphasis, r: RecordRef): RowEmphasis => (r.collection === 'nodes' ? nodeEmphasis(e, r.id) : edgeEmphasis(e, r.id));
export const selectionOf = (collection: 'nodes' | 'edges', id: number): Selection => (collection === 'nodes' ? selectNode(id) : selectEdge(id));

/**
 * Scroll `container` (only — never the page) so `el` is visible below `topInset` px (a sticky
 * header). `start`: bring the element's top into view when any part of it is hidden.
 */
export function revealIn(container: HTMLElement, el: HTMLElement, topInset: number, start: boolean): void {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = c.top + topInset;
  if (r.top < top || (start && r.bottom > c.bottom)) container.scrollTop += r.top - top - (start ? 24 : 4);
  else if (r.bottom > c.bottom) container.scrollTop += r.bottom - c.bottom + 4;
}

/** Scroll `container` sideways so `el` is visible right of `leftInset` px (the sticky ID column). */
export function revealSideways(container: HTMLElement, el: HTMLElement, leftInset: number): void {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const left = c.left + leftInset;
  if (r.left < left) container.scrollLeft += r.left - left - 4;
  else if (r.right > c.right) container.scrollLeft += r.right - c.right + 4;
}
