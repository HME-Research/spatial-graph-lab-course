import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import { bedroomFunctionIds } from '../lib/bedrooms';

/** Sets bedrooms larger than 12 m² to two beds. */
export default defineSpatialAlgorithm({
  id: 'two-beds-for-large-bedrooms',
  label: 'Two beds for large bedrooms',
  run(ctx) {
    const operations: SpatialOperation[] = [];

    // Set two beds in each bedroom whose nominal area is greater than 12 m².
    for (const room of ctx.design.nodes) {
      if (!bedroomFunctionIds.includes(room.function)) continue;
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number' || area <= 12) continue;
      // Read the room's own bed count, or its Function's default.
      const currentBeds = ctx.nodeCustom(room.id).bedCount;
      if (currentBeds === 2) continue;
      operations.push({
        op: 'set-node-custom-attribute',
        nodeId: room.id,
        key: 'bedCount',
        value: 2,
      });
    }

    // Summarize the changes for the transformation preview.
    const summary =
      operations.length === 0
        ? 'No bedrooms over 12 m² need a bed-count change.'
        : `Set two beds in ${operations.length} bedroom(s) over 12 m².`;
    return { kind: 'transformation', summary, operations };
  },
});
