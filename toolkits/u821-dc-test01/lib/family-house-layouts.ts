import { roomCells, type GridCoord, type RoomSize } from '@student-api';
import { levels, publicLinks } from './house-connections';

export const typologies = ['Random', 'Compact', 'Linear', 'L-shaped', 'U-shaped', 'Courtyard', 'Staggered', 'Clustered'] as const;
export type Typology = typeof typologies[number];

const roomTypes = {
  E: 'main-entrance', R: 'guest-reception-room', L: 'living-room', S: 'staircase',
  D: 'dining-room', K: 'kitchen', H: 'hallway', M: 'music-room', G: 'garage',
  T: 'plant-room', W: 'swimming-pool', V: 'guest-bathroom', U: 'upper-living-room',
  '1': 'bedroom', '2': 'bedroom', '3': 'bedroom', a: 'bathroom', b: 'bathroom', c: 'bathroom',
} as const satisfies Record<string, keyof typeof levels>;

export type RoomKey = keyof typeof roomTypes;
export type HouseRoom = { key: RoomKey; function: keyof typeof levels; position: GridCoord; size: RoomSize };
export const bedroomKeys = ['1', '2', '3'] as const;
export const bathroomKeys = ['a', 'b', 'c'] as const;

const keyFor = (id: keyof typeof levels) => (Object.keys(roomTypes) as RoomKey[]).find((key) => roomTypes[key] === id)!;
export const houseLinks: readonly (readonly [RoomKey, RoomKey])[] = [
  ...publicLinks.map(([a, b]) => [keyFor(a), keyFor(b)] as const),
  ...bedroomKeys.flatMap((bedroom, i) => [['H', bedroom] as const, [bedroom, bathroomKeys[i]!] as const]),
];

// Use an integer seed to produce a repeatable sequence of choices.
export function seededRandom(seed: number) {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
    return ((mixed ^ (mixed >>> 15)) >>> 0) / 4294967296;
  };
}

export const feasibleTypologies = ['Compact', 'Linear', 'L-shaped', 'Staggered', 'Clustered'] as const;
export type FeasibleTypology = typeof feasibleTypologies[number];

export function makeCandidate(typology: FeasibleTypology, variation: number, compactness: number, roomSize: number, random: () => number) {
  const rooms: HouseRoom[] = [];
  function room(key: RoomKey, x: number, y: number, width = 1, length = 1) {
    const id = roomTypes[key];
    rooms.push({ key, function: id, position: [x, y, levels[id]], size: [width, length, 1] });
  }

  // Grow the public rooms around the entrance and their shared dining connection.
  const chance = (percent: number) => random() * 100 < percent;
  const grow = () => chance(roomSize * (1 - compactness / 150));
  const deep = typology === 'Linear' || (typology !== 'Compact' && grow());
  const livingDepth = deep ? 2 : 1;
  const narrowReception = typology === 'Linear' || (typology === 'L-shaped' && chance(variation));
  const receptionWidth = narrowReception ? 2 : grow() ? 4 : 3;
  const receptionDepth = narrowReception || (typology === 'Clustered' && grow()) ? 3 : 2;
  const diningDepth = (typology === 'L-shaped' || typology === 'Linear' || grow()) ? 2 : 1;
  room('E', 0, 0);
  room('L', 1, 0, 2, livingDepth);
  room('R', 1 - receptionWidth, 1, receptionWidth, receptionDepth);
  room('D', 1, livingDepth, 2, diningDepth);

  // Put the garage and plant on the service branch, away from the living room.
  const northGarage = typology === 'Clustered' || (typology !== 'Linear' && chance(variation / 2));
  const longGarage = grow();
  room('G', northGarage ? 0 : longGarage ? -2 : -1, northGarage ? longGarage ? -2 : -1 : 0,
    northGarage || !longGarage ? 1 : 2, northGarage && longGarage ? 2 : 1);
  room('T', northGarage ? -1 : longGarage ? -3 : -2, northGarage ? -1 : 0);
  const musicX = chance(variation / 2) ? 1 : 2;
  room('M', musicX, -1);
  room('V', 3 - musicX, -1);
  const poolToWest = (!northGarage || !longGarage) && (typology === 'Staggered' || chance(variation / 2));
  room('W', poolToWest ? musicX - 4 : musicX, -2, 5, 1);

  // Stack the landing over the stair. Put the north ensuite over a stair cell or garage.
  room('S', 3, northGarage ? 0 : -1, 1, northGarage ? 1 : 2);
  const kitchenLength = grow() ? 2 : 1;
  room('K', 3, livingDepth, 1, kitchenLength);
  room('H', -1, 0, 5, 1);
  room('1', 1, -1, 2);
  room('a', northGarage ? 0 : 3, -1);
  room('2', 0, 1, 1, 3);
  room('b', -1, 2);
  const smallSuite = livingDepth === 1 && (typology === 'Compact' || chance(100 - roomSize));
  room('3', smallSuite ? 2 : 1, 1, smallSuite ? 1 : 2, smallSuite ? 1 : 2);
  room('c', 3, livingDepth);
  const wideUpperLiving = receptionWidth >= 3 && grow();
  room('U', wideUpperLiving ? -2 : -1, 1, wideUpperLiving ? 2 : 1, 1);

  // Sometimes reverse the building axes. Room sizes and service attachments also vary locally.
  if (chance(variation / 2)) {
    for (const box of rooms) {
      const [x, y, z] = box.position;
      const [width, length, height] = box.size;
      box.position = [y, x, z];
      box.size = [length, width, height];
    }
  }
  return rooms;
}

// Require separate boxes, an outdoor pool outside the footprint and support beneath upper rooms.
export function supportedLayout(rooms: readonly HouseRoom[]) {
  if (rooms.length !== Object.keys(roomTypes).length) return false;
  const occupied = new Set<string>();
  const enclosedGround = new Set<string>();
  for (const room of [...rooms].sort((a, b) => a.position[2] - b.position[2])) {
    const cells = roomCells(room);
    if (cells.some((cell) => occupied.has(cell.join(',')))) return false;
    if (room.position[2] === 1) {
      const supported = cells.filter(([x, y]) => enclosedGround.has(`${x},${y}`));
      if (supported.length * 2 < cells.length) return false;
      if (cells.some(([x, y]) => occupied.has(`${x},${y},0`) && !enclosedGround.has(`${x},${y}`))) return false;
    } else if (room.function !== 'swimming-pool') {
      for (const [x, y] of cells) enclosedGround.add(`${x},${y}`);
    }
    for (const cell of cells) occupied.add(cell.join(','));
  }
  return true;
}
