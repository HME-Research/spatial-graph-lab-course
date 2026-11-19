import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bath from '../types/bath';
import bedroom from '../types/bedroom';
import circulation from '../types/circulation';
import entrance from '../types/entrance';
import kitchen from '../types/kitchen';
import living from '../types/living';

/**
 * Grow to target area.
 *
 * Every room is a box of whole cells. Rooms grow one at a time, in priority order (1 first; equal
 * priorities in id order). A room grows by adding ONE row or column of cells on one side, and
 * repeats until its floor area reaches its target area, or until no side can grow ("blocked").
 *
 * A side can grow only if:
 * - every new cell is free (no other room, no corridor generated between two related rooms);
 * - above the lowest storey, every new cell has a room below it to stand on (no overhangs);
 * - the room keeps touching every room it has a relationship with;
 * - the room stays within the app's largest room size.
 * Among the sides that can grow, it prefers a side that faces outside (nothing beyond the new
 * row), then the one whose new area is closest to the target, then the order +x, -x, +y, -y.
 *
 * Reads the two House attributes `targetArea` and `priority` of every room.
 */

/** The app's largest room size, in cells along one axis. */
const MAX_CELLS = 32;
/** The app's largest coordinate (in cells, either sign). */
const MAX_COORDINATE = 1000;

const SIDES = ['+x', '-x', '+y', '-y'] as const;
type Side = (typeof SIDES)[number];

/** A room's box: minimum corner (x, y, z) and size in cells (sx, sy, sz). */
interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Why one side cannot grow. */
type Reason = { readonly kind: 'room'; readonly roomId: number } | { readonly kind: 'no-floor' } | { readonly kind: 'corridor' } | { readonly kind: 'limit' };

const LABELS: Record<string, string> = Object.fromEntries(
  [entrance, circulation, living, kitchen, bedroom, bath].map((type) => [type.id, type.label]),
);

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const formatArea = (m2: number) => (Number.isInteger(m2) ? String(m2) : m2.toFixed(1));

/** Ranges [lo, hi) overlap with a positive length. */
const overlaps = (aLo: number, aHi: number, bLo: number, bHi: number) => Math.min(aHi, bHi) > Math.max(aLo, bLo);

/** Whether two boxes share at least part of a wall or a floor. */
function touching(a: Box, b: Box): boolean {
  const lo = [a.x, a.y, a.z];
  const hi = [a.x + a.sx, a.y + a.sy, a.z + a.sz];
  const lo2 = [b.x, b.y, b.z];
  const hi2 = [b.x + b.sx, b.y + b.sy, b.z + b.sz];
  for (let axis = 0; axis < 3; axis++) {
    if (hi[axis] !== lo2[axis] && hi2[axis] !== lo[axis]) continue;
    const others = [0, 1, 2].filter((o) => o !== axis);
    if (others.every((o) => overlaps(lo[o]!, hi[o]!, lo2[o]!, hi2[o]!))) return true;
  }
  return false;
}

/** The box after growing one row or column on `side`. */
function grown(b: Box, side: Side): Box {
  switch (side) {
    case '+x':
      return { ...b, sx: b.sx + 1 };
    case '-x':
      return { ...b, x: b.x - 1, sx: b.sx + 1 };
    case '+y':
      return { ...b, sy: b.sy + 1 };
    case '-y':
      return { ...b, y: b.y - 1, sy: b.sy + 1 };
  }
}

/** The cells of the row or column `steps` cells beyond `side` of the box (1 = the new row). */
function stripCells(b: Box, side: Side, steps: number): [number, number, number][] {
  const cells: [number, number, number][] = [];
  for (let z = b.z; z < b.z + b.sz; z++) {
    if (side === '+x' || side === '-x') {
      const x = side === '+x' ? b.x + b.sx - 1 + steps : b.x - steps;
      for (let y = b.y; y < b.y + b.sy; y++) cells.push([x, y, z]);
    } else {
      const y = side === '+y' ? b.y + b.sy - 1 + steps : b.y - steps;
      for (let x = b.x; x < b.x + b.sx; x++) cells.push([x, y, z]);
    }
  }
  return cells;
}

export default defineSpatialAlgorithm({
  id: 'grow-to-target-area',
  label: 'Grow to target area',
  run(ctx) {
    const rooms = ctx.design.nodes;
    if (rooms.length === 0) return { kind: 'transformation', summary: 'There are no rooms to grow.', operations: [] };

    // Floor area of one cell, from the app's own "area" value (so the cell size is never guessed).
    const first = rooms[0]!;
    const cellArea = (ctx.metrics.value('area', first.id) as number) / (first.size[0] * first.size[1]);

    const boxes = new Map<number, Box>(
      rooms.map((r) => [r.id, { x: r.grid[0], y: r.grid[1], z: r.grid[2], sx: r.size[0], sy: r.size[1], sz: r.size[2] }]),
    );
    const area = (b: Box) => b.sx * b.sy * cellArea;
    const lowestStorey = Math.min(...rooms.map((r) => r.grid[2]));
    const name = (id: number) => {
      const typeId = rooms.find((r) => r.id === id)!.typeId;
      return `${LABELS[typeId] ?? typeId.charAt(0).toUpperCase() + typeId.slice(1)} ${id}`;
    };

    /** The room whose box contains the cell, if any (boxes as they are now, during the growth). */
    const roomAt = (x: number, y: number, z: number): number | undefined => {
      for (const [id, b] of boxes) {
        if (x >= b.x && x < b.x + b.sx && y >= b.y && y < b.y + b.sy && z >= b.z && z < b.z + b.sz) return id;
      }
      return undefined;
    };

    // Rooms each room has a relationship with.
    const related = new Map<number, number[]>(rooms.map((r) => [r.id, []]));
    for (const e of ctx.design.edges) {
      related.get(e.source)?.push(e.target);
      related.get(e.target)?.push(e.source);
    }

    // Cells kept free for corridors: between two related rooms on the same storey that do not
    // touch but are lined up, the app generates a straight corridor. Rooms must not grow into it.
    const corridor = new Set<string>();
    for (const e of ctx.design.edges) {
      const a = boxes.get(e.source);
      const b = boxes.get(e.target);
      if (!a || !b || touching(a, b)) continue;
      const zLo = Math.max(a.z, b.z);
      const zHi = Math.min(a.z + a.sz, b.z + b.sz);
      if (zHi <= zLo) continue;
      const [left, right] = a.x <= b.x ? [a, b] : [b, a];
      const [low, high] = a.y <= b.y ? [a, b] : [b, a];
      const xLo = Math.max(a.x, b.x);
      const xHi = Math.min(a.x + a.sx, b.x + b.sx);
      const yLo = Math.max(a.y, b.y);
      const yHi = Math.min(a.y + a.sy, b.y + b.sy);
      for (let z = zLo; z < zHi; z++) {
        if (xHi > xLo) for (let y = low.y + low.sy; y < high.y; y++) for (let x = xLo; x < xHi; x++) corridor.add(key(x, y, z));
        if (yHi > yLo) for (let x = left.x + left.sx; x < right.x; x++) for (let y = yLo; y < yHi; y++) corridor.add(key(x, y, z));
      }
    }

    /** Why `side` of room `id` cannot grow, or null if it can. */
    const problem = (id: number, side: Side): Reason | null => {
      const b = boxes.get(id)!;
      const next = grown(b, side);
      if (next.sx > MAX_CELLS || next.sy > MAX_CELLS) return { kind: 'limit' };
      for (const [x, y, z] of stripCells(b, side, 1)) {
        if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return { kind: 'limit' };
        const other = roomAt(x, y, z);
        if (other !== undefined) return { kind: 'room', roomId: other };
        if (corridor.has(key(x, y, z))) return { kind: 'corridor' };
        if (z === b.z && z > lowestStorey && roomAt(x, y, z - 1) === undefined) return { kind: 'no-floor' };
      }
      for (const otherId of related.get(id) ?? []) {
        const other = boxes.get(otherId);
        if (other && touching(b, other) && !touching(next, other)) return { kind: 'room', roomId: otherId };
      }
      return null;
    };

    /** Nothing beyond the new row: the new wall faces outside. */
    const facesOutside = (id: number, side: Side) => stripCells(boxes.get(id)!, side, 2).every(([x, y, z]) => roomAt(x, y, z) === undefined);

    /** Plain-language reason a room is blocked, from the reason of each side. */
    const blockedBy = (reasons: readonly Reason[]): string => {
      const roomIds = [...new Set(reasons.flatMap((r) => (r.kind === 'room' ? [r.roomId] : [])))];
      const parts: string[] = [];
      if (roomIds.length === 1) parts.push(`blocked by ${name(roomIds[0]!)}`);
      if (roomIds.length > 1) parts.push('no free space');
      if (reasons.some((r) => r.kind === 'no-floor')) parts.push('no room below to build on');
      if (reasons.some((r) => r.kind === 'corridor')) parts.push('a corridor is in the way');
      if (reasons.some((r) => r.kind === 'limit')) parts.push('largest room size reached');
      return parts.join('; ');
    };

    // Read the two House attributes; rooms grow in priority order, equal priorities by id.
    const wanted = rooms.map((r) => {
      const values = ctx.nodeAttributes(r.id);
      const target = typeof values.targetArea === 'number' && values.targetArea > 0 ? values.targetArea : undefined;
      const priority = typeof values.priority === 'number' ? values.priority : Number.POSITIVE_INFINITY;
      return { id: r.id, target, priority };
    });
    wanted.sort((a, b) => a.priority - b.priority || a.id - b.id);

    const operations: SpatialOperation[] = [];
    const lines: string[] = [];
    let grew = 0;
    let blocked = 0;
    for (const { id, target } of wanted) {
      if (target === undefined) {
        lines.push(`${name(id)}: no target area, left as it is`);
        continue;
      }
      const start = area(boxes.get(id)!);
      let stuck: string | undefined;
      while (area(boxes.get(id)!) < target) {
        const options = SIDES.map((side, order) => ({ side, order, reason: problem(id, side) }));
        const free = options.filter((o) => o.reason === null);
        if (free.length === 0) {
          stuck = blockedBy(options.map((o) => o.reason!));
          break;
        }
        const ranked = free
          .map((o) => ({ ...o, outside: facesOutside(id, o.side), miss: Math.abs(area(grown(boxes.get(id)!, o.side)) - target) }))
          .sort((a, b) => Number(b.outside) - Number(a.outside) || a.miss - b.miss || a.order - b.order);
        boxes.set(id, grown(boxes.get(id)!, ranked[0]!.side));
      }
      const end = area(boxes.get(id)!);
      const from = end > start ? `${formatArea(start)} → ` : '';
      if (stuck === undefined) {
        lines.push(`${name(id)}: ${from}${formatArea(end)} m² (target ${formatArea(target)}) ✓`);
      } else {
        lines.push(`${name(id)}: ${from}${formatArea(end)} of ${formatArea(target)} m² — ${stuck}`);
        blocked++;
      }
      if (end > start) {
        const b = boxes.get(id)!;
        operations.push({ op: 'set-node-geometry', nodeId: id, grid: [b.x, b.y, b.z], size: [b.sx, b.sy, b.sz] });
        grew++;
      }
    }

    const headline = `${grew} room${grew === 1 ? '' : 's'} grown, ${blocked} blocked.`;
    return { kind: 'transformation', summary: [headline, ...lines].join('\n'), operations };
  },
});
