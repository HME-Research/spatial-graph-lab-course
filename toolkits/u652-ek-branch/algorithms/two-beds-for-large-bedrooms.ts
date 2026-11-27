import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';
import masterBedroom from '../functions/master-bedroom';

/** Sets bedrooms larger than 12 m² to two beds. */
export default defineSpatialAlgorithm({
  id: 'two-beds-for-large-bedrooms',
  label: 'Two beds for large bedrooms',
  run(ctx) {
    const operations: SpatialOperation[] = [];

    // Set two beds in each bedroom whose nominal area is greater than 12 m².
    for (const room of ctx.design.nodes) {
      if (room.function !== bedroom.id && room.function !== masterBedroom.id) continue;
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number' || area <= 12) continue;
      const currentBeds =
        room.function === bedroom.id
          ? ctx.customOf(room, bedroom).bedCount
          : ctx.customOf(room, masterBedroom).bedCount;
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
