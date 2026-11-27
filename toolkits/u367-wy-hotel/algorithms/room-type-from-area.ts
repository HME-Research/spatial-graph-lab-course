import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import guestRoom from '../functions/guest-room';

/**
 * Room type from area: a transformation. It sets each Guest room's type and guests from its floor
 * area: under 18 m² single (1 guest), 18 m² up to 27 m² double (2 guests), 27 m² or more family
 * (4 guests). The app shows the change as a preview; nothing changes until the student presses Apply.
 */
export default defineSpatialAlgorithm({
  id: 'room-type-from-area',
  label: 'Room type from area',
  parameters: {
    doubleFrom: {
      kind: 'number',
      min: 1,
      default: 18,
      label: 'Double from (m²)',
      description: 'A Guest room this big or bigger is at least a double room (2 guests); smaller is single (1 guest).',
    },
    familyFrom: {
      kind: 'number',
      min: 1,
      default: 27,
      label: 'Family from (m²)',
      description: 'A Guest room this big or bigger is a family room (4 guests). One cell is 3 × 3 m = 9 m².',
    },
  },
  run(ctx) {
    // The parameters (the app fills in their defaults; TypeScript still wants a fallback).
    const doubleFrom = ctx.params.doubleFrom ?? 18;
    const familyFrom = ctx.params.familyFrom ?? 27;
    const operations: SpatialOperation[] = [];
    for (const node of ctx.design.nodes) {
      // Only Guest rooms.
      if (node.function !== guestRoom.id) continue;
      // The floor area the app calculates (m²).
      const area = ctx.metrics.value('area', node.id);
      if (typeof area !== 'number') continue;
      // Choose the type and the guests from the area.
      let type = 'single';
      let guests = 1;
      if (area >= familyFrom) {
        type = 'family';
        guests = 4;
      } else if (area >= doubleFrom) {
        type = 'double';
        guests = 2;
      }
      operations.push({ op: 'set-node-custom-attribute', nodeId: node.id, key: 'roomType', value: type });
      operations.push({ op: 'set-node-custom-attribute', nodeId: node.id, key: 'guests', value: guests });
    }
    const rooms = operations.length / 2;
    const summary = rooms === 0 ? 'No Guest room in this design.' : `Type and guests set for ${rooms} Guest room(s).`;
    return { kind: 'transformation', summary, operations };
  },
});
