import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

/** Open up touching quiet rooms that do not already share a relationship. */
export default defineSpatialAlgorithm({
  id: 'connect-quiet-rooms',
  label: 'Connect quiet rooms',
  run(ctx) {
    // Keep only rooms whose resolved project noise field is quiet.
    const quiet = ctx.design.nodes.filter((room) => ctx.nodeCustom(room.id).noise === 'quiet');
    const operations: SpatialOperation[] = [];

    // Check each unordered pair once so no relationship is proposed twice.
    for (let i = 0; i < quiet.length; i++) {
      for (let j = i + 1; j < quiet.length; j++) {
        const a = quiet[i]!;
        const b = quiet[j]!;

        // Open a shared wall or floor only if the rooms are not related yet.
        if (!ctx.touches(a.id, b.id) || !ctx.canRelate(a.id, b.id)) continue;
        operations.push({ op: 'add-edge', source: a.id, target: b.id, relationship: 'open' });
      }
    }

    // Let the student preview and apply these proposed edges.
    return {
      kind: 'transformation',
      summary: operations.length === 0
        ? 'No unconnected touching quiet-room pairs.'
        : `Propose ${operations.length} Open connection(s) between touching quiet rooms.`,
      operations,
    };
  },
});
