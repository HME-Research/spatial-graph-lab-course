import { gridKey, type GridCoord } from '@core/spatial';
import { footprintCells, type DesignDocumentV2 } from '@app/document/v2';
import type { CellOccupant, EdgeResolution, Occupancy } from './contracts';

/**
 * One occupancy map for room footprints and generated connector reservations. Rooms are entered
 * first; a route cell that is already occupied is a resolver bug and throws.
 */
export function buildOccupancy(doc: DesignDocumentV2, resolutions: Iterable<EdgeResolution> = []): Occupancy {
  const cells = new Map<string, CellOccupant>();
  for (const node of doc.nodes) {
    for (const cell of footprintCells(node)) cells.set(gridKey(cell), { kind: 'room', nodeId: node.id });
  }
  for (const r of resolutions) {
    if (r.status !== 'routed') continue;
    for (const cell of r.route.cells) {
      const key = gridKey(cell);
      if (cells.has(key)) throw new Error(`route of edge "${r.edgeId}" reserves occupied cell ${key}`);
      cells.set(key, { kind: 'route', edgeId: r.edgeId });
    }
  }
  return { cells, at: (cell: GridCoord) => cells.get(gridKey(cell)) };
}
