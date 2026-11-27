import { defineDesignAnalysis } from '@student-api';

// Check courtyard placement and private bedroom access.
export default defineDesignAnalysis({
  id: 'check-courtyard-layout',
  label: 'Check courtyard layout',
  description: 'Checks ground-floor rooms around the courtyard and direct upstairs bedroom-to-bathroom relationships.',
  inputs: [],
  uses: { functions: ['covered-courtyard', 'entrance', 'kitchen', 'living-room', 'guest-bedroom', 'adult-bedroom', 'childrens-bedroom', 'bathroom'] },
  run(ctx) {
    const rooms = ctx.design.nodes;
    const courtyard = rooms.find((room) => room.function === 'covered-courtyard');
    const shared = rooms.filter((room) =>
      ['entrance', 'kitchen', 'living-room', 'guest-bedroom'].includes(room.function),
    );
    const bedrooms = rooms.filter((room) =>
      ['adult-bedroom', 'childrens-bedroom'].includes(room.function),
    );
    const bathrooms = rooms.filter((room) => room.function === 'bathroom');
    const highlights: number[] = [];
    let groundFloorOk = Boolean(courtyard) && shared.length === 4;
    let privateConnectionsOk = bedrooms.length === 2;
    const usedBathrooms: number[] = [];

    // Check that all four ground-floor spaces share the courtyard's level and touch it.
    if (courtyard) {
      highlights.push(courtyard.id);
      for (const room of shared) {
        highlights.push(room.id);
        if (room.position[2] !== courtyard.position[2] || !ctx.touches(room.id, courtyard.id)) {
          groundFloorOk = false;
        }
      }
    }

    // Check that each upstairs bedroom has its own same-level bathroom relationship.
    for (const bedroom of bedrooms) {
      highlights.push(bedroom.id);
      const bathroom = bathrooms.find((candidate) =>
        !usedBathrooms.includes(candidate.id) &&
        candidate.position[2] === bedroom.position[2] &&
        ctx.design.edges.some((edge) =>
          (edge.source === bedroom.id && edge.target === candidate.id) ||
          (edge.source === candidate.id && edge.target === bedroom.id),
        ),
      );
      if (bathroom) {
        usedBathrooms.push(bathroom.id);
        highlights.push(bathroom.id);
      } else {
        privateConnectionsOk = false;
      }
    }

    // Report whether the expected room groups and links are present.
    const passed = groundFloorOk && privateConnectionsOk && bathrooms.length >= 2;
    return {
      kind: 'analysis',
      value: passed ? 1 : 0,
      text: passed
        ? 'All four shared rooms touch the courtyard, and each upstairs bedroom has its own bathroom relationship.'
        : 'Check that the four ground-floor rooms touch the courtyard and each upstairs bedroom connects to its own bathroom.',
      highlightNodes: highlights,
    };
  },
});
