type Room = { id: number; function: string };
type Connection = { id: number; source: number; target: number };

export function circulationRoutes(rooms: readonly Room[], connections: readonly Connection[]) {
  // Start at the first Reception by room number.
  const reception = rooms.filter((room) => room.function === 'reception')
    .sort((a, b) => a.id - b.id)[0];
  if (!reception) return undefined;

  // Look up each room's connections, starting with the lowest connection number.
  const connectionsByRoom = new Map<number, Connection[]>(rooms.map((room) => [room.id, []]));
  for (const connection of [...connections].sort((a, b) => a.id - b.id)) {
    connectionsByRoom.get(connection.source)?.push(connection);
    connectionsByRoom.get(connection.target)?.push(connection);
  }

  // Visit rooms in order of fewest connections from Reception.
  const reached = new Set([reception.id]);
  const routeEdges = new Set<number>();
  const queue = [reception.id];
  const hallways = new Set(rooms.filter((room) => room.function === 'hallway').map((room) => room.id));
  for (const room of queue) {
    for (const connection of connectionsByRoom.get(room) ?? []) {
      const nextRoom = connection.source === room ? connection.target : connection.source;
      if (reached.has(nextRoom)) continue;
      reached.add(nextRoom);
      routeEdges.add(connection.id);
      // Only a Hallway can carry the route onward to other rooms.
      if (hallways.has(nextRoom)) queue.push(nextRoom);
    }
  }

  // Report how much of the design can be reached.
  const destinations = reached.size - 1;
  const unreachable = rooms.length - reached.size;
  const summary = `From Reception ${reception.id}: ${destinations} reachable destinations, ${unreachable} unreachable.`;
  return { reached, routeEdges, summary };
}
