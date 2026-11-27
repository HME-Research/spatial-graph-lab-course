import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

// Add access relationships that support courtyard use and private bedroom circulation.
export default defineSpatialAlgorithm({
  id: 'improve-courtyard-circulation',
  label: 'Improve courtyard circulation',
  run(ctx) {
    const nodes = ctx.design.nodes;
    const courtyard = nodes.find((room) => room.function === 'covered-courtyard');
    const shared = nodes.filter((room) =>
      ['entrance', 'kitchen', 'living-room', 'guest-bedroom'].includes(room.function),
    );
    const bedrooms = nodes.filter((room) =>
      ['adult-bedroom', 'childrens-bedroom'].includes(room.function),
    );
    const bathrooms = nodes.filter((room) => room.function === 'bathroom');
    const operations: SpatialOperation[] = [];
    const related = (a: number, b: number) => ctx.design.edges.some((edge) =>
      (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a),
    );

    // Rate daylight from the room's exterior wall length.
    for (const room of nodes) {
      const facadeLength = ctx.metrics.value('exposed-facade-length', room.id);
      if (typeof facadeLength !== 'number') continue;
      const daylight = facadeLength >= 18 ? 'high' : facadeLength >= 9 ? 'medium' : 'low';
      operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'daylight', value: daylight });
    }

    // Link every same-level shared room to the courtyard when they touch and have no edge.
    if (courtyard) {
      for (const room of shared) {
        if (room.position[2] === courtyard.position[2] && ctx.touches(room.id, courtyard.id) && ctx.canRelate(courtyard.id, room.id)) {
          operations.push({ op: 'add-edge', source: courtyard.id, target: room.id, relationship: 'access' });
        }
      }
    }

    // Give each bedroom the nearest unused bathroom on its own level.
    const unusedBathrooms = bathrooms.slice();
    for (const bedroom of bedrooms) {
      const candidates = unusedBathrooms.filter((bathroom) => bathroom.position[2] === bedroom.position[2]);
      candidates.sort((a, b) => {
        const distance = (bathroom: typeof a) =>
          Math.abs(bathroom.position[0] - bedroom.position[0]) +
          Math.abs(bathroom.position[1] - bedroom.position[1]);
        return distance(a) - distance(b);
      });
      const bathroom = candidates[0];
      if (bathroom && !related(bedroom.id, bathroom.id) && ctx.canRelate(bedroom.id, bathroom.id)) {
        operations.push({ op: 'add-edge', source: bedroom.id, target: bathroom.id, relationship: 'access' });
      }
      if (bathroom && (related(bedroom.id, bathroom.id) || ctx.canRelate(bedroom.id, bathroom.id))) {
        operations.push({ op: 'set-node-custom-attribute', nodeId: bedroom.id, key: 'privateBathroom', value: true });
      }
      if (bathroom) unusedBathrooms.splice(unusedBathrooms.indexOf(bathroom), 1);
    }

    // Return proposed access links for preview and application.
    return {
      kind: 'transformation',
      summary: operations.length
        ? `Proposed ${operations.length} access relationship(s) for courtyard circulation and bedroom privacy.`
        : 'No access links were added; check that the expected rooms are present, on the same level, and touching.',
      operations,
    };
  },
});
