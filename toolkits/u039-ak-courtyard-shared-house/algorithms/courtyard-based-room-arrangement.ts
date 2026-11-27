import { defineSpatialAlgorithm, type GridCoord, type RoomSize, type SpatialOperation } from '@student-api';

// List the toolkit Functions available in the room selector.
const roomFunctions = [
  'bedroom', 'kitchen', 'living-dining', 'bathroom', 'gallery', 'library',
  'courtyard', 'entrance', 'corridor', 'staircase', 'terrace',
] as const;

export default defineSpatialAlgorithm({
  id: 'courtyard-based-room-arrangement',
  label: 'Courtyard-based Room Arrangement',
  parameters: {
    courtyardId: {
      kind: 'number', min: 0, default: 1, label: 'Courtyard room ID',
      description: 'Enter the number shown on the Courtyard node in the graph.',
    },
    roomFunction: { kind: 'enum', values: roomFunctions, default: 'bedroom', label: 'Room function' },
    count: { kind: 'number', min: 1, default: 4, label: 'Number of rooms' },
    width: { kind: 'number', min: 1, max: 32, default: 1, label: 'Width (x cells)' },
    depth: { kind: 'number', min: 1, max: 32, default: 1, label: 'Depth (y cells)' },
    height: { kind: 'number', min: 1, max: 32, default: 1, label: 'Height (z cells)' },
  },
  run(ctx) {
    // Find the courtyard by its graph ID and check the entered dimensions.
    const { courtyardId = 1, roomFunction = 'bedroom', count = 4, width = 1, depth = 1, height = 1 } = ctx.params;
    const courtyard = ctx.design.nodes.find((room) => room.id === courtyardId && room.function === 'courtyard');
    if (!courtyard) {
      return { kind: 'transformation', summary: 'Enter the room ID of a Courtyard in your design.', operations: [] };
    }
    if (!Number.isSafeInteger(count) || ![width, depth, height].every(Number.isInteger)) {
      return { kind: 'transformation', summary: 'Use whole numbers for the room count and dimensions.', operations: [] };
    }

    const [x, y, z] = courtyard.position;
    const [spanX, spanY] = courtyard.size;
    const size: RoomSize = [width, depth, height];
    const occupied = ctx.design.nodes.map(({ position, size }) => ({ position, size }));
    const operations: SpatialOperation[] = [];
    let placed = 0;

    // Try the four sides in turn at each offset, keeping the frontage within the courtyard wall.
    for (let offset = 0; offset < Math.max(spanX, spanY) && placed < count; offset++) {
      const candidates: GridCoord[] = [];
      if (offset + width <= spanX) candidates.push([x + offset, y + spanY, z], [x + offset, y - depth, z]);
      if (offset + depth <= spanY) candidates.push([x + spanX, y + offset, z], [x - width, y + offset, z]);

      for (const position of candidates) {
        // Boxes overlap only if their cell ranges overlap on all three axes.
        const blocked = occupied.some((room) => ([0, 1, 2] as const).every((axis) =>
          position[axis] < room.position[axis] + room.size[axis]
          && room.position[axis] < position[axis] + size[axis],
        ));
        if (blocked) continue;

        // Reserve the room and propose a door to the courtyard it touches.
        occupied.push({ position, size });
        placed++;
        const ref = `perimeter-room-${placed}`;
        operations.push(
          { op: 'add-node', ref, position, size, function: roomFunction },
          { op: 'add-edge', source: courtyard.id, target: ref, relationship: 'access' },
        );
        if (placed === count) break;
      }
    }

    return {
      kind: 'transformation',
      summary: placed === count ? `Placed ${placed} of ${count} requested rooms around Courtyard ${courtyard.id}.`
        : `Placed ${placed} of ${count} requested rooms. No more free perimeter positions fit those dimensions.`,
      operations,
    };
  },
});
