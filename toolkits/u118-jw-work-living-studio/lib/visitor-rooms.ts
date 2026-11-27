import type { DesignAnalysisContext } from '@student-api';

type Design = DesignAnalysisContext['design'];
type Metrics = DesignAnalysisContext['metrics'];

export function visitorRooms(design: Design, metrics: Metrics, hasWindow: (id: number) => boolean) {
  // Start at every entrance and keep bedrooms out of the route.
  const bedrooms = new Set(design.nodes.filter(room => room.function === 'bedroom').map(room => room.id));
  const queue = design.nodes.filter(room => room.function === 'entrance').map(room => room.id);
  const reached = new Set(queue);

  // List the built connections in both directions.
  const neighbours = new Map(design.nodes.map(room => [room.id, [] as number[]]));
  for (const edge of design.edges) {
    const status = metrics.value('resolution-status', edge.id);
    if (status === 'direct' || status === 'routed') {
      neighbours.get(edge.source)?.push(edge.target);
      neighbours.get(edge.target)?.push(edge.source);
    }
  }

  // Visit each reachable room once, even when paths form a loop.
  for (const id of queue) {
    for (const next of neighbours.get(id) ?? []) {
      if (bedrooms.has(next) || reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  // A window needs both a window setting and an exterior wall.
  return design.nodes.filter(room =>
    reached.has(room.id) && hasWindow(room.id) && metrics.value('has-exterior-facade', room.id) === true,
  );
}
