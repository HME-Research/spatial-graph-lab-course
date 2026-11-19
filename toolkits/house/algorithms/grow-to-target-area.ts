import { defineSpatialAlgorithm, type AttributeValue, type SpatialOperation } from '@student-api';
import bath from '../types/bath';
import bedroom from '../types/bedroom';
import circulation from '../types/circulation';
import entrance from '../types/entrance';
import kitchen from '../types/kitchen';
import living from '../types/living';

/**
 * Grow to target area.
 *
 * HOUSES. Rooms joined by relationships (of any kind, directly or through other rooms) form one
 * house; a room without relationships is a house of its own. Houses are numbered 1, 2, … in the
 * order of their lowest room id. With the parameter `houses` set to more than the houses drawn,
 * the transform first adds copies of House 1 (every room and every relationship) in a row along
 * +x, after every drawn room. The gap between two houses is twice the largest number of cells any
 * room still needs, plus one, so no two houses can grow into each other. Running it again with the
 * same number adds nothing: it counts the houses already there. A smaller number removes nothing.
 *
 * GROWTH. Every room is a box of whole cells. Rooms grow one at a time, in priority order (1 first;
 * equal priorities in id order; copies after the drawn rooms). A room grows by adding ONE row or
 * column of cells on one side, and repeats until its floor area reaches its target area, or until
 * no side can grow ("blocked").
 *
 * A side can grow only if:
 * - every new cell is free (no other room, no corridor generated between two related rooms);
 * - above the lowest storey, every new cell has a room below it to stand on (no overhangs);
 * - no new cell is, or shares a face with (also above or below), a room of another house: houses
 *   never touch;
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

/** The six cells that share a face with a cell. */
const NEIGHBOURS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/** A room's box: minimum corner (x, y, z) and size in cells (sx, sy, sz). */
interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/** A room taking part in the run: a drawn room (`id`) or a copy this run adds (`ref`). */
interface Room {
  /** The drawn room's id, or undefined for a copy. */
  readonly id: number | undefined;
  /** The copy's local name in operations, or undefined for a drawn room. */
  readonly ref: string | undefined;
  /** The drawn room it is, or copies: its attributes are read from there. */
  readonly source: number;
  readonly typeId: string;
  readonly house: number;
  /** Id order: drawn rooms by id, then copies in the order they are added (their ids follow). */
  readonly order: number;
}

/** Why one side cannot grow. */
type Reason =
  | { readonly kind: 'room'; readonly room: number }
  | { readonly kind: 'house'; readonly house: number }
  | { readonly kind: 'no-floor' }
  | { readonly kind: 'corridor' }
  | { readonly kind: 'limit' };

const LABELS: Record<string, string> = Object.fromEntries(
  [entrance, circulation, living, kitchen, bedroom, bath].map((type) => [type.id, type.label]),
);
const label = (typeId: string) => LABELS[typeId] ?? typeId.charAt(0).toUpperCase() + typeId.slice(1);

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const formatArea = (m2: number) => (Number.isInteger(m2) ? String(m2) : m2.toFixed(1));
const boxOf = (r: { readonly grid: readonly number[]; readonly size: readonly number[] }): Box => ({
  x: r.grid[0]!,
  y: r.grid[1]!,
  z: r.grid[2]!,
  sx: r.size[0]!,
  sy: r.size[1]!,
  sz: r.size[2]!,
});

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

/** Groups of rooms joined by relationships (directly or through other rooms), ordered by lowest id. */
function connectedGroups(ids: readonly number[], links: readonly { readonly source: number; readonly target: number }[]): number[][] {
  const parent = new Map(ids.map((id) => [id, id]));
  const root = (id: number): number => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const { source, target } of links) {
    if (!parent.has(source) || !parent.has(target)) continue;
    const a = root(source);
    const b = root(target);
    if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
  }
  const groups = new Map<number, number[]>();
  for (const id of [...ids].sort((a, b) => a - b)) {
    const r = root(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  }
  return [...groups.values()].sort((a, b) => a[0]! - b[0]!);
}

export default defineSpatialAlgorithm({
  id: 'grow-to-target-area',
  label: 'Grow to target area',
  parameters: {
    // How many houses there should be, a whole number. Empty: as many as are drawn.
    houses: { kind: 'number', min: 1 },
  },
  run(ctx) {
    const drawn = ctx.design.nodes;
    if (drawn.length === 0) return { kind: 'transformation', summary: 'There are no rooms to grow.', operations: [] };
    const wantedHouses = ctx.params.houses;
    if (wantedHouses !== undefined && !Number.isInteger(wantedHouses)) {
      return { kind: 'transformation', summary: `Houses must be a whole number, like 1, 2 or 3 (not ${wantedHouses}).`, operations: [] };
    }

    // Floor area of one cell, from the app's own "area" value (so the cell size is never guessed).
    const first = drawn[0]!;
    const cellArea = (ctx.metrics.value('area', first.id) as number) / (first.size[0] * first.size[1]);

    // Read the two House attributes of every drawn room (copies use their original's values).
    const goals = new Map(
      drawn.map((r) => {
        const values = ctx.nodeAttributes(r.id);
        const target = typeof values.targetArea === 'number' && values.targetArea > 0 ? values.targetArea : undefined;
        const priority = typeof values.priority === 'number' ? values.priority : Number.POSITIVE_INFINITY;
        return [r.id, { target, priority }] as const;
      }),
    );
    /** Cells a drawn room still needs to reach its target (at most the largest room size). */
    const missingCells = (id: number, b: Box) => {
      const target = goals.get(id)!.target;
      return target === undefined ? 0 : Math.min(MAX_CELLS, Math.max(0, Math.ceil(target / cellArea - 1e-9) - b.sx * b.sy));
    };

    // Houses: groups of related rooms, numbered by their lowest room id.
    const groups = connectedGroups(
      drawn.map((r) => r.id),
      ctx.design.edges,
    );
    const houseOf = new Map(groups.flatMap((ids, h) => ids.map((id) => [id, h + 1] as const)));

    // Every room of the run, by index: the drawn rooms first, then the copies.
    const rooms: Room[] = drawn.map((r) => ({ id: r.id, ref: undefined, source: r.id, typeId: r.typeId, house: houseOf.get(r.id)!, order: r.id }));
    const boxes = new Map<number, Box>(drawn.map((r, i) => [i, boxOf(r)]));
    const indexOf = new Map(drawn.map((r, i) => [r.id, i]));
    const links: [number, number][] = ctx.design.edges.map((e) => [indexOf.get(e.source)!, indexOf.get(e.target)!]);

    // Copies of House 1, in a row along +x after every drawn room, far enough apart that no two
    // houses can grow into each other: gap = 2 × (most cells any room still needs) + 1.
    const added: SpatialOperation[] = [];
    const notes: string[] = [];
    const copies = wantedHouses !== undefined && wantedHouses > groups.length ? wantedHouses - groups.length : 0;
    if (wantedHouses !== undefined && wantedHouses < groups.length) {
      notes.push(`Houses is ${wantedHouses}, but ${groups.length} houses are drawn: none was removed, and all of them grew.`);
    }
    if (copies > 0) {
      const model = drawn.filter((r) => houseOf.get(r.id) === 1).sort((a, b) => a.id - b.id);
      const reach = Math.max(...drawn.map((r) => missingCells(r.id, boxOf(r))));
      const gap = 2 * reach + 1;
      const modelMinX = Math.min(...model.map((r) => r.grid[0]));
      const modelWidth = Math.max(...model.map((r) => r.grid[0] + r.size[0])) - modelMinX;
      const startX = Math.max(...drawn.map((r) => r.grid[0] + r.size[0])) + gap;
      const lastX = startX + (copies - 1) * (modelWidth + gap) + modelWidth - 1 + reach;
      if (lastX > MAX_COORDINATE) {
        return {
          kind: 'transformation',
          summary: `There is not enough space for ${wantedHouses} houses in a row: the grid ends at x = ${MAX_COORDINATE}. Try fewer houses.`,
          operations: [],
        };
      }
      const fields = new Set(ctx.attributeFields.nodes.map((f) => f.key));
      const maxId = Math.max(...drawn.map((r) => r.id));
      for (let c = 0; c < copies; c++) {
        const house = groups.length + 1 + c;
        const dx = startX + c * (modelWidth + gap) - modelMinX;
        const copyOf = new Map<number, number>();
        for (const r of model) {
          const ref = `house-${house}-room-${r.id}`;
          const attributes: Record<string, AttributeValue> = {};
          for (const [k, v] of Object.entries(r.attributes)) if (fields.has(k)) attributes[k] = v;
          const grid = [r.grid[0] + dx, r.grid[1], r.grid[2]] as const;
          added.push({ op: 'add-node', ref, grid, size: r.size, typeId: r.typeId, attributes });
          copyOf.set(r.id, rooms.length);
          boxes.set(rooms.length, boxOf({ grid, size: r.size }));
          rooms.push({ id: undefined, ref, source: r.id, typeId: r.typeId, house, order: maxId + 1 + rooms.length });
        }
        for (const e of ctx.design.edges) {
          const a = copyOf.get(e.source);
          const b = copyOf.get(e.target);
          if (a === undefined || b === undefined) continue;
          added.push({ op: 'add-edge', source: rooms[a]!.ref!, target: rooms[b]!.ref!, kind: e.kind });
          links.push([a, b]);
        }
      }
      notes.push(`Added ${copies} ${copies === 1 ? 'copy' : 'copies'} of House 1, to make ${wantedHouses} houses.`);
    }
    const houseCount = groups.length + copies;

    const area = (b: Box) => b.sx * b.sy * cellArea;
    const lowestStorey = Math.min(...[...boxes.values()].map((b) => b.z));
    const plainName = (i: number) => {
      const r = rooms[i]!;
      return r.id !== undefined ? `${label(r.typeId)} ${r.id}` : `${label(r.typeId)} (copy of ${r.source})`;
    };
    const name = (i: number) => (houseCount > 1 ? `House ${rooms[i]!.house} · ${plainName(i)}` : plainName(i));

    /** The room whose box contains the cell, if any (boxes as they are now, during the growth). */
    const roomAt = (x: number, y: number, z: number): number | undefined => {
      for (const [i, b] of boxes) {
        if (x >= b.x && x < b.x + b.sx && y >= b.y && y < b.y + b.sy && z >= b.z && z < b.z + b.sz) return i;
      }
      return undefined;
    };

    // Rooms each room has a relationship with.
    const related = new Map<number, number[]>(rooms.map((_, i) => [i, []]));
    for (const [a, b] of links) {
      related.get(a)!.push(b);
      related.get(b)!.push(a);
    }

    // Cells kept free for corridors: between two related rooms on the same storey that do not
    // touch but are lined up, the app generates a straight corridor. Rooms must not grow into it.
    const corridor = new Set<string>();
    for (const [i, j] of links) {
      const a = boxes.get(i)!;
      const b = boxes.get(j)!;
      if (touching(a, b)) continue;
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

    /** Why `side` of room `i` cannot grow, or null if it can. */
    const problem = (i: number, side: Side): Reason | null => {
      const b = boxes.get(i)!;
      const next = grown(b, side);
      if (next.sx > MAX_CELLS || next.sy > MAX_CELLS) return { kind: 'limit' };
      for (const [x, y, z] of stripCells(b, side, 1)) {
        if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return { kind: 'limit' };
        const other = roomAt(x, y, z);
        if (other !== undefined) return { kind: 'room', room: other };
        if (corridor.has(key(x, y, z))) return { kind: 'corridor' };
        if (z === b.z && z > lowestStorey && roomAt(x, y, z - 1) === undefined) return { kind: 'no-floor' };
        for (const [dx, dy, dz] of NEIGHBOURS) {
          const near = roomAt(x + dx, y + dy, z + dz);
          if (near !== undefined && rooms[near]!.house !== rooms[i]!.house) return { kind: 'house', house: rooms[near]!.house };
        }
      }
      for (const j of related.get(i)!) {
        const other = boxes.get(j)!;
        if (touching(b, other) && !touching(next, other)) return { kind: 'room', room: j };
      }
      return null;
    };

    /** Nothing beyond the new row: the new wall faces outside. */
    const facesOutside = (i: number, side: Side) => stripCells(boxes.get(i)!, side, 2).every(([x, y, z]) => roomAt(x, y, z) === undefined);

    /** Plain-language reason a room is blocked, from the reason of each side. */
    const blockedBy = (reasons: readonly Reason[]): string => {
      const blockers = [...new Set(reasons.flatMap((r) => (r.kind === 'room' ? [r.room] : [])))];
      const houses = [...new Set(reasons.flatMap((r) => (r.kind === 'house' ? [r.house] : [])))].sort((a, b) => a - b);
      const parts: string[] = [];
      if (blockers.length === 1) parts.push(`blocked by ${plainName(blockers[0]!)}`);
      if (blockers.length > 1) parts.push('no free space');
      if (houses.length > 0) parts.push(`too close to ${houses.map((h) => `House ${h}`).join(' and ')}`);
      if (reasons.some((r) => r.kind === 'no-floor')) parts.push('no room below to build on');
      if (reasons.some((r) => r.kind === 'corridor')) parts.push('a corridor is in the way');
      if (reasons.some((r) => r.kind === 'limit')) parts.push('largest room size reached');
      return parts.join('; ');
    };

    // Rooms grow in priority order, equal priorities by id (copies after the drawn rooms).
    const turns = rooms.map((r, i) => ({ i, ...goals.get(r.source)!, order: r.order }));
    turns.sort((a, b) => a.priority - b.priority || a.order - b.order);

    const lines: { readonly house: number; readonly text: string }[] = [];
    const resized: SpatialOperation[] = [];
    let grew = 0;
    let blocked = 0;
    for (const { i, target } of turns) {
      const house = rooms[i]!.house;
      if (target === undefined) {
        lines.push({ house, text: `${name(i)}: no target area, left as it is` });
        continue;
      }
      const start = area(boxes.get(i)!);
      let stuck: string | undefined;
      while (area(boxes.get(i)!) < target) {
        const options = SIDES.map((side, order) => ({ side, order, reason: problem(i, side) }));
        const free = options.filter((o) => o.reason === null);
        if (free.length === 0) {
          stuck = blockedBy(options.map((o) => o.reason!));
          break;
        }
        const ranked = free
          .map((o) => ({ ...o, outside: facesOutside(i, o.side), miss: Math.abs(area(grown(boxes.get(i)!, o.side)) - target) }))
          .sort((a, b) => Number(b.outside) - Number(a.outside) || a.miss - b.miss || a.order - b.order);
        boxes.set(i, grown(boxes.get(i)!, ranked[0]!.side));
      }
      const end = area(boxes.get(i)!);
      const from = end > start ? `${formatArea(start)} → ` : '';
      if (stuck === undefined) {
        lines.push({ house, text: `${name(i)}: ${from}${formatArea(end)} m² (target ${formatArea(target)}) ✓` });
      } else {
        lines.push({ house, text: `${name(i)}: ${from}${formatArea(end)} of ${formatArea(target)} m² — ${stuck}` });
        blocked++;
      }
      if (end > start) {
        const b = boxes.get(i)!;
        resized.push({ op: 'set-node-geometry', nodeId: rooms[i]!.id ?? rooms[i]!.ref!, grid: [b.x, b.y, b.z], size: [b.sx, b.sy, b.sz] });
        grew++;
      }
    }

    // One line per room, house by house (in growth order within each house).
    const roomLines = lines.map((l, n) => ({ ...l, n })).sort((a, b) => a.house - b.house || a.n - b.n);
    const headline = `${grew} room${grew === 1 ? '' : 's'} grown, ${blocked} blocked.`;
    return {
      kind: 'transformation',
      summary: [headline, ...notes, ...roomLines.map((l) => l.text)].join('\n'),
      operations: [...added, ...resized],
    };
  },
});
