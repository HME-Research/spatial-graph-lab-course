import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

// Equip large library halls on every level.
export default defineSpatialAlgorithm({
  id: 'equip-large-halls',
  label: 'Set large halls to 10 bookshelves',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    for (const room of ctx.design.nodes) {
      // Check the hall's floor area and its current shelf count.
      if (room.function !== 'library-hall') continue;
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number' || area <= 50 || ctx.nodeCustom(room.id).bookshelves === 10) continue;

      // Propose exactly ten shelves in this hall.
      operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'bookshelves', value: 10 });
    }
    // Let the student preview the changes before applying them.
    return { kind: 'transformation', summary: `Library halls to update: ${operations.length}.`, operations };
  },
});
