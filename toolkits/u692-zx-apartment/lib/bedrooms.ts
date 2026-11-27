import type { SpatialEdge, SpatialNode } from '@student-api';
import entrance from '../functions/entrance';
import kitchen from '../functions/kitchen';
import livingRoom from '../functions/living-room';

/**
 * Helpers shared by "Quiet bedrooms" (analysis) and "Doors to the entrance" (transform), so both
 * use exactly the same rule for an inner room.
 */

/** Whether a room is a noisy room: a Living room or a Kitchen. */
export function isNoisy(room: SpatialNode): boolean {
  return room.function === livingRoom.id || room.function === kitchen.id;
}

/** A room's name for the text, e.g. "Kitchen 3". */
export function roomName(room: SpatialNode): string {
  const names: Record<string, string> = {
    [livingRoom.id]: 'Living room',
    [kitchen.id]: 'Kitchen',
    [entrance.id]: 'Entrance',
  };
  return `${names[room.function] ?? room.function} ${room.id}`;
}

/** Whether two rooms are on the same storey (their heights overlap), so a shared face is a wall. */
export function sameStorey(a: SpatialNode, b: SpatialNode): boolean {
  const aTop = a.position[2] + a.size[2];
  const bTop = b.position[2] + b.size[2];
  return a.position[2] < bTop && b.position[2] < aTop;
}

/** The relationship (door or opening) between two rooms, if there is one. */
export function edgeBetween(edges: readonly SpatialEdge[], a: number, b: number): SpatialEdge | undefined {
  return edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
}

/** The rooms joined to a room by a relationship (Access or Open), in design order. */
export function joinedRooms(nodes: readonly SpatialNode[], edges: readonly SpatialEdge[], room: SpatialNode): SpatialNode[] {
  return nodes.filter((other) => other.id !== room.id && edgeBetween(edges, room.id, other.id) !== undefined);
}

/**
 * Inner room: a Bedroom with NO relationship to an Entrance that is joined to a Living room or
 * Kitchen, so you reach it by walking through that room. Returns those Living rooms / Kitchens
 * (the cause), or an empty list when the Bedroom is not an inner room.
 */
export function innerRoomCauses(nodes: readonly SpatialNode[], edges: readonly SpatialEdge[], bedroom: SpatialNode): SpatialNode[] {
  const joined = joinedRooms(nodes, edges, bedroom);
  // Joined directly to an Entrance: not an inner room.
  if (joined.some((room) => room.function === entrance.id)) return [];
  // Otherwise the noisy rooms it is joined to are the cause (none = not an inner room).
  return joined.filter(isNoisy);
}
