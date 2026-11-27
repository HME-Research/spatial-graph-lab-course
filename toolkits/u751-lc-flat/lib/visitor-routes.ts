import type { AnalysisResult, DesignAnalysisContext, SpatialNode } from '@student-api';

/** Shared search for the two visitor-route analyses; it reads the graph without changing it. */
export function visitorRoutes(
  ctx: DesignAnalysisContext,
  destinations: readonly SpatialNode[],
  label: string,
): AnalysisResult {
  // Tell the student which required rooms are missing, including on an empty design.
  const entrances = ctx.design.nodes.filter((node) => node.function === 'entrance').sort((a, b) => a.id - b.id);
  const missing: string[] = [];
  if (entrances.length === 0) missing.push('No Entrance found');
  if (destinations.length === 0) missing.push('No ' + label + ' found');
  if (missing.length > 0) return { kind: 'analysis', text: missing.join('; ') + '. Add or designate the missing rooms.' };

  // Remove all Bedrooms and their connections; Access and Open connections are both two-way.
  const allowed = new Set(ctx.design.nodes.filter((node) => node.function !== 'bedroom').map((node) => node.id));
  const around = new Map<number, { node: number; edge: number }[]>();
  for (const id of allowed) around.set(id, []);
  for (const edge of [...ctx.design.edges].sort((a, b) => a.id - b.id)) {
    if (!allowed.has(edge.source) || !allowed.has(edge.target)) continue;
    around.get(edge.source)!.push({ node: edge.target, edge: edge.id });
    around.get(edge.target)!.push({ node: edge.source, edge: edge.id });
  }

  // Start at every Entrance; the first visit to a room uses the fewest connections.
  const previous = new Map<number, { node: number; edge: number } | null>();
  const queue = entrances.map((node) => node.id);
  for (const id of queue) previous.set(id, null);
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    for (const next of around.get(current) ?? []) {
      if (previous.has(next.node)) continue;
      previous.set(next.node, { node: current, edge: next.edge });
      queue.push(next.node);
    }
  }

  // Report every destination, so a reachable room cannot hide an unreachable one.
  const reports: string[] = [];
  const highlightNodes = new Set<number>();
  const highlightEdges = new Set<number>();
  let unreachable = 0;
  for (const destination of [...destinations].sort((a, b) => a.id - b.id)) {
    if (!previous.has(destination.id)) {
      unreachable++;
      reports.push(label + ' ' + destination.id + ': no valid path without passing through a Bedroom');
      continue;
    }

    // Follow the search backwards to its Entrance, then highlight the route in forward order.
    const nodes = [destination.id];
    const edges: number[] = [];
    let step = previous.get(destination.id);
    while (step != null) {
      edges.push(step.edge);
      nodes.push(step.node);
      step = previous.get(step.node);
    }
    nodes.reverse();
    edges.reverse();
    for (const id of nodes) highlightNodes.add(id);
    for (const id of edges) highlightEdges.add(id);
    reports.push(label + ' ' + destination.id + ': ' + nodes.join(' -> ') + ' (' + edges.length + ' connections)');
  }

  // The number counts unreachable destinations; both successful routes and failures are explained.
  return {
    kind: 'analysis',
    value: unreachable,
    text: reports.join('; '),
    highlightNodes: [...highlightNodes],
    highlightEdges: [...highlightEdges],
  };
}
