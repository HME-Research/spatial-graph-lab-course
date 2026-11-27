import { defineDesignAnalysis, neighbourCell, roomCells } from '@student-api';

// Count horizontal orientations only, including adjacent sides on corner rooms.
const sides = ['+x', '-x', '+y', '-y'] as const;

export default defineDesignAnalysis({
  id: 'dual-aspect-daylighting',
  label: 'Dual-aspect daylight potential',
  description: 'Find rooms with two or more horizontal sides facing empty space, a Courtyard or a Terrace.',
  inputs: [],
  uses: { functions: ['courtyard', 'terrace'] },
  run(ctx) {
    // Treat courtyard and terrace nodes as outdoor space.
    const outdoors = new Set(ctx.design.nodes
      .filter((room) => room.function === 'courtyard' || room.function === 'terrace')
      .map((room) => room.id));
    const nodeValues: Record<number, number> = {};
    const highlightNodes: number[] = [];

    // Count each exposed orientation once, even if several cells face it.
    for (const room of ctx.design.nodes) {
      if (outdoors.has(room.id)) continue;
      const exposed = new Set<string>();
      for (const cell of roomCells(room)) {
        for (const side of sides) {
          if (exposed.has(side)) continue;
          const neighbour = ctx.nodeAt(neighbourCell(cell, side));
          if (neighbour === undefined || outdoors.has(neighbour)) exposed.add(side);
        }
        if (exposed.size === sides.length) break;
      }
      nodeValues[room.id] = exposed.size;
      if (exposed.size >= 2) highlightNodes.push(room.id);
    }

    return {
      kind: 'analysis',
      value: highlightNodes.length,
      text: highlightNodes.length > 0
        ? `${highlightNodes.length} rooms face outdoor space on at least two sides.`
        : 'No rooms face outdoor space on at least two sides.',
      nodeValues,
      highlightNodes,
    };
  },
});
