import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';
import ensuite from '../functions/ensuite';
import livingRoom from '../functions/living-room';
import diningKitchen from '../functions/dining-kitchen';
import laundry from '../functions/laundry';

/**
 * Generate flat: a transformation that draws a whole student flat as rooms and relationships.
 * Run it on a NEW EMPTY project with this toolkit. The Living room is a long shared space
 * (one cell per bedroom column) with the Dining kitchen at one end and the Laundry at the other.
 * Every Bedroom opens off the Living room and has its own Ensuite behind it.
 * One cell is 3 × 3 m.
 */
export default defineSpatialAlgorithm({
  id: 'generate-flat',
  label: 'Generate flat',
  parameters: {
    bedrooms: {
      kind: 'number',
      min: 1,
      max: 16,
      default: 6,
      label: 'Number of bedrooms',
      description: 'How many Bedrooms (each with its own Ensuite), from 1 to 16.',
    },
    layout: {
      kind: 'enum',
      values: ['one-side', 'both-sides'],
      default: 'one-side',
      label: 'Bedroom layout',
      description: 'Bedrooms on one side of the Living room, or on both sides (a shorter, deeper flat).',
    },
    biggerBedrooms: {
      kind: 'boolean',
      default: true,
      label: 'Bigger bedrooms',
      description: 'Move each Ensuite wall 1.5 m into the Ensuite: Bedroom 13.5 m², Ensuite 4.5 m² (instead of 9 m² each).',
    },
  },
  run(ctx) {
    // Only on an empty design, so the new rooms never overlap rooms you already drew.
    if (ctx.design.nodes.length > 0) {
      return {
        kind: 'transformation',
        summary: 'Start from a NEW EMPTY project with this toolkit: Generate flat draws the whole flat.',
        operations: [],
      };
    }

    // The parameters (the app fills in their defaults; TypeScript still wants a fallback).
    const bedrooms = Math.floor(ctx.params.bedrooms ?? 6);
    const bothSides = (ctx.params.layout ?? 'one-side') === 'both-sides';
    const biggerBedrooms = ctx.params.biggerBedrooms ?? true;

    // How many bedroom columns the Living room needs, and the row (y) it sits on.
    const columns = bothSides ? Math.ceil(bedrooms / 2) : bedrooms;
    const spineY = bothSides ? 2 : 0;
    const operations: SpatialOperation[] = [];

    // The shared rooms in one row: Dining kitchen (2 cells), Living room, Laundry.
    operations.push({ op: 'add-node', ref: 'kitchen', position: [0, spineY, 0], size: [2, 1, 1], function: diningKitchen.id });
    operations.push({ op: 'add-node', ref: 'living', position: [2, spineY, 0], size: [columns, 1, 1], function: livingRoom.id });
    operations.push({ op: 'add-node', ref: 'laundry', position: [2 + columns, spineY, 0], function: laundry.id });
    operations.push({ op: 'add-edge', source: 'kitchen', target: 'living', relationship: 'open' });
    operations.push({ op: 'add-edge', source: 'living', target: 'laundry', relationship: 'access' });

    // Each Bedroom touches the Living room; its Ensuite sits one cell further out.
    for (let i = 0; i < bedrooms; i++) {
      // Which column, and which side: +1 = north of the Living room, -1 = south.
      const column = bothSides ? Math.floor(i / 2) : i;
      const side = bothSides && i % 2 === 1 ? -1 : 1;
      const x = 2 + column;
      const room = `bedroom-${i + 1}`;
      const bath = `ensuite-${i + 1}`;

      operations.push({ op: 'add-node', ref: room, position: [x, spineY + side, 0], function: bedroom.id });
      operations.push({ op: 'add-node', ref: bath, position: [x, spineY + 2 * side, 0], function: ensuite.id });
      operations.push({ op: 'add-edge', source: 'living', target: room, relationship: 'access' });

      // Bedroom → Ensuite door; "toward-target" moves the shared wall into the Ensuite.
      operations.push({
        op: 'add-edge',
        source: room,
        target: bath,
        relationship: 'access',
        boundaryShift: biggerBedrooms ? 'toward-target' : 'none',
      });
    }

    return {
      kind: 'transformation',
      summary: `A flat with ${bedrooms} Bedroom(s) and Ensuite(s), a Living room, a Dining kitchen and a Laundry.`,
      operations,
    };
  },
});
