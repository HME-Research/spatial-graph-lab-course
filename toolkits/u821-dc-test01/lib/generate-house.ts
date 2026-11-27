import { type SpatialAlgorithm, type SpatialAlgorithmContext, type SpatialEdge, type SpatialNode, type SpatialOperation, type TransformationResult } from '@student-api';
import { connectionProblem, levels, pairKey, planHouseConnections } from './house-connections';
import {
  bathroomKeys, bedroomKeys, houseLinks, makeCandidate, seededRandom, supportedLayout, typologies, feasibleTypologies,
  type FeasibleTypology, type HouseRoom, type RoomKey, type Typology,
} from './family-house-layouts';
import { buildingArea, dimensions, plantSeparation, roomProgramme } from './house-rules';

// Leave the current design intact when its rooms or edges cannot be reused safely.
const noChange = (summary: string) => ({ kind: 'transformation' as const, summary, operations: [] });
const addedFunctions = new Set(['music-room', 'guest-bathroom', 'plant-room', 'swimming-pool', 'garage', 'upper-living-room']);


function existingRooms(ctx: SpatialAlgorithmContext, rooms: readonly HouseRoom[]) {
  const existing = new Map<RoomKey, SpatialNode>();
  const byFunction = (id: string) => ctx.design.nodes.filter((room) => room.function === id).sort((a, b) => a.id - b.id);

  // Reuse single rooms by Function and use ID order for bedrooms.
  for (const room of rooms) {
    if (room.function === 'bedroom' || room.function === 'bathroom') continue;
    const matches = byFunction(room.function);
    if (matches.length === 0 && ctx.design.nodes.length === 13 && addedFunctions.has(room.function)) continue;
    if (matches.length !== 1) return undefined;
    existing.set(room.key, matches[0]!);
  }
  const bedrooms = byFunction('bedroom');
  const bathrooms = byFunction('bathroom');
  if (bedrooms.length !== 3 || bathrooms.length !== 3) return undefined;
  const linkedBathrooms = new Map<number, SpatialNode>();
  const usedBathrooms = new Set<number>();

  // Keep each existing bedroom–bathroom pairing. A shared bathroom needs manual correction.
  for (const bedroom of bedrooms) {
    const linked = bathrooms.filter((bathroom) => ctx.design.edges.some((edge) =>
      pairKey(edge.source, edge.target) === pairKey(bedroom.id, bathroom.id)));
    if (linked.length > 1 || (linked[0] && usedBathrooms.has(linked[0].id))) return undefined;
    if (!linked[0]) continue;
    linkedBathrooms.set(bedroom.id, linked[0]);
    usedBathrooms.add(linked[0].id);
  }
  const unlinked = bathrooms.filter((bathroom) => !usedBathrooms.has(bathroom.id));
  for (const [index, bedroom] of bedrooms.entries()) {
    existing.set(bedroomKeys[index]!, bedroom);
    existing.set(bathroomKeys[index]!, linkedBathrooms.get(bedroom.id) ?? unlinked.shift()!);
  }
  return existing;
}

// Check whether the boxes share a face rather than just a corner or an edge.
function shareFace(a: SpatialNode, b: SpatialNode) {
  const overlaps = [0, 1, 2].map((axis) =>
    Math.min(a.position[axis]! + a.size[axis]!, b.position[axis]! + b.size[axis]!) -
    Math.max(a.position[axis]!, b.position[axis]!));
  return overlaps.filter((length) => length === 0).length === 1 && overlaps.every((length) => length >= 0);
}

function validateCandidate(ctx: SpatialAlgorithmContext, rooms: readonly HouseRoom[], reuse: ReadonlyMap<RoomKey, SpatialNode>) {
  // Check the same rules as Check Spatial Connectivity using an in-memory layout.
  if (!supportedLayout(rooms)) return 'overlap or insufficient floor support';
  if (roomProgramme(rooms).length) return 'room programme';
  if (dimensions(rooms).length) return 'area or room dimensions';
  let nextCandidateId = Math.max(0, ...ctx.design.nodes.map((room) => room.id)) + 1;
  const byKey = new Map(rooms.map((room) => [
    room.key, { ...room, id: reuse.get(room.key)?.id ?? nextCandidateId++, custom: {} },
  ]));
  const nodes = [...byKey.values()];
  const byId = new Map(nodes.map((room) => [room.id, room]));
  const edges: SpatialEdge[] = [...ctx.design.edges];
  const pairs = new Set(edges.map((edge) => pairKey(edge.source, edge.target)));
  for (const [from, to] of houseLinks) {
    const source = byKey.get(from)!.id;
    const target = byKey.get(to)!.id;
    if (!pairs.has(pairKey(source, target))) {
      edges.push({ id: -(edges.length + 1), source, target, relationship: 'access', custom: {} });
    }
  }

  const layout = {
    design: { ...ctx.design, nodes, edges },
    touches(a: number, b: number) { return shareFace(byId.get(a)!, byId.get(b)!); },
  };
  const plan = planHouseConnections(layout);
  if (plan.missingRoles.size || plan.unpaired.length || plan.required.length !== houseLinks.length) return 'missing required rooms or ensuite pairings';
  const required = new Set(plan.required.map(([a, b]) => pairKey(a.id, b.id)));
  // The mandatory links form a connected graph from the entrance.
  if (edges.some((edge) => connectionProblem(layout, edge, byId.get(edge.source)!, byId.get(edge.target)!, required))) {
    return 'direct adjacency or privacy';
  }
  if (plantSeparation(nodes, edges, layout.touches).length) return 'plant separation';
  return undefined;
}

export const generationParameters = {
    seed: {
      kind: 'number', min: 0, max: 4294967295, default: 1, label: 'Random seed',
      description: 'Change the whole-number seed for another layout. Reuse the seed and settings to reproduce it.',
    },
    typology: {
      kind: 'enum', values: [...typologies], default: 'Random', label: 'Building typology',
      description: 'Choose a footprint or let the seed pick one.',
    },
    spatialVariation: {
      kind: 'number', min: 0, max: 100, default: 70, label: 'Spatial variation',
      description: 'Higher values allow more orientations and greater changes to grid proportions.',
    },
    compactness: {
      kind: 'number', min: 0, max: 100, default: 60, label: 'Compactness',
      description: 'Higher values favour a tighter footprint within the selected typology.',
    },
    roomSizeVariation: {
      kind: 'number', min: 0, max: 100, default: 55, label: 'Room size variation',
      description: 'Higher values allow more changes to room widths and depths.',
    },
  targetArea: {
    kind: 'number', min: 200, max: 400, default: 340, label: 'Target building area (m²)',
    description: 'Candidates stay between 200 and 400 m². The target is a preference on the 3 m grid.',
  },
  aspectRatio: {
    kind: 'number', min: 1, max: 4, default: 1.5, label: 'Building aspect ratio',
    description: 'Preferred long side divided by short side, excluding the pool.',
  },
  maxAttempts: {
    kind: 'number', min: 1, max: 256, default: 80, label: 'Maximum generation attempts',
    description: 'More attempts can find more alternatives but take longer.',
  },
} as const satisfies NonNullable<SpatialAlgorithm['parameters']>;

// Compare keyed geometry independent of translation or a whole-plan transpose.
function signature(rooms: readonly HouseRoom[]) {
  function key(transpose: boolean) {
    const x = transpose ? 1 : 0;
    const y = transpose ? 0 : 1;
    const minX = Math.min(...rooms.map((room) => room.position[x]));
    const minY = Math.min(...rooms.map((room) => room.position[y]));
    return rooms.map((room) => [
      room.key, room.position[x] - minX, room.position[y] - minY, room.size[x], room.size[y],
    ].join(':')).sort().join('|');
  }
  return [key(false), key(true)].sort()[0]!;
}

export function generateHouse(ctx: SpatialAlgorithmContext<typeof generationParameters>, mode: 'generate' | 'next' | 'dimensions' | 'layout' = 'generate'): TransformationResult {
    const seed = (Math.trunc(ctx.params.seed ?? 1) + Number(mode === 'next')) >>> 0;
    const random = seededRandom(seed);
    const requested: Typology = ctx.params.typology ?? 'Random';
    const choices = feasibleTypologies;
    if (requested === 'U-shaped' || requested === 'Courtyard') {
      return noChange('No validated U-shaped or courtyard placement strategy exists for this programme. Choose Random or another typology.');
    }
    const firstChoice = Math.floor(random() * choices.length);
    const variation = ctx.params.spatialVariation ?? 70;
    const compactness = ctx.params.compactness ?? 60;
    const roomSize = ctx.params.roomSizeVariation ?? 55;
    const hasRooms = ctx.design.nodes.length > 0;
    if (!hasRooms && mode !== 'generate') return noChange('Generate and apply a family house first.');
    const target = ctx.params.targetArea ?? 340;
    const ratio = ctx.params.aspectRatio ?? 1.5;
    const attempts = Math.trunc(ctx.params.maxAttempts ?? 80);

    // The API can move compatible rooms but cannot replace their Functions or delete rooms or links.
    const reference = makeCandidate('Compact', 0, 100, 0, random);
    const reuse = hasRooms ? existingRooms(ctx, reference) : new Map<RoomKey, SpatialNode>();
    if (!reuse || (hasRooms && ctx.design.nodes.length !== reuse.size)) {
      return noChange('Use an empty design, an original 13-room toolkit house, or a complete 19-room toolkit house with separate ensuite pairings. The transform cannot delete or change room Functions.');
    }
    if ([...reuse.values()].some((room) => room.position[2] !== levels[room.function as keyof typeof levels])) {
      return noChange('Put each existing room on its required floor before regenerating the house.');
    }
    if (ctx.design.edges.some((edge) => !ctx.touches(edge.source, edge.target))) {
      return noChange('Regeneration needs direct existing connections. Correct or remove connections without a shared face first, since existing corridor cells cannot be moved by this transform.');
    }

    // Score unique candidates. Keep the current layout out of the next-variation search.
    const rejected = new Map<string, number>();
    const seen = new Set<string>();
    const current = [...reuse.entries()].map(([key, room]) => ({ ...room, key, function: room.function as HouseRoom['function'] }));
    const currentKey = current.length ? signature(current) : '';
    const valid: { rooms: HouseRoom[]; typology: FeasibleTypology; score: number; area: number; key: string }[] = [];
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const typology = requested === 'Random' ? choices[(firstChoice + attempt) % choices.length]! : requested;
      const rooms = makeCandidate(typology, variation, compactness, roomSize, random);
      const preference = random();
      const key = signature(rooms);
      if (seen.has(key)) continue;
      seen.add(key);
      const failure = validateCandidate(ctx, rooms, reuse);
      if (failure) {
        rejected.set(failure, (rejected.get(failure) ?? 0) + 1);
        continue;
      }
      const area = buildingArea(rooms);
      const ground = rooms.filter((room) => room.position[2] === 0 && room.function !== 'swimming-pool');
      const width = Math.max(...ground.map((room) => room.position[0] + room.size[0])) - Math.min(...ground.map((room) => room.position[0]));
      const depth = Math.max(...ground.map((room) => room.position[1] + room.size[1])) - Math.min(...ground.map((room) => room.position[1]));
      const compact = buildingArea(ground) / (9 * width * depth);
      const proportions = rooms.filter((room) => room.function !== 'swimming-pool')
        .reduce((sum, room) => sum + Math.max(room.size[0], room.size[1]) / Math.min(room.size[0], room.size[1]) - 1, 0);
      const aspect = Math.max(width, depth) / Math.min(width, depth);
      const score = Math.abs(area - target) / (mode === 'dimensions' ? 4 : 12) + Math.abs(aspect - ratio) * 2 +
        (1 - compact) * (compactness / 15 + (mode === 'layout' ? 8 : 0)) + proportions / 12 +
        (attempt % choices.length === 0 || requested !== 'Random' ? 0 : 1) + preference * (1 + variation / 8);
      valid.push({ rooms, typology, score, area, key });
    }
    valid.sort((a, b) => a.score - b.score);
    const previous = valid.findIndex((candidate) => candidate.key === currentKey);
    const best = mode === 'next' ? valid[(previous + 1) % valid.length] : valid[0];
    if (!best || (mode === 'next' && best.key === currentKey)) {
      const reasons = [...rejected.entries()].map(([reason, count]) => `${reason} (${count})`).join(', ');
      return noChange(`No valid alternative in ${attempts} attempts. Rejections: ${reasons || 'repeated or unchanged geometry'}. Try another seed, building configuration or more attempts.`);
    }

    const operations: SpatialOperation[] = [];
    const geometryChanged = best.rooms.some((room) => {
      const existing = reuse.get(room.key);
      return existing && ([...room.position, ...room.size].join() !== [...existing.position, ...existing.size].join());
    });

    // Move rooms through free cells below the ground floor so swaps can apply atomically.
    if (geometryChanged) {
      for (const [index, room] of [...reuse.values()].entries()) {
        operations.push({ op: 'set-node-geometry', nodeId: room.id, position: [index, 0, -1], size: [1, 1, 1] });
      }
    }

    // Keep existing room IDs and attributes, or create the editable rooms on the first run.
    for (const room of best.rooms) {
      const existing = reuse.get(room.key);
      if (!existing) {
        operations.push({ op: 'add-node', ref: room.key, function: room.function, position: room.position, size: room.size });
      } else if (geometryChanged) {
        operations.push({ op: 'set-node-geometry', nodeId: existing.id, position: room.position, size: room.size });
      }
    }

    // Keep existing links and add any mandatory Access links that are missing.
    for (const [from, to] of houseLinks) {
      const source = reuse.get(from)?.id ?? from;
      const target = reuse.get(to)?.id ?? to;
      if (typeof source === 'number' && typeof target === 'number' && !ctx.canRelate(source, target)) continue;
      operations.push({ op: 'add-edge', source, target, relationship: 'access' });
    }
    return {
      kind: 'transformation',
      summary: operations.length ? `${best.typology} family house, seed ${seed}. Preview of 19 rooms, ${best.area} m² enclosed, pool excluded.` :
        `This house already matches the ${best.typology} layout for seed ${seed}. Change the seed or settings for another layout.`,
      operations,
    };
}
