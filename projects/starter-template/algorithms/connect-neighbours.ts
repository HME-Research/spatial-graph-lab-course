import { defineSpatialAlgorithm, edgesBetween, FACE_DIRECTIONS, neighbourCell, uniqueId, type SpatialOperation } from '@student-api';

const HORIZONTAL = FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z');

/**
 * Spatial transformation: connect rooms that share a wall on the same storey but have no
 * relationship yet. The `kind` parameter chooses a door or an open connection.
 */
export default defineSpatialAlgorithm({
  id: 'connect-neighbours',
  label: 'Connect neighbouring rooms',
  parameters: { kind: { kind: 'enum', values: ['door', 'open'], default: 'door' } },
  run(ctx) {
    const kind = ctx.params.kind === 'open' ? 'open' : 'door';
    const operations: SpatialOperation[] = [];
    const newIds: string[] = [];
    const done = new Set<string>();
    for (const room of ctx.design.nodes) {
      for (const direction of HORIZONTAL) {
        const other = ctx.nodeAt(neighbourCell(room.grid, direction));
        if (other === undefined) continue;
        const pair = [room.id, other].sort().join('|');
        if (done.has(pair) || edgesBetween(ctx.design, room.id, other).length > 0) continue;
        done.add(pair);
        const id = uniqueId(ctx.design, kind, newIds);
        newIds.push(id);
        operations.push({ op: 'add-edge', id, source: room.id, target: other, kind });
      }
    }
    return { kind: 'transformation', summary: `${operations.length} ${kind} connection(s) added.`, operations };
  },
});
