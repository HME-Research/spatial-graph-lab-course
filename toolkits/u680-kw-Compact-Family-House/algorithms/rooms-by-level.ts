import { defineDesignAnalysis } from '@student-api';

export default defineDesignAnalysis({
  id: 'rooms-by-level',
  label: 'Rooms by level and entrance access',
  description: 'Counts rooms by Function and level, and highlights rooms connected to an entrance.',
  inputs: [],
  uses: { functions: ['entrance'] },
  run({ design, functions }) {
    // Count each room on the level where it starts.
    const counts = new Map<number, Map<string, number>>();
    for (const room of design.nodes) {
      const level = room.position[2];
      const onLevel = counts.get(level) ?? new Map<string, number>();
      onLevel.set(room.function, (onLevel.get(room.function) ?? 0) + 1);
      counts.set(level, onLevel);
    }

    // List the room counts in level order, with one count per Function.
    const labels = new Map(functions.map(({ id, label }) => [id, label]));
    for (const room of design.nodes) {
      if (!labels.has(room.function)) labels.set(room.function, room.function);
    }
    const levelCounts = [...counts].sort(([a], [b]) => a - b).map(([level, onLevel]) => {
      const rooms = [...labels].map(([id, label]) => `${label} ${onLevel.get(id) ?? 0}`);
      return `Level ${level}: ${rooms.join(', ')}`;
    });

    // Record each relationship in both directions.
    const links = new Map(design.nodes.map(({ id }) => [id, [] as number[]]));
    for (const { source, target } of design.edges) {
      links.get(source)?.push(target);
      links.get(target)?.push(source);
    }

    // Start at every entrance and visit each connected room once.
    const entranceIds = design.nodes.filter((room) => room.function === 'entrance').map(({ id }) => id);
    const queue = [...entranceIds];
    const reachable = new Set(queue);
    for (let index = 0; index < queue.length; index++) {
      for (const next of links.get(queue[index]!) ?? []) {
        if (reachable.has(next)) continue;
        reachable.add(next);
        queue.push(next);
      }
    }

    // Show the counts and highlight the entrance-connected rooms.
    const access = entranceIds.length === 0 ? 'Add an Entrance to check reachability.' : 'Reachable room IDs: ' + [...reachable].sort((a, b) => a - b).join(', ') + '.';
    return {
      kind: 'analysis',
      text: [...levelCounts, access].join(' | '),
      highlightNodes: [...reachable],
    };
  },
});
