import { defineSpatialAlgorithm, FACE_DIRECTIONS, neighbourCell, type SpatialOperation } from '@student-api';
import gallery from '../types/gallery';

const HORIZONTAL = FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z');

/**
 * Spatial transformation: set each gallery's `daylight` from how many of its four walls face the
 * outside (no neighbouring room): 3 or more → high, 2 → medium, fewer → low.
 * Only galleries whose value would change get an operation.
 */
export default defineSpatialAlgorithm({
  id: 'daylight-from-exposure',
  label: 'Daylight from exposed walls',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    for (const node of ctx.design.nodes) {
      if (node.typeId !== gallery.id) continue;
      const exposed = HORIZONTAL.filter((d) => ctx.nodeAt(neighbourCell(node.grid, d)) === undefined).length;
      const daylight = exposed >= 3 ? 'high' : exposed === 2 ? 'medium' : 'low';
      if (ctx.attributesOf(node, gallery).daylight !== daylight) {
        operations.push({ op: 'set-node-attribute', nodeId: node.id, key: 'daylight', value: daylight });
      }
    }
    return { kind: 'transformation', summary: `${operations.length} gallery daylight value(s) updated.`, operations };
  },
});
