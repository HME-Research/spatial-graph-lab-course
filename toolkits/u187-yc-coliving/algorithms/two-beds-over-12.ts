import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

// Propose two beds for bedrooms whose nominal plan area exceeds 12 square metres.
export default defineSpatialAlgorithm({
  id: 'two-beds-over-12',
  label: 'Two beds above 12 m²',
  run(ctx) {
    // Collect changes only; the app previews them before Apply.
    const operations: SpatialOperation[] = [];
    for (const room of ctx.design.nodes) {
      if (room.function !== 'bedroom') continue;
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number' || area <= 12) continue;
      if (ctx.nodeCustom(room.id).beds === 2) continue;
      operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'beds', value: 2 });
    }

    // Explain an empty preview as well as a preview containing changes.
    return {
      kind: 'transformation',
      summary: operations.length ? `Set ${operations.length} bedroom(s) above 12 m² to two beds. Preview before Apply.` : 'No changes: no bedroom above 12 m² needs its beds set to two.',
      operations,
    };
  },
});
