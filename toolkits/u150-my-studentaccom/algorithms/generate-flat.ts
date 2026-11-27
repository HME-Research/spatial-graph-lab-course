import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import bedroom from '../functions/bedroom';
import ensuite from '../functions/ensuite';
import livingRoom from '../functions/living-room';
import diningKitchen from '../functions/dining-kitchen';
import laundry from '../functions/laundry';
import hallway from '../functions/hallway';
import entrance from '../functions/entrance';

/** A size parameter in cells (one cell = 3 m). */
function cells(label: string, max: number, fallback: number, description: string) {
  return { kind: 'number' as const, min: 1, max, default: fallback, label, description };
}

/** Longest room the app allows, in cells: a longer Hallway is made of several Hallway rooms. */
const MAX_LENGTH = 32;

/**
 * Generate flat: a transformation that draws a whole student flat as rooms and relationships.
 * It goes to the right of any rooms already drawn. One cell is 3 × 3 m.
 *
 * Circulation: Entrance → Hallway; the Hallway leads to every Bedroom, the Living room and the
 * Laundry; the Living room and Dining kitchen are one open-plan space; each Bedroom has its own
 * Ensuite. Daylight: every room has at least one wall to the outside, for every number of
 * bedrooms, layout and room size (N = north rooms, H = Hallway row, S = south rooms):
 *
 *   N:  K L L B E B E … (U)       K = Dining kitchen, L = Living room, B = Bedroom, E = Ensuite
 *   H:  K L L H H H H … H X       X = Entrance, U = Laundry (north of the last Hallway cell when
 *   S:  K L L B E B E … (U)           bedrooms are on both sides, else south of the Hallway)
 */
export default defineSpatialAlgorithm({
  id: 'generate-flat',
  label: 'Generate flat',
  parameters: {
    bedrooms: cells('Number of bedrooms', 16, 6, 'How many Bedrooms (each with its own Ensuite), from 1 to 16.'),
    layout: {
      kind: 'enum',
      values: ['one-side', 'both-sides'],
      default: 'one-side',
      label: 'Bedroom layout',
      description: 'Bedrooms on one side of the Hallway, or on both sides (a shorter, deeper flat).',
    },
    bedroomWidth: cells('Bedroom width (cells)', 4, 1, 'Along the Hallway. 1 cell = 3 m.'),
    bedroomDepth: cells('Bedroom depth (cells)', 4, 1, 'From the Hallway to the outside wall. 1 cell = 3 m.'),
    ensuiteWidth: cells('Ensuite width (cells)', 2, 1, 'Along the Hallway; an Ensuite is always 1 cell deep.'),
    kitchenWidth: cells('Dining kitchen width (cells)', 4, 1, 'Dining kitchen and Living room are as deep as the flat.'),
    livingWidth: cells('Living room width (cells)', 8, 2, 'Default 2: twice the Dining kitchen (2 : 1).'),
    biggerBedrooms: {
      kind: 'boolean',
      default: true,
      label: 'Bigger bedrooms',
      description: 'Move each Ensuite wall 1.5 m into the Ensuite: the Bedroom gains the area the Ensuite loses.',
    },
  },
  run(ctx) {
    // Start to the right of every room already in the design (one empty cell between),
    // so the new flat never overlaps rooms you drew. In an empty design it starts at x = 0.
    let startX = 0;
    for (const room of ctx.design.nodes) {
      startX = Math.max(startX, room.position[0] + room.size[0] + 1);
    }

    // The parameters, as whole numbers (the app fills in defaults; TypeScript still wants fallbacks).
    const bedrooms = Math.floor(ctx.params.bedrooms ?? 6);
    const bothSides = (ctx.params.layout ?? 'one-side') === 'both-sides';
    const bedW = Math.floor(ctx.params.bedroomWidth ?? 1);
    const bedD = Math.floor(ctx.params.bedroomDepth ?? 1);
    const bathW = Math.floor(ctx.params.ensuiteWidth ?? 1);
    const kitchenW = Math.floor(ctx.params.kitchenWidth ?? 1);
    const livingW = Math.floor(ctx.params.livingWidth ?? 2);
    const biggerBedrooms = ctx.params.biggerBedrooms ?? true;

    // Rows (y): south rooms below the Hallway (both sides), north rooms above it, the Laundry
    // below it (one side). One side: Laundry row 0, Hallway row 1. Both sides: Hallway row bedD.
    const hallY = bothSides ? bedD : 1;
    // Bedroom + Ensuite pairs along each side of the Hallway.
    const pairsPerSide = bothSides ? Math.ceil(bedrooms / 2) : bedrooms;
    const pairW = bedW + bathW;
    // With rooms on both sides, each Hallway piece ends in one "window" cell with no room
    // to its south, so the piece has an outside wall.
    const windowCell = bothSides ? 1 : 0;
    // A room is at most 32 cells long: the Hallway is split into pieces of `perPiece` pairs.
    const perPiece = Math.floor((MAX_LENGTH - windowCell) / pairW);
    const pieces = Math.ceil(pairsPerSide / perPiece);
    const pieceLength = perPiece * pairW + windowCell;
    // Columns (x): Dining kitchen, Living room, Hallway, Entrance.
    const livingX = startX + kitchenW;
    const hallX = livingX + livingW;
    const lastPairs = pairsPerSide - (pieces - 1) * perPiece;
    const lastHallX = hallX + (pieces - 1) * pieceLength + lastPairs * pairW + windowCell - 1;
    // The Living room and Dining kitchen are as deep as the Hallway and the Bedrooms together.
    const sharedY = bothSides ? 0 : hallY;
    const sharedDepth = bothSides ? 2 * bedD + 1 : bedD + 1;
    const operations: SpatialOperation[] = [];

    // The open-plan Dining kitchen and Living room, side by side at the start of the Hallway.
    operations.push({ op: 'add-node', ref: 'kitchen', position: [startX, sharedY, 0], size: [kitchenW, sharedDepth, 1], function: diningKitchen.id });
    operations.push({ op: 'add-node', ref: 'living', position: [livingX, sharedY, 0], size: [livingW, sharedDepth, 1], function: livingRoom.id });
    operations.push({ op: 'add-edge', source: 'living', target: 'kitchen', relationship: 'open' });

    // The Hallway pieces (one in most flats), each joined to the one before it.
    for (let p = 0; p < pieces; p++) {
      const pairsHere = p === pieces - 1 ? lastPairs : perPiece;
      const from = hallX + p * pieceLength;
      operations.push({ op: 'add-node', ref: `hallway-${p}`, position: [from, hallY, 0], size: [pairsHere * pairW + windowCell, 1, 1], function: hallway.id });
      if (p > 0) operations.push({ op: 'add-edge', source: `hallway-${p - 1}`, target: `hallway-${p}`, relationship: 'access' });
    }
    const lastHall = `hallway-${pieces - 1}`;
    operations.push({ op: 'add-edge', source: 'hallway-0', target: 'living', relationship: 'access' });

    // The Entrance at the far end of the Hallway.
    operations.push({ op: 'add-node', ref: 'entrance', position: [lastHallX + 1, hallY, 0], function: entrance.id });
    operations.push({ op: 'add-edge', source: 'entrance', target: lastHall, relationship: 'access' });

    // The Laundry beside the last Hallway cell: north (both sides) or south (one side).
    const laundryY = bothSides ? hallY + 1 : hallY - 1;
    operations.push({ op: 'add-node', ref: 'laundry', position: [lastHallX, laundryY, 0], function: laundry.id });
    operations.push({ op: 'add-edge', source: lastHall, target: 'laundry', relationship: 'access' });

    // Each Bedroom opens off the Hallway; its Ensuite is right beside it, also on the Hallway.
    for (let i = 0; i < bedrooms; i++) {
      // Which pair along the Hallway, and which side: north first, then south.
      const pair = bothSides ? Math.floor(i / 2) : i;
      const north = !(bothSides && i % 2 === 1);
      // The Hallway piece of this pair, and the pair's first cell along x.
      const piece = Math.floor(pair / perPiece);
      const x = hallX + piece * pieceLength + (pair - piece * perPiece) * pairW;
      // North rooms start just above the Hallway; south rooms end just below it.
      const bedY = north ? hallY + 1 : hallY - bedD;
      const bathY = north ? hallY + 1 : hallY - 1;
      const room = `bedroom-${i + 1}`;
      const bath = `ensuite-${i + 1}`;

      operations.push({ op: 'add-node', ref: room, position: [x, bedY, 0], size: [bedW, bedD, 1], function: bedroom.id });
      operations.push({ op: 'add-node', ref: bath, position: [x + bedW, bathY, 0], size: [bathW, 1, 1], function: ensuite.id });
      operations.push({ op: 'add-edge', source: `hallway-${piece}`, target: room, relationship: 'access' });

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
