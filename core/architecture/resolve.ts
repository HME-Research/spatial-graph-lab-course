import { gridKey, unorderedPairKey, type DesignDocument, type GraphEdge, type GraphNode, type GridCoord } from '../spatial';
import {
  FACE_DIRECTION_OFFSETS,
  FACE_DIRECTIONS,
  type FaceDirection,
  type FaceOrientation,
  type FaceResolver,
  type ResolvedFace,
} from './contracts';

/**
 * Pure architectural face resolution (workstream C, docs/VIEWER-CONTRACTS.md §C).
 * Works only in grid space: no React, no Three.js, no world units.
 */

/** Sparse lookup of occupied cells and explicit relationships for one document. */
export interface CellIndex {
  readonly nodeAt: ReadonlyMap<string, GraphNode>;
  readonly edgeBetween: ReadonlyMap<string, GraphEdge>;
}

export function buildCellIndex(doc: DesignDocument): CellIndex {
  const nodeAt = new Map<string, GraphNode>();
  for (const node of doc.nodes) nodeAt.set(gridKey(node.grid), node);
  const edgeBetween = new Map<string, GraphEdge>();
  for (const edge of doc.edges) edgeBetween.set(unorderedPairKey(edge.source, edge.target), edge);
  return { nodeAt, edgeBetween };
}

export const directionOrientation = (direction: FaceDirection): FaceOrientation =>
  direction === '+z' || direction === '-z' ? 'slab' : 'wall';

export const neighbourCell = (cell: GridCoord, direction: FaceDirection): GridCoord => {
  const o = FACE_DIRECTION_OFFSETS[direction];
  return [cell[0] + o[0], cell[1] + o[1], cell[2] + o[2]];
};

/** One of the six cardinal neighbour slots of a cell; `node` is null for an unoccupied cell. */
export interface NeighbourSlot {
  readonly direction: FaceDirection;
  readonly cell: GridCoord;
  readonly node: GraphNode | null;
}

/** The six neighbour slots of `node` in FACE_DIRECTIONS order, marking which are occupied. */
export function neighbourSlots(index: CellIndex, node: GraphNode): readonly NeighbourSlot[] {
  return FACE_DIRECTIONS.map((direction) => {
    const cell = neighbourCell(node.grid, direction);
    return { direction, cell, node: index.nodeAt.get(gridKey(cell)) ?? null };
  });
}

/**
 * Every face of every occupied cell exactly once.
 * - No occupied neighbour → `exterior`, authored by the only node.
 * - Occupied neighbour without an edge → `solid`; with an edge → the edge's kind.
 * - A shared face is authored only by the node whose ID sorts first (`a < b`).
 * Sorted by ownerNodeId then FACE_DIRECTIONS order; independent of node/edge array order.
 * Expects a validated document (unique cells, edge kinds that match adjacency).
 */
export const resolveFaces: FaceResolver = (doc) => {
  const index = buildCellIndex(doc);
  const nodes = [...doc.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const faces: ResolvedFace[] = [];
  for (const node of nodes) {
    for (const slot of neighbourSlots(index, node)) {
      const neighbour = slot.node;
      if (neighbour !== null && !(node.id < neighbour.id)) continue; // the neighbour authors it
      const edge = neighbour ? (index.edgeBetween.get(unorderedPairKey(node.id, neighbour.id)) ?? null) : null;
      faces.push({
        id: `${node.id}:${slot.direction}`,
        ownerNodeId: node.id,
        ownerTypeId: node.typeId,
        cell: node.grid,
        direction: slot.direction,
        orientation: directionOrientation(slot.direction),
        neighbourNodeId: neighbour?.id ?? null,
        edgeId: edge?.id ?? null,
        condition: neighbour === null ? 'exterior' : (edge?.kind ?? 'solid'),
      });
    }
  }
  return faces;
};
