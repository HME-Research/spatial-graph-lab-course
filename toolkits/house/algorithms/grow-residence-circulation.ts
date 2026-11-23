import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

/**
 * A teaching experiment, NOT a compliant housing layout.
 * Run on an empty project using the House toolkit.
 * A room occupies two 3 × 3 m cells; every corridor segment occupies one cell.
 * Compare single-loaded vs double-loaded circulation with the same room count.
 */
export default defineSpatialAlgorithm({
  id: 'grow-residence-circulation',
  label: 'Grow residence: compare circulation',
  parameters: {
    bedrooms: {
      kind: 'number',
      min: 2,
      max: 12,
      default: 6,
      label: 'Number of rooms',
      description: 'Number of private student rooms (2–12).',
    },
    arrangement: {
      kind: 'enum',
      values: ['single-loaded', 'double-loaded'],
      default: 'single-loaded',
      label: 'Circulation arrangement',
      description: 'Rooms on one side of the corridor, or both sides.',
    },
  },
  run(ctx) {
    if (ctx.design.nodes.length > 0) {
      return {
        kind: 'transformation',
        summary: 'Start from a NEW EMPTY project using the House toolkit. This example generates a complete comparison scheme.',
        operations: [],
      };
    }

    const bedrooms = ctx.params.bedrooms ?? 6;
    const arrangement = ctx.params.arrangement ?? 'single-loaded';
    if (!Number.isInteger(bedrooms) || bedrooms < 2 || bedrooms > 12) {
      return { kind: 'transformation', summary: 'Choose a whole number of rooms between 2 and 12.', operations: [] };
    }
    const doubleLoaded = arrangement === 'double-loaded';
    const segments = Math.ceil(bedrooms / (doubleLoaded ? 2 : 1));
    const operations: SpatialOperation[] = [];

    // Entry and circulation spine: each cell is 3 m along x.
    operations.push({ op: 'add-node', ref: 'entry', position: [0, 0, 0], function: 'entrance' });
    for (let i = 1; i <= segments; i++) {
      const current = `corridor-${i}`;
      const previous = i === 1 ? 'entry' : `corridor-${i - 1}`;
      operations.push({ op: 'add-node', ref: current, position: [i, 0, 0], function: 'circulation' });
      operations.push({ op: 'add-edge', source: previous, target: current, relationship: 'access' });
    }

    // Each room is 3 × 6 m, with a face adjacent to its corridor cell.
    for (let i = 0; i < bedrooms; i++) {
      const segment = doubleLoaded ? Math.floor(i / 2) + 1 : i + 1;
      const north = !doubleLoaded || i % 2 === 0;
      const roomRef = `bedroom-${i + 1}`;
      operations.push({
        op: 'add-node',
        ref: roomRef,
        position: [segment, north ? 1 : -2, 0],
        size: [1, 2, 1],
        function: 'bedroom',
      });
      operations.push({ op: 'add-edge', source: `corridor-${segment}`, target: roomRef, relationship: 'access' });
    }

    // A shared living room at the far end of the circulation spine.
    operations.push({
      op: 'add-node',
      ref: 'shared-living',
      position: [segments + 1, 0, 0],
      size: [2, 2, 1],
      function: 'living',
    });
    operations.push({ op: 'add-edge', source: `corridor-${segments}`, target: 'shared-living', relationship: 'access' });

    return {
      kind: 'transformation',
      summary: `${bedrooms} rooms, ${segments} corridor cells, 1 shared space. ` +
        `${doubleLoaded ? 'Double-loaded' : 'Single-loaded'} arrangement. ` +
        'Compare corridor length and access depth; this is a schematic, not a compliant building.',
      operations,
    };
  },
});
