import type { DiagramPosition } from './primitives';

/**
 * Graph 2D diagram positions (`doc.diagram.positions`): the display layout for nodes that have no
 * stored position, and the rules that store positions without moving anything already shown.
 * Pure. Diagram positions are never derived from grid cells.
 */

/** Nominal node box in diagram units; used for fallback spacing and new-node placement. */
export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 64;
export const DIAGRAM_GAP_X = 190;
export const DIAGRAM_GAP_Y = 110;
const FALLBACK_COLUMNS = 6;

/** The part of a design document the diagram layout reads. */
export interface DiagramSource {
  readonly nodes: readonly { readonly id: number }[];
  readonly diagram: { readonly positions: Readonly<Record<string, DiagramPosition>> };
}

/**
 * Display positions for every node: the stored diagram position when present, otherwise a
 * deterministic fallback. Fallbacks are laid out in rows below the stored positions, ordered by
 * node ID, so they are stable across renders and independent of grid cells. Nothing is written
 * to the document here; see `settleDiagramPositions` for how fallbacks become stored.
 */
export function resolveDiagramPositions(doc: DiagramSource): ReadonlyMap<number, DiagramPosition> {
  const result = new Map<number, DiagramPosition>();
  const missing: number[] = [];
  let minX = Infinity;
  let maxY = -Infinity;
  for (const node of doc.nodes) {
    const stored = doc.diagram.positions[node.id];
    if (stored) {
      result.set(node.id, stored);
      minX = Math.min(minX, stored[0]);
      maxY = Math.max(maxY, stored[1]);
    } else {
      missing.push(node.id);
    }
  }
  const originX = Number.isFinite(minX) ? minX : 0;
  const originY = Number.isFinite(maxY) ? maxY + DIAGRAM_GAP_Y + NODE_HEIGHT : 0;
  missing.sort((a, b) => a - b);
  missing.forEach((id, i) => {
    const col = i % FALLBACK_COLUMNS;
    const row = Math.floor(i / FALLBACK_COLUMNS);
    result.set(id, [originX + col * DIAGRAM_GAP_X, originY + row * DIAGRAM_GAP_Y]);
  });
  return result;
}

/**
 * The stored positions plus the position currently SHOWN for every node that has none.
 *
 * The fallback layout depends on the stored positions (its origin) and on which nodes are missing
 * (their order), so storing one node's position would make every unstored node jump. Every
 * command that stores a diagram position therefore starts from this record: what the user sees is
 * kept, and only the node they placed moves (2026-11-23).
 */
export function settleDiagramPositions(doc: DiagramSource): Record<string, DiagramPosition> {
  const positions: Record<string, DiagramPosition> = {};
  for (const [id, p] of resolveDiagramPositions(doc)) positions[id] = [p[0], p[1]];
  return positions;
}

/**
 * Diagram positions for nodes an algorithm has just added (`added`), read from the relationships
 * only — never from grid cells. The new nodes are placed below everything shown so far (`shown`,
 * the existing nodes' positions), one block per connected group of new nodes: a node's column is
 * its relationship distance from the group's start (new nodes related to an existing node, else
 * the group's lowest id); within a column, nodes follow the rows of the nodes that reached them,
 * then id. Deterministic.
 */
export function layoutAddedDiagramNodes(
  edges: readonly { readonly source: number; readonly target: number }[],
  added: readonly number[],
  shown: Readonly<Record<string, DiagramPosition>>,
): Record<string, DiagramPosition> {
  const result: Record<string, DiagramPosition> = {};
  if (added.length === 0) return result;
  const isAdded = new Set(added);
  const neighbours = new Map<number, number[]>(added.map((id) => [id, []]));
  const touchesExisting = new Set<number>();
  for (const e of edges) {
    const a = isAdded.has(e.source);
    const b = isAdded.has(e.target);
    if (a && b) {
      neighbours.get(e.source)!.push(e.target);
      neighbours.get(e.target)!.push(e.source);
    } else if (a && shown[e.target]) touchesExisting.add(e.source);
    else if (b && shown[e.source]) touchesExisting.add(e.target);
  }
  for (const list of neighbours.values()) list.sort((x, y) => x - y);

  const taken = Object.values(shown);
  const originX = taken.length ? Math.min(...taken.map((p) => p[0])) : 0;
  let top = taken.length ? Math.max(...taken.map((p) => p[1])) + DIAGRAM_GAP_Y + NODE_HEIGHT : 0;

  const placed = new Set<number>();
  for (const seed of [...added].sort((x, y) => x - y)) {
    if (placed.has(seed)) continue;
    // The connected group of new nodes containing `seed`.
    const group: number[] = [];
    const stack = [seed];
    const inGroup = new Set([seed]);
    while (stack.length) {
      const id = stack.pop()!;
      group.push(id);
      for (const n of neighbours.get(id)!) if (!inGroup.has(n)) (inGroup.add(n), stack.push(n));
    }
    group.sort((x, y) => x - y);
    const starts = group.filter((id) => touchesExisting.has(id));
    let layer = starts.length ? starts : [group[0]!];
    const row = new Map<number, number>();
    layer.forEach((id, i) => row.set(id, i));
    let column = 0;
    let height = 0;
    while (layer.length) {
      for (const id of layer) {
        placed.add(id);
        result[id] = [originX + column * DIAGRAM_GAP_X, top + row.get(id)! * DIAGRAM_GAP_Y];
      }
      height = Math.max(height, layer.length);
      // Next column: unplaced neighbours, ordered by the row of the first node that reached them.
      const parentRow = new Map<number, number>();
      for (const id of layer) {
        for (const n of neighbours.get(id)!) {
          if (placed.has(n) || layer.includes(n)) continue;
          const r = row.get(id)!;
          if (!parentRow.has(n) || r < parentRow.get(n)!) parentRow.set(n, r);
        }
      }
      layer = [...parentRow.keys()].sort((x, y) => parentRow.get(x)! - parentRow.get(y)! || x - y);
      layer.forEach((id, i) => row.set(id, i));
      column++;
    }
    top += height * DIAGRAM_GAP_Y;
  }
  return result;
}
