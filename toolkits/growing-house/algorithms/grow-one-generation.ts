import { defineSpatialAlgorithm, FACE_DIRECTIONS, neighbourCell, roomCells, type GridCoord, type SpatialOperation } from '@student-api';
import { cellKey, connectorCells } from '../lib/cells';
import { INVITES, labelOf, MOST, relationshipFor, SEED } from '../lib/rules';

/**
 * Grow one generation.
 *
 * An empty design gets the seed: a one-cell Hall at [0, 0, 0], generation 0.
 * Otherwise every room of the newest (highest) generation invites the rooms its rule names
 * (see `lib/rules.ts`): each new room is one cell, in a free cell next to the inviting room on the
 * same level, one generation newer, and related to it (Access, or Open for Kitchen–Dining and
 * Living room–Terrace). The count limits of the whole plan are never exceeded, and the design
 * never gets more than `maxRooms` rooms.
 */

/** The four side directions on one level, in the order they are tried: +x, -x, +y, -y. */
const SIDES = FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z');

export default defineSpatialAlgorithm({
  id: 'grow-one-generation',
  label: 'Grow one generation',
  parameters: {
    maxRooms: {
      kind: 'number',
      min: 1,
      default: 12,
      label: 'Most rooms',
      description: 'The house never gets more rooms than this.',
    },
  },
  run(ctx) {
    const rooms = ctx.design.nodes;
    const maxRooms = ctx.params.maxRooms ?? 12;

    // An empty design: plant the seed Hall.
    if (rooms.length === 0) {
      return {
        kind: 'transformation',
        summary: 'Planted the seed: a Hall at [0, 0, 0] (generation 0).',
        operations: [{ op: 'add-node', position: [0, 0, 0], function: SEED, custom: { generation: 0 } }],
      };
    }

    // Each room's generation (a room without one counts as 0).
    const generationOf = (id: number) => {
      const value = ctx.nodeCustom(id).generation;
      return typeof value === 'number' ? value : 0;
    };
    // The newest generation, and its rooms in id order.
    const newest = Math.max(...rooms.map((r) => generationOf(r.id)));
    const inviters = rooms.filter((r) => generationOf(r.id) === newest).sort((a, b) => a.id - b.id);

    // How many rooms of each Function the plan has (counted up as rooms are added).
    const count: Record<string, number> = {};
    for (const r of rooms) count[r.function] = (count[r.function] ?? 0) + 1;

    // Cells taken by new rooms in this run, and cells kept for generated connectors.
    const claimed = new Set<string>();
    const connectors = connectorCells(rooms, ctx.design.edges);
    // A cell is free when no room (as the design was), no new room and no connector takes it.
    const isFree = (c: GridCoord) => ctx.nodeAt(c) === undefined && !claimed.has(cellKey(c[0], c[1], c[2])) && !connectors.has(cellKey(c[0], c[1], c[2]));

    const operations: SpatialOperation[] = [];
    const added: string[] = [];
    const skipped: string[] = [];
    let total = rooms.length;

    for (const room of inviters) {
      for (const fn of INVITES[room.function] ?? []) {
        const who = `${labelOf(fn)} (from ${labelOf(room.function)} ${room.id})`;
        // Stop at the most rooms the house may have.
        if (total >= maxRooms) {
          skipped.push(`${who}: the house has ${maxRooms} rooms`);
          continue;
        }
        // Never more rooms of a Function than its limit.
        const most = MOST[fn];
        if (most !== undefined && (count[fn] ?? 0) >= most) {
          skipped.push(`${who}: already ${most} ${labelOf(fn)}${most === 1 ? '' : 's'}`);
          continue;
        }
        // The first free cell next to the room on its own level: cell by cell, side by side.
        const level = room.position[2];
        let cell: GridCoord | undefined;
        for (const side of SIDES) {
          for (const c of roomCells(room)) {
            if (c[2] !== level) continue;
            const next = neighbourCell(c, side);
            if (isFree(next)) {
              cell = next;
              break;
            }
          }
          if (cell !== undefined) break;
        }
        if (cell === undefined) {
          skipped.push(`${who}: no free cell`);
          continue;
        }
        // Add the new room (one cell, one generation newer) and relate it to the inviting room.
        const ref = `new-${operations.length}`;
        operations.push({ op: 'add-node', ref, position: cell, size: [1, 1, 1], function: fn, custom: { generation: newest + 1 } });
        operations.push({ op: 'add-edge', source: room.id, target: ref, relationship: relationshipFor(room.function, fn) });
        claimed.add(cellKey(cell[0], cell[1], cell[2]));
        count[fn] = (count[fn] ?? 0) + 1;
        total++;
        added.push(labelOf(fn));
      }
    }

    // Summary: what was added, and what was skipped and why.
    const lines: string[] = [];
    if (added.length === 0) lines.push('Nothing left to grow.');
    else lines.push(`Added ${added.length} room${added.length === 1 ? '' : 's'} of generation ${newest + 1}: ${added.join(', ')}.`);
    if (skipped.length > 0) lines.push(`Skipped ${skipped.length}: ${skipped.join('; ')}.`);
    return { kind: 'transformation', summary: lines.join('\n'), operations };
  },
});
