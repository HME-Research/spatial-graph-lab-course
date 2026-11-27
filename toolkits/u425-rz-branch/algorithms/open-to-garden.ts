import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import garden from '../functions/garden';

/**
 * Open rooms to the garden: a transformation.
 *
 * For every pet-friendly room, it looks for a Garden the room touches (shares a wall with) but is
 * not yet related to, and adds an `open` relationship between them. The app shows a preview; nothing
 * changes until the student presses Apply. Run it to give pets a way out to the garden.
 */
export default defineSpatialAlgorithm({
  id: 'open-to-garden',
  label: 'Open rooms to the garden',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    const gardens = ctx.design.nodes.filter((n) => n.function === garden.id);

    for (const room of ctx.design.nodes) {
      if (room.function === garden.id) continue; // a garden does not open onto itself
      if (ctx.nodeCustom(room.id).petFriendly !== true) continue; // pets must be welcome here
      for (const g of gardens) {
        if (!ctx.touches(room.id, g.id)) continue; // they must share a wall
        const already = ctx.design.edges.some(
          (e) => (e.source === room.id && e.target === g.id) || (e.source === g.id && e.target === room.id),
        );
        if (already) continue; // they are already related
        operations.push({ op: 'add-edge', source: room.id, target: g.id, relationship: 'open' });
      }
    }

    return {
      kind: 'transformation',
      summary:
        operations.length === 0
          ? 'No pet-friendly room touches a garden it is not already open to.'
          : `Open ${operations.length} pet-friendly room(s) to a garden.`,
      operations,
    };
  },
});
