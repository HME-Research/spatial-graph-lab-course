import { defineDesignAnalysis } from '@student-api';

/**
 * Pet access to garden: a design analysis (it reads the rooms themselves, not only the graph).
 *
 * For every pet-friendly room (not a garden itself), it checks whether the room is joined by a
 * relationship to a Garden. It lights up those rooms and the gardens they reach, and counts the
 * rooms. Run it to see whether pets can get from the living room out to a garden.
 *
 * `uses` lists the Function id and the field it reads, so the app knows it needs `garden` and
 * `petFriendly`; anywhere without them it is listed as disabled, with the reason.
 */
export default defineDesignAnalysis({
  id: 'pet-access',
  label: 'Pet access to garden',
  description: 'Rooms where pets are welcome that are joined straight onto a garden.',
  inputs: [],
  uses: { functions: ['garden'], nodeFields: ['petFriendly'] },
  run(ctx) {
    // Every garden, by id.
    const gardenIds = new Set(ctx.design.nodes.filter((n) => n.function === 'garden').map((n) => n.id));

    // Pet-friendly rooms joined to a garden, and the gardens they reach (count each room once).
    const rooms: number[] = [];
    const reached: number[] = [];
    for (const room of ctx.design.nodes) {
      if (room.function === 'garden') continue; // a garden is not a room pets come from
      if (room.custom.petFriendly !== true) continue;
      for (const edge of ctx.design.edges) {
        const other = edge.source === room.id ? edge.target : edge.target === room.id ? edge.source : undefined;
        if (other === undefined || !gardenIds.has(other)) continue;
        rooms.push(room.id);
        if (!reached.includes(other)) reached.push(other);
        break; // one garden edge is enough
      }
    }

    const count = rooms.length;
    return {
      kind: 'analysis',
      value: count,
      text:
        count === 0
          ? 'No pet-friendly room is joined to a garden yet.'
          : `${count} pet-friendly room(s) open onto a garden.`,
      highlightNodes: [...rooms, ...reached],
    };
  },
});
