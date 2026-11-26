// A transform for Spatial Graph Lab: grow rooms by one row of cells in one direction, where the
// cells are free. Upload it in Transform › Upload your own (.ts). It uses only what every project
// has (positions, sizes and Function ids found in the design), so it works in any project.

import { defineSpatialAlgorithm, getNode, type GridCoord, type SpatialOperation } from '@student-api';

/** The app's largest room: 32 cells along one side. */
const MAX_CELLS = 32;

/** A cell as text, e.g. "2,0,1", to keep cells in a Set. */
const key = (cell: GridCoord) => cell.join(',');

export default defineSpatialAlgorithm({
  id: 'grow-in-one-direction',
  label: 'Grow rooms by one cell',

  parameters: {
    direction: {
      kind: 'enum',
      values: ['+x', '-x', '+y', '-y'],
      default: '+x',
      label: 'Direction',
      description: 'The side every room grows on: +x / -x along x, +y / -y along y (on its own level).',
    },
    onlyFunction: {
      kind: 'text',
      default: '',
      label: 'Only this Function',
      description: 'A Function id such as "kitchen" grows only those rooms. Empty: every room.',
    },
  },

  run(ctx) {
    const direction = ctx.params.direction ?? '+x';
    const only = (ctx.params.onlyFunction ?? '').trim();

    // Cells the app may need for a corridor: between two related rooms that do not touch, on the
    // levels both rooms have. Rooms must not grow into them.
    const corridor = new Set<string>();
    for (const edge of ctx.design.edges) {
      if (ctx.touches(edge.source, edge.target)) continue;
      const a = getNode(ctx.design, edge.source)!;
      const b = getNode(ctx.design, edge.target)!;
      const zFrom = Math.max(a.position[2], b.position[2]);
      const zTo = Math.min(a.position[2] + a.size[2], b.position[2] + b.size[2]);
      const xFrom = Math.min(a.position[0], b.position[0]);
      const xTo = Math.max(a.position[0] + a.size[0], b.position[0] + b.size[0]);
      const yFrom = Math.min(a.position[1], b.position[1]);
      const yTo = Math.max(a.position[1] + a.size[1], b.position[1] + b.size[1]);
      for (let z = zFrom; z < zTo; z++) for (let x = xFrom; x < xTo; x++) for (let y = yFrom; y < yTo; y++) corridor.add(key([x, y, z]));
    }

    // Cells taken by rooms that already grew in this run.
    const taken = new Set<string>();
    const operations: SpatialOperation[] = [];
    const blocked: number[] = [];

    for (const room of ctx.design.nodes) {
      if (only !== '' && room.function !== only) continue;
      const [x, y, z] = room.position;
      const [sx, sy, sz] = room.size;

      // The new row of cells on the chosen side, and the room's new box.
      const cells: GridCoord[] = [];
      let position: GridCoord = [x, y, z];
      let size: [number, number, number] = [sx, sy, sz];
      if (direction === '+x' || direction === '-x') {
        const nx = direction === '+x' ? x + sx : x - 1;
        for (let j = y; j < y + sy; j++) for (let k = z; k < z + sz; k++) cells.push([nx, j, k]);
        if (direction === '-x') position = [x - 1, y, z];
        size = [sx + 1, sy, sz];
      } else {
        const ny = direction === '+y' ? y + sy : y - 1;
        for (let i = x; i < x + sx; i++) for (let k = z; k < z + sz; k++) cells.push([i, ny, k]);
        if (direction === '-y') position = [x, y - 1, z];
        size = [sx, sy + 1, sz];
      }

      // It grows only if every new cell is free and the room stays within the size limit.
      const free = cells.every((c) => ctx.nodeAt(c) === undefined && !corridor.has(key(c)) && !taken.has(key(c)));
      if (!free || Math.max(...size) > MAX_CELLS) {
        blocked.push(room.id);
        continue;
      }
      for (const c of cells) taken.add(key(c));
      operations.push({ op: 'set-node-geometry', nodeId: room.id, position, size });
    }

    // One short line for the preview.
    const grown = `${operations.length} room(s) grown towards ${direction}`;
    const summary = blocked.length === 0 ? `${grown}.` : `${grown}; blocked: ${blocked.join(', ')}.`;
    return { kind: 'transformation', summary, operations };
  },
});
