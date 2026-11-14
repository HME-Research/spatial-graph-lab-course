import {
  defineSpatialAlgorithm,
  edgesBetween,
  FACE_DIRECTIONS,
  getNode,
  neighbourCell,
  uniqueId,
  type SpatialOperation,
} from '@student-api';
import gallery from '../types/gallery';
import storage from '../types/storage';

const HORIZONTAL = FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z');

/**
 * Spatial transformation: add a door between every storage room and each gallery beside it
 * (same storey, sharing a wall) that it is not yet connected to.
 */
export default defineSpatialAlgorithm({
  id: 'connect-storage-to-galleries',
  label: 'Connect storage to neighbouring galleries',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    const newIds: string[] = [];
    for (const room of ctx.design.nodes) {
      if (room.typeId !== storage.id) continue;
      for (const direction of HORIZONTAL) {
        const otherId = ctx.nodeAt(neighbourCell(room.grid, direction));
        const other = otherId === undefined ? undefined : getNode(ctx.design, otherId);
        if (!other || other.typeId !== gallery.id) continue;
        if (edgesBetween(ctx.design, room.id, other.id).length > 0) continue;
        if (!ctx.canConnect('door', room.grid, other.grid)) continue;
        const id = uniqueId(ctx.design, 'door', newIds);
        newIds.push(id);
        operations.push({ op: 'add-edge', id, source: room.id, target: other.id, kind: 'door' });
      }
    }
    return { kind: 'transformation', summary: `${operations.length} door(s) added.`, operations };
  },
});
