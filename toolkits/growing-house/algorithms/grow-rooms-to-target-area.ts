import { defineSpatialAlgorithm, type SpatialNode, type SpatialOperation } from '@student-api';
import { cellKey, connectorCells } from '../lib/cells';
import { labelOf } from '../lib/rules';

/**
 * Grow rooms to target area.
 *
 * Every room whose floor area is below its `targetArea` grows by ONE row of cells on one side
 * (one cell for a room that is one cell wide), on its own level(s). Run it again to grow again.
 * A side can grow only when every new cell is free: no room, no cell another room took earlier in
 * this run, and no generated connector. Of the free sides it takes the one that brings the area
 * closest to the target, then the first in the order +x, -x, +y, -y. Rooms take turns in id order.
 */

/** The app's largest room size, in cells along one axis. */
const MAX_CELLS = 32;

/** The four sides a room can grow on, in the order they are tried. */
const SIDES = ['+x', '-x', '+y', '-y'] as const;
type Side = (typeof SIDES)[number];

/** A room's box after growing one row on `side`: its new minimum corner and size. */
function grown(room: SpatialNode, side: Side) {
  const [x, y, z] = room.position;
  const [sx, sy, sz] = room.size;
  if (side === '+x') return { position: [x, y, z] as const, size: [sx + 1, sy, sz] as const };
  if (side === '-x') return { position: [x - 1, y, z] as const, size: [sx + 1, sy, sz] as const };
  if (side === '+y') return { position: [x, y, z] as const, size: [sx, sy + 1, sz] as const };
  return { position: [x, y - 1, z] as const, size: [sx, sy + 1, sz] as const };
}

/** The new cells a room gets when it grows one row on `side`. */
function newCells(room: SpatialNode, side: Side): [number, number, number][] {
  const [x, y, z] = room.position;
  const [sx, sy, sz] = room.size;
  const cells: [number, number, number][] = [];
  for (let k = z; k < z + sz; k++) {
    if (side === '+x' || side === '-x') {
      const nx = side === '+x' ? x + sx : x - 1;
      for (let j = y; j < y + sy; j++) cells.push([nx, j, k]);
    } else {
      const ny = side === '+y' ? y + sy : y - 1;
      for (let i = x; i < x + sx; i++) cells.push([i, ny, k]);
    }
  }
  return cells;
}

export default defineSpatialAlgorithm({
  id: 'grow-rooms-to-target-area',
  label: 'Grow rooms to target area',
  run(ctx) {
    const rooms = [...ctx.design.nodes].sort((a, b) => a.id - b.id);
    if (rooms.length === 0) return { kind: 'transformation', summary: 'There are no rooms to grow.', operations: [] };

    // Cells taken by rooms that grew in this run, and cells kept for generated connectors.
    const claimed = new Set<string>();
    const connectors = connectorCells(rooms, ctx.design.edges);
    // A cell is free when no room (as the design was), no growth of this run and no connector takes it.
    const isFree = ([x, y, z]: [number, number, number]) => ctx.nodeAt([x, y, z]) === undefined && !claimed.has(cellKey(x, y, z)) && !connectors.has(cellKey(x, y, z));

    const operations: SpatialOperation[] = [];
    const grew: string[] = [];
    const blocked: string[] = [];
    let reached = 0;

    for (const room of rooms) {
      const name = `${labelOf(room.function)} ${room.id}`;
      // The room's target area: a number, or nothing when it has none.
      const target = ctx.nodeCustom(room.id).targetArea;
      if (typeof target !== 'number') continue;
      // Its floor area as the app calculates it, and the area of one cell.
      const area = ctx.metrics.value('area', room.id) as number;
      const cellArea = area / (room.size[0] * room.size[1]);
      if (area >= target) {
        reached++;
        continue;
      }
      // The sides whose new cells are all free (and that keep the room within the largest size).
      const options = SIDES.map((side, order) => ({ side, order, box: grown(room, side) }))
        .filter((o) => o.box.size[0] <= MAX_CELLS && o.box.size[1] <= MAX_CELLS)
        .filter((o) => newCells(room, o.side).every(isFree));
      if (options.length === 0) {
        blocked.push(name);
        continue;
      }
      // The side that brings the area closest to the target, then the first in side order.
      const miss = (o: (typeof options)[number]) => Math.abs(o.box.size[0] * o.box.size[1] * cellArea - target);
      options.sort((a, b) => miss(a) - miss(b) || a.order - b.order);
      const best = options[0]!;
      // Grow the room and claim its new cells, so no other room takes them in this run.
      operations.push({ op: 'set-node-geometry', nodeId: room.id, position: best.box.position, size: best.box.size });
      for (const [x, y, z] of newCells(room, best.side)) claimed.add(cellKey(x, y, z));
      grew.push(`${name} (${best.side})`);
    }

    // Summary: how many grew, which, and which could not.
    const lines: string[] = [];
    if (grew.length === 0 && blocked.length === 0) lines.push('Every room reaches its target area.');
    else lines.push(`${grew.length} room${grew.length === 1 ? '' : 's'} grew by one cell row, ${reached} already at target, ${blocked.length} blocked.`);
    if (grew.length > 0) lines.push(`Grew: ${grew.join(', ')}.`);
    if (blocked.length > 0) lines.push(`Blocked (no free side): ${blocked.join(', ')}.`);
    return { kind: 'transformation', summary: lines.join('\n'), operations };
  },
});
