import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';
import ensuite from '../functions/ensuite';
import livingRoom from '../functions/living-room';
import diningKitchen from '../functions/dining-kitchen';
import laundry from '../functions/laundry';
import hallway from '../functions/hallway';
import entrance from '../functions/entrance';

/**
 * Generate flat: a transformation that draws a whole student flat as rooms and relationships.
 * It goes to the right of any rooms already drawn. One cell is 3 × 3 m.
 *
 * Circulation: Entrance → Hallway; the Hallway leads to every Bedroom, the Living room and the
 * Laundry; the Living room and Dining kitchen are one open-plan space; each Bedroom has its own
 * Ensuite. Daylight: every room has at least one wall to the outside, for any number of bedrooms
 * and either layout (N = north row, H = Hallway row, S = south row):
 *
 *   N:  K L B E B E … (U)       K = Dining kitchen, L = Living room, B = Bedroom, E = Ensuite
 *   H:  K L H H H H … H X       X = Entrance, U = Laundry (north of the last Hallway cell when
 *   S:  K L B E B E … (U)           bedrooms are on both sides, else south of the Hallway)
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
      description: 'Bedrooms on one side of the Hallway, or on both sides (a shorter, deeper flat).',
    },
    biggerBedrooms: {
      kind: 'boolean',
      default: true,
      label: 'Bigger bedrooms',
      description: 'Move each Ensuite wall 1.5 m into the Ensuite: Bedroom 13.5 m², Ensuite 4.5 m² (instead of 9 m² each).',
    },
  },
  run(ctx) {
    // Start to the right of every room already in the design (one empty cell between),
    // so the new flat never overlaps rooms you drew. In an empty design it starts at x = 0.
    let startX = 0;
    for (const room of ctx.design.nodes) {
      startX = Math.max(startX, room.position[0] + room.size[0] + 1);
    }

    // The parameters (the app fills in their defaults; TypeScript still wants a fallback).
    const bedrooms = Math.floor(ctx.params.bedrooms ?? 6);
    const bothSides = (ctx.params.layout ?? 'one-side') === 'both-sides';
    const biggerBedrooms = ctx.params.biggerBedrooms ?? true;

    // Rows (y): the Hallway on row 1, the north rooms on row 2, the south rooms on row 0.
    const hallY = 1;
    // Bedroom + Ensuite pairs along each side of the Hallway; each pair is 2 cells wide.
    const pairsPerSide = bothSides ? Math.ceil(bedrooms / 2) : bedrooms;
    // With rooms on both sides, the Hallway gets one extra cell whose south wall is outside.
    const hallLength = 2 * pairsPerSide + (bothSides ? 1 : 0);
    // Columns (x): Dining kitchen, Living room, then the Hallway, then the Entrance.
    const kitchenX = startX;
    const livingX = startX + 1;
    const hallX = startX + 2;
    const lastHallX = hallX + hallLength - 1;
    // The Living room and Dining kitchen are as deep as the rows that have rooms.
    const sharedY = bothSides ? 0 : 1;
    const sharedDepth = bothSides ? 3 : 2;
    const operations: SpatialOperation[] = [];

    // The open-plan Living room and Dining kitchen, side by side at the start of the Hallway.
    operations.push({ op: 'add-node', ref: 'kitchen', position: [kitchenX, sharedY, 0], size: [1, sharedDepth, 1], function: diningKitchen.id });
    operations.push({ op: 'add-node', ref: 'living', position: [livingX, sharedY, 0], size: [1, sharedDepth, 1], function: livingRoom.id });
    operations.push({ op: 'add-edge', source: 'living', target: 'kitchen', relationship: 'open' });

    // The Hallway, then the Entrance at its far end.
    operations.push({ op: 'add-node', ref: 'hallway', position: [hallX, hallY, 0], size: [hallLength, 1, 1], function: hallway.id });
    operations.push({ op: 'add-node', ref: 'entrance', position: [lastHallX + 1, hallY, 0], function: entrance.id });
    operations.push({ op: 'add-edge', source: 'entrance', target: 'hallway', relationship: 'access' });
    operations.push({ op: 'add-edge', source: 'hallway', target: 'living', relationship: 'access' });

    // The Laundry beside the last Hallway cell: north (both sides) or south (one side).
    const laundryY = bothSides ? hallY + 1 : hallY - 1;
    operations.push({ op: 'add-node', ref: 'laundry', position: [lastHallX, laundryY, 0], function: laundry.id });
    operations.push({ op: 'add-edge', source: 'hallway', target: 'laundry', relationship: 'access' });

    // Each Bedroom opens off the Hallway; its Ensuite is right beside it, also on the outside wall.
    for (let i = 0; i < bedrooms; i++) {
      // Which pair along the Hallway, and which side: north row first, then south.
      const pair = bothSides ? Math.floor(i / 2) : i;
      const y = bothSides && i % 2 === 1 ? hallY - 1 : hallY + 1;
      const x = hallX + 2 * pair;
      const room = `bedroom-${i + 1}`;
      const bath = `ensuite-${i + 1}`;

      operations.push({ op: 'add-node', ref: room, position: [x, y, 0], function: bedroom.id });
      operations.push({ op: 'add-node', ref: bath, position: [x + 1, y, 0], function: ensuite.id });
      operations.push({ op: 'add-edge', source: 'hallway', target: room, relationship: 'access' });

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
      summary: `A flat with an Entrance, a Hallway, ${bedrooms} Bedroom(s) with Ensuite, an open-plan Living room and Dining kitchen, and a Laundry. Every room has an outside wall.`,
      operations,
    };
  },
});
