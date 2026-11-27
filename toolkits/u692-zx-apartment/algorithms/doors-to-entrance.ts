import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';
import entrance from '../functions/entrance';
import { innerRoomCauses, sameStorey } from '../lib/bedrooms';

/**
 * Doors to the entrance: a transformation. For every Bedroom that is an inner room (see
 * "Quiet bedrooms"), if it already shares a wall with an Entrance, it proposes a new door (Access)
 * between them, so the Bedroom no longer depends on the Living room or Kitchen. Inner Bedrooms
 * with no Entrance next to them are left alone. Nothing changes until the student presses Apply.
 */
export default defineSpatialAlgorithm({
  id: 'doors-to-entrance',
  label: 'Doors to the entrance',
  run(ctx) {
    const { nodes, edges } = ctx.design;
    const entrances = nodes.filter((room) => room.function === entrance.id);
    const operations: SpatialOperation[] = [];
    let innerWithoutEntrance = 0;

    for (const room of nodes) {
      // Only Bedrooms that are inner rooms.
      if (room.function !== bedroom.id) continue;
      if (innerRoomCauses(nodes, edges, room).length === 0) continue;
      // The first Entrance it shares a wall with (same storey, touching).
      const next = entrances.find((e) => ctx.touches(room.id, e.id) && sameStorey(room, e) && ctx.canRelate(room.id, e.id));
      if (!next) {
        innerWithoutEntrance += 1;
        continue;
      }
      // A new door between the Bedroom and that Entrance.
      operations.push({ op: 'add-edge', source: next.id, target: room.id, relationship: 'access' });
    }

    // Say what was proposed, and which inner Bedrooms could not get a door.
    const proposed = operations.length === 0
      ? 'No new door: no inner Bedroom shares a wall with an Entrance.'
      : `New door from the Entrance to ${operations.length} inner Bedroom(s).`;
    const leftOver = innerWithoutEntrance === 0
      ? ''
      : ` ${innerWithoutEntrance} inner Bedroom(s) share no wall with an Entrance: move them in the design.`;
    return { kind: 'transformation', summary: proposed + leftOver, operations };
  },
});
