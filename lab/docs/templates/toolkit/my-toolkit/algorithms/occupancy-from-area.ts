import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import circulation from '../functions/circulation';

/**
 * Occupancy from area: a transformation. It proposes a new `occupancy` for every node that is not
 * Circulation: its floor area divided by the area each person needs, rounded down. The app shows
 * the change as a preview; nothing changes until the student presses Apply.
 */
export default defineSpatialAlgorithm({
  id: 'occupancy-from-area',
  label: 'Occupancy from area',
  parameters: {
    areaPerPerson: {
      kind: 'number',
      min: 1,
      default: 9,
      label: 'Area per person (m²)',
      description: 'Floor area each person needs. One cell is 3 × 3 m = 9 m².',
    },
  },
  run(ctx) {
    // The parameter (the app fills in its default; TypeScript still wants a fallback).
    const areaPerPerson = ctx.params.areaPerPerson ?? 9;
    const operations: SpatialOperation[] = [];
    for (const node of ctx.design.nodes) {
      // Circulation keeps its own value.
      if (node.function === circulation.id) continue;
      // The floor area the app calculates (m²).
      const area = ctx.metrics.value('area', node.id);
      if (typeof area !== 'number') continue;
      // People = area ÷ area per person, rounded down.
      const people = Math.floor(area / areaPerPerson);
      operations.push({ op: 'set-node-custom-attribute', nodeId: node.id, key: 'occupancy', value: people });
    }
    return { kind: 'transformation', summary: `Occupancy set for ${operations.length} node(s).`, operations };
  },
});
