import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';

export default defineSpatialAlgorithm({
  id: 'two-beds',
  label: 'Two beds in larger bedrooms',
  run(ctx) {
    // Check the nominal floor area of each bedroom.
    const operations: SpatialOperation[] = [];
    for (const room of ctx.design.nodes) {
      if (room.function !== bedroom.id) continue;
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number' || area <= 12) continue;

      // Propose an update only when the bedroom needs a different bed count.
      if (ctx.customOf(room, bedroom).numberOfBeds === 2) continue;
      operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'numberOfBeds', value: 2 });
    }

    // Show the proposed changes before the student applies them.
    return {
      kind: 'transformation',
      summary: operations.length === 0
        ? 'No bedrooms need a bed count update.'
        : `Set the bed count to two in ${operations.length} bedroom(s).`,
      operations,
    };
  },
});
