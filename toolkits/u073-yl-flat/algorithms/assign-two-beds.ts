import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

// Preview a two-bed assignment for each bedroom larger than 12 square metres.
export default defineSpatialAlgorithm({
  id: 'assign-two-beds',
  label: 'Assign two beds',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    for (const room of ctx.design.nodes) {
      // Check the bedroom's nominal floor area in square metres.
      if (room.function !== 'bedroom') continue;
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number' || area <= 12) continue;

      // Set the count to exactly two only where a change is needed.
      if (ctx.nodeCustom(room.id).beds === 2) continue;
      operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'beds', value: 2 });
    }

    // Show how many bedrooms would change if the student presses Apply.
    return { kind: 'transformation', summary: `Bedrooms to set to two beds: ${operations.length}.`, operations };
  },
});
