import type { SpatialEdge } from '@student-api';
import { levels } from './house-connections';

type Room = { id?: number; function: string; position: readonly number[]; size: readonly number[] };
export type Finding = { message: string; ids: number[] };
const ids = (rooms: readonly Room[]) => rooms.flatMap((room) => room.id === undefined ? [] : [room.id]);

export const roomCounts = Object.fromEntries(Object.keys(levels).map((id) => [
  id, id === 'bedroom' || id === 'bathroom' ? 3 : 1,
]));

export function roomProgramme(rooms: readonly Room[]) {
  const findings: Finding[] = [];
  for (const [id, count] of Object.entries(roomCounts)) {
    const matches = rooms.filter((room) => room.function === id);
    if (matches.length !== count) findings.push({ message: `${id}: ${matches.length}/${count}`, ids: ids(matches) });
    const wrongFloor = matches.filter((room) => room.position[2] !== levels[id as keyof typeof levels]);
    if (wrongFloor.length) findings.push({ message: `${id} on wrong floor`, ids: ids(wrongFloor) });
  }
  const extra = rooms.filter((room) => !Object.hasOwn(roomCounts, room.function));
  if (extra.length) findings.push({ message: 'Additional room types', ids: ids(extra) });
  return findings;
}

export const drawnArea = (room: Room) => room.size[0]! * room.size[1]! * 9;
export const buildingArea = (rooms: readonly Room[], area = drawnArea) =>
  rooms.filter((room) => room.function !== 'swimming-pool').reduce((sum, room) => sum + area(room), 0);

// Check nominal grid dimensions, separately from editable descriptive attributes.
export function dimensions(rooms: readonly Room[], area = drawnArea) {
  const findings: Finding[] = [];
  const enclosed = rooms.filter((room) => room.function !== 'swimming-pool');
  const total = buildingArea(rooms, area);
  if (total < 200 || total > 400) findings.push({ message: `Building area ${total} m² is outside 200–400 m²`, ids: [] });
  for (const room of rooms) {
    const [width, length, height] = room.size;
    const square = ['plant-room', 'main-entrance', 'guest-bathroom'].includes(room.function);
    if (square && (width !== 1 || length !== 1)) {
      findings.push({ message: `${room.function} must fit 3 × 3 m`, ids: ids([room]) });
    }
    if (room.function === 'swimming-pool' && !(Math.min(width!, length!) === 1 && Math.max(width!, length!) === 5)) {
      findings.push({ message: 'Pool needs 3 × 15 m', ids: ids([room]) });
    }
    if (height !== 1) findings.push({ message: `${room.function} must occupy one storey`, ids: ids([room]) });
  }
  const bedrooms = enclosed.filter((room) => room.function === 'bedroom');
  const sameSize = bedrooms.filter((a) => bedrooms.some((b) => a !== b && area(a) === area(b)));
  if (sameSize.length) findings.push({ message: 'Bedrooms need distinct areas', ids: ids(sameSize) });
  const reception = enclosed.find((room) => room.function === 'guest-reception-room');
  if (reception) {
    const rivals = enclosed.filter((room) => room !== reception && area(room) >= area(reception));
    if (rivals.length) findings.push({ message: 'Reception must be strictly largest', ids: ids([reception, ...rivals]) });
  }
  return findings;
}

// Count the shortest walk through any stored relationship, including unsafe shortcuts.
export function walkDistances(start: number, edges: readonly SpatialEdge[]) {
  const neighbours = new Map<number, number[]>();
  for (const edge of edges) {
    const from = neighbours.get(edge.source) ?? [];
    const to = neighbours.get(edge.target) ?? [];
    from.push(edge.target);
    to.push(edge.source);
    neighbours.set(edge.source, from);
    neighbours.set(edge.target, to);
  }
  const distance = new Map([[start, 0]]);
  const queue = [start];
  for (const id of queue) {
    for (const next of neighbours.get(id) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, distance.get(id)! + 1);
      queue.push(next);
    }
  }
  return distance;
}

export function plantSeparation(rooms: readonly Room[], edges: readonly SpatialEdge[], touches: (a: number, b: number) => boolean) {
  const living = rooms.find((room) => room.function === 'living-room')?.id;
  const plant = rooms.find((room) => room.function === 'plant-room')?.id;
  if (living === undefined || plant === undefined) return [];
  const distance = walkDistances(living, edges).get(plant);
  const findings: Finding[] = [];
  if (touches(living, plant)) findings.push({ message: 'Plant shares a wall with living room', ids: [living, plant] });
  if (distance === undefined || distance < 3) {
    findings.push({ message: distance === undefined ? 'Plant has no service path' : `Plant path needs two intermediate rooms (currently ${distance - 1})`, ids: [living, plant] });
  }
  return findings;
}

export function reportFindings(findings: readonly Finding[], success: string, prefix = '') {
  const nodeValues: Record<number, string> = {};
  for (const { message, ids } of findings) {
    for (const id of ids) nodeValues[id] = [nodeValues[id], message].filter(Boolean).join('. ');
  }
  const summary = prefix + (findings.map(({ message, ids }) =>
    message + (ids.length ? ` (#${ids.join(', #')})` : '')).join('. ') || success);
  return {
    kind: 'analysis' as const,
    value: findings.length,
    text: summary.length > 300 ? `${summary.slice(0, 265)}… See room analysis values.` : summary,
    highlightNodes: Object.keys(nodeValues).map(Number),
    nodeValues,
  };
}
