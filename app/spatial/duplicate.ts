import { gridKey, type GridCoord } from '@core/spatial';
import {
  DEFAULT_LIMITS,
  type DesignDocumentV2,
  type DiagramPosition,
  footprintCells,
  type GraphLimits,
  nodeLabel,
  type RoomSize,
} from '@app/document';
import type { DesignCommand } from './commands';
import type { Occupancy, RelationshipResolver } from './contracts';
import { resolveRelationships } from './resolve';

/**
 * Duplicate a room (owner request 2026-11-20): a new room with the same function, size and STORED
 * custom values, in the closest free place. Relationships are not copied. Pure.
 *
 * Free place: every cell of the copy's box lies inside the coordinate limits and is neither a room
 * cell nor a generated corridor cell (the same cells `add-node` refuses to take silently).
 *
 * Search order:
 * 1. The original's storey (same minimum z) first. Candidates are ordered by
 *    a) the GAP between the two boxes: the number of empty cells between them along x or y,
 *       whichever is larger (0 = touching side or corner, 1 = one cell in between, …);
 *    b) then the squared distance between the box centres (dx² + dy² of the offset);
 *    c) then the main direction of the offset in the order +x, −x, +y, −y (the axis with the
 *       larger |offset|; on a diagonal tie, x);
 *    d) then larger dx, then larger dy (fully deterministic).
 * 2. Only when nothing fits on that storey within the limits: the other storeys in the order
 *    z+1, z−1, z+2, z−2, … each searched the same way. Rooms need no support in the app, so a copy
 *    may stand on an empty storey.
 */

export interface DuplicateOptions {
  /** Extra occupancy to respect, e.g. the corridors the views show (`DesignPort.spatial`). */
  readonly occupancy?: Occupancy;
  /** Defaults to `resolveRelationships` (the resolver `add-node` checks against). */
  readonly resolve?: RelationshipResolver;
  readonly limits?: Partial<GraphLimits>;
}

export type DuplicatePlacement =
  | { readonly status: 'placed'; readonly position: GridCoord }
  | { readonly status: 'no-space'; readonly message: string };

export type DuplicateRequest =
  | {
      readonly status: 'command';
      /** The copy's id: the document's `nextNodeId`. */
      readonly nodeId: number;
      readonly sourceId: number;
      readonly position: GridCoord;
      readonly command: Extract<DesignCommand, { readonly type: 'add-node' }>;
    }
  | { readonly status: 'refused'; readonly message: string };

type Offset = readonly [number, number];

/** Box gap of an offset between two equal boxes of footprint `sx` × `sy` (see the module comment). */
const gapOf = (dx: number, dy: number, sx: number, sy: number): number => Math.max(0, Math.abs(dx) - sx, Math.abs(dy) - sy);

const directionRank = ([dx, dy]: Offset): number => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 1) : dy > 0 ? 2 : 3);

/**
 * Offsets whose gap is exactly `gap`, in search order. `sameStorey`: offsets whose box would overlap
 * the original's footprint are left out (on another storey, straight above or below is the closest).
 * Pure; exported for tests.
 */
export function ringOffsets(gap: number, sx: number, sy: number, sameStorey = true): Offset[] {
  const ex = sx + gap;
  const ey = sy + gap;
  const out: Offset[] = [];
  for (let dy = -ey; dy <= ey; dy++)
    for (let dx = -ex; dx <= ex; dx++) {
      if (gapOf(dx, dy, sx, sy) !== gap) continue;
      if (sameStorey && gap === 0 && Math.abs(dx) < sx && Math.abs(dy) < sy) continue; // overlaps the original
      out.push([dx + 0, dy + 0]); // `+ 0` normalises -0
    }
  return out.sort(
    (a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || directionRank(a) - directionRank(b) || b[0] - a[0] || b[1] - a[1],
  );
}

/** The closest free place for a copy of room `nodeId` (module comment), or why there is none. */
export function findDuplicatePlacement(doc: DesignDocumentV2, nodeId: number, options: DuplicateOptions = {}): DuplicatePlacement {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return { status: 'no-space', message: `room ${nodeId} does not exist` };
  const max = { ...DEFAULT_LIMITS, ...options.limits }.maxAbsCoordinate;
  const taken = new Set<string>();
  for (const n of doc.nodes) for (const cell of footprintCells(n)) taken.add(gridKey(cell));
  for (const occupancy of [(options.resolve ?? resolveRelationships)(doc).occupancy, options.occupancy]) {
    if (occupancy) for (const key of occupancy.cells.keys()) taken.add(key);
  }
  const size: RoomSize = node.size;
  const inside = (low: number, extent: number) => low >= -max && low + extent - 1 <= max;
  const fits = (position: GridCoord): boolean =>
    inside(position[0], size[0]) &&
    inside(position[1], size[1]) &&
    inside(position[2], size[2]) &&
    footprintCells({ position, size }).every((cell) => !taken.has(gridKey(cell)));

  const [x, y, z] = node.position;
  /** Beyond this gap every candidate box lies outside the limits on x or y. */
  const lastGap = 2 * max + 1;
  const searchStorey = (level: number): GridCoord | null => {
    if (!inside(level, size[2])) return null;
    for (let gap = 0; gap <= lastGap; gap++) {
      let anyInside = false;
      for (const [dx, dy] of ringOffsets(gap, size[0], size[1], level === z)) {
        const position: GridCoord = [x + dx, y + dy, level];
        if (!inside(position[0], size[0]) || !inside(position[1], size[1])) continue;
        anyInside = true;
        if (fits(position)) return position;
      }
      if (!anyInside && gap > 0) return null;
    }
    return null;
  };

  const same = searchStorey(z);
  if (same) return { status: 'placed', position: same };
  for (let step = 1; step <= 2 * max + 1; step++) {
    for (const level of [z + step, z - step]) {
      const found = searchStorey(level);
      if (found) return { status: 'placed', position: found };
    }
  }
  return {
    status: 'no-space',
    message: `there is no free place for a copy of room ${nodeLabel(node)} (${size.join('×')} cells) within the grid limits of ±${max}; nothing was changed`,
  };
}

/**
 * The `add-node` command that duplicates room `nodeId`: same function, size and stored custom
 * values; no relationships; the copy gets `doc.nextNodeId`. `diagramPosition` is the copy's
 * position in the 2D diagram (independent of its cell).
 */
export function duplicateRoomRequest(
  doc: DesignDocumentV2,
  nodeId: number,
  options: DuplicateOptions & { readonly diagramPosition?: DiagramPosition } = {},
): DuplicateRequest {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return { status: 'refused', message: `room ${nodeId} no longer exists` };
  const placement = findDuplicatePlacement(doc, nodeId, options);
  if (placement.status === 'no-space') return { status: 'refused', message: placement.message };
  const command: Extract<DesignCommand, { readonly type: 'add-node' }> = {
    type: 'add-node',
    node: {
      position: placement.position,
      size: [node.size[0], node.size[1], node.size[2]],
      function: node.function,
      custom: structuredClone(node.custom),
    },
    duplicateOf: nodeId,
    ...(options.diagramPosition && { diagramPosition: options.diagramPosition }),
  };
  return { status: 'command', nodeId: doc.nextNodeId, sourceId: nodeId, position: placement.position, command };
}
