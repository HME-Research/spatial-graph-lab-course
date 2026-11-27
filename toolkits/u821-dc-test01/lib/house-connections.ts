import type { DesignAnalysisContext, SpatialEdge, SpatialNode } from '@student-api';

export const levels = {
  'main-entrance': 0,
  'guest-reception-room': 0,
  'living-room': 0,
  staircase: 0,
  'dining-room': 0,
  kitchen: 0,
  'music-room': 0,
  'guest-bathroom': 0,
  'plant-room': 0,
  'swimming-pool': 0,
  garage: 0,
  'upper-living-room': 1,
  hallway: 1,
  bedroom: 1,
  bathroom: 1,
} as const;

export const publicLinks = [
  ['main-entrance', 'guest-reception-room'],
  ['main-entrance', 'living-room'],
  ['main-entrance', 'garage'],
  ['garage', 'plant-room'],
  ['living-room', 'dining-room'],
  ['living-room', 'guest-bathroom'],
  ['living-room', 'music-room'],
  ['music-room', 'swimming-pool'],
  ['living-room', 'staircase'],
  ['dining-room', 'kitchen'],
  ['dining-room', 'guest-reception-room'],
  ['staircase', 'hallway'],
  ['hallway', 'upper-living-room'],
] as const;

type Layout = Pick<DesignAnalysisContext, 'design' | 'touches'>;
type RoomPair = readonly [SpatialNode, SpatialNode];

export const pairKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;

// Find the required links and assign separate bathrooms that share a bedroom wall.
export function planHouseConnections(ctx: Layout) {
  const { nodes, edges } = ctx.design;
  const roomsOnLevel = (id: keyof typeof levels) => nodes
    .filter((room) => room.function === id && room.position[2] === levels[id])
    .sort((a, b) => a.id - b.id);
  const byPair = new Map(edges.map((edge) => [pairKey(edge.source, edge.target), edge]));
  const required: RoomPair[] = [];
  const missingRoles = new Set<string>();

  // Find the named public and circulation rooms on their intended floors.
  for (const [from, to] of publicLinks) {
    const a = roomsOnLevel(from)[0];
    const b = roomsOnLevel(to)[0];
    if (!a) missingRoles.add(from);
    if (!b) missingRoles.add(to);
    if (a && b) required.push([a, b]);
  }

  // Every upper bedroom needs a direct connection to the upper hallway.
  const bedrooms = roomsOnLevel('bedroom');
  const bathrooms = roomsOnLevel('bathroom');
  if (bedrooms.length < 3) missingRoles.add(`bedroom (${bedrooms.length} of 3)`);
  if (bathrooms.length < 3) missingRoles.add(`bathroom (${bathrooms.length} of 3)`);
  const hallway = roomsOnLevel('hallway')[0];
  if (hallway) {
    for (const bedroom of bedrooms) required.push([hallway, bedroom]);
  }

  // Prefer existing Access links and try another pairing if two bedrooms need the same bathroom.
  const candidates = new Map(bedrooms.map((bedroom) => [
    bedroom.id,
    bathrooms.filter((bathroom) => ctx.touches(bedroom.id, bathroom.id)).sort((a, b) => {
      const linked = (bathroom: SpatialNode) =>
        Number(byPair.get(pairKey(bedroom.id, bathroom.id))?.relationship === 'access');
      return linked(b) - linked(a) || a.id - b.id;
    }),
  ]));
  const bedroomByBathroom = new Map<number, SpatialNode>();
  function assignBathroom(bedroom: SpatialNode, visited: Set<number>): boolean {
    for (const bathroom of candidates.get(bedroom.id) ?? []) {
      if (visited.has(bathroom.id)) continue;
      visited.add(bathroom.id);
      const previousBedroom = bedroomByBathroom.get(bathroom.id);
      if (previousBedroom && !assignBathroom(previousBedroom, visited)) continue;
      bedroomByBathroom.set(bathroom.id, bedroom);
      return true;
    }
    return false;
  }

  for (const bedroom of bedrooms) assignBathroom(bedroom, new Set());
  const pairedBedrooms = new Set<number>();
  for (const bathroom of bathrooms) {
    const bedroom = bedroomByBathroom.get(bathroom.id);
    if (!bedroom) continue;
    pairedBedrooms.add(bedroom.id);
    required.push([bedroom, bathroom]);
  }

  return {
    entrance: roomsOnLevel('main-entrance')[0],
    required,
    byPair,
    missingRoles,
    unpaired: [
      ...bedrooms.filter((room) => !pairedBedrooms.has(room.id)),
      ...bathrooms.filter((room) => !bedroomByBathroom.has(room.id)),
    ],
  };
}

export function isPrivate(room: SpatialNode) {
  return room.function === 'bedroom' || room.function === 'bathroom';
}

// A direct link needs a shared face. Only a staircase and upper hallway may change levels.
export function hasDirectContact(ctx: Layout, a: SpatialNode, b: SpatialNode) {
  if (!ctx.touches(a.id, b.id)) return false;
  if (a.position[2] === b.position[2]) return true;
  const [lower, upper] = a.position[2] < b.position[2] ? [a, b] : [b, a];
  return lower.function === 'staircase' && lower.position[2] === 0 &&
    upper.function === 'hallway' && upper.position[2] === 1 && lower.size[2] === 1;
}

// A bedroom can only connect to the hallway and its own bathroom. A bathroom has one way in.
export function connectionProblem(ctx: Layout, edge: SpatialEdge, a: SpatialNode, b: SpatialNode, required: ReadonlySet<string>) {
  if ([a.function, b.function].includes('guest-bathroom') && !required.has(pairKey(a.id, b.id))) return 'Guest bathroom used for circulation';
  const privateLink = isPrivate(a) || isPrivate(b);
  if (privateLink && !required.has(pairKey(a.id, b.id))) return 'Privacy violation';
  if (!hasDirectContact(ctx, a, b)) return 'Invalid contact or floor connection';
  if ((privateLink || a.position[2] !== b.position[2]) && edge.relationship !== 'access') {
    return privateLink ? 'Privacy violation: use Access' : 'Vertical link needs Access';
  }
  return undefined;
}
