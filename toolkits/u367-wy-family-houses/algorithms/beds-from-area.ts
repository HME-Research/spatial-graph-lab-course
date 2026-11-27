import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';

/**
 * Beds from area: a transformation. It proposes a new number of beds for every Bedroom from its
 * floor area: 18 m² or more gets 2 beds, smaller gets 1. The app shows the change as a preview;
 * nothing changes until the student presses Apply.
 */
export default defineSpatialAlgorithm({
  id: 'beds-from-area',
  label: 'Beds from area',
  parameters: {
    areaForTwoBeds: {
      kind: 'number',
      min: 1,
      default: 18,
      label: 'Area for 2 beds (m²)',
      description: 'A Bedroom this big or bigger gets 2 beds, a smaller one gets 1. One cell is 3 × 3 m = 9 m².',
    },
  },
  run(ctx) {
    // The parameter (the app fills in its default; TypeScript still wants a fallback).
    const areaForTwoBeds = ctx.params.areaForTwoBeds ?? 18;
    const operations: SpatialOperation[] = [];
    for (const node of ctx.design.nodes) {
      // Only Bedrooms get beds.
      if (node.function !== bedroom.id) continue;
      // The floor area the app calculates (m²).
      const area = ctx.metrics.value('area', node.id);
      if (typeof area !== 'number') continue;
      // Big enough: 2 beds, else 1.
      const beds = area >= areaForTwoBeds ? 2 : 1;
      operations.push({ op: 'set-node-custom-attribute', nodeId: node.id, key: 'beds', value: beds });
    }
    const summary =
      operations.length === 0 ? 'No Bedroom in this design.' : `Beds set for ${operations.length} Bedroom(s).`;
    return { kind: 'transformation', summary, operations };
  },
});
