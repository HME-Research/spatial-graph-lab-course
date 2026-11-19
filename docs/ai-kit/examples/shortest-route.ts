// A Query for Spatial Graph Lab: the fewest steps from one room to another.
// Two node inputs → it appears in Analyse › Queries; the student picks From, then To.

import { defineGraphAlgorithm, edgesBetween, neighbours } from '@student-api';

export default defineGraphAlgorithm({
  id: 'shortest-route',
  label: 'Shortest route',
  description: 'The fewest relationships you pass through to get from one room to another, and the route itself.',

  // What the student picks, in order.
  inputs: [
    { kind: 'node', label: 'From' },
    { kind: 'node', label: 'To' },
  ],

  run({ graph, inputs }) {
    const from = inputs[0]!;
    const to = inputs[1]!;

    // Same room twice: zero steps.
    if (from === to) return { kind: 'analysis', value: 0, text: 'From and To are the same room.', highlightNodes: [from] };

    // Breadth-first search: look at the rooms 1 step away, then 2 steps, … and remember where we came from.
    const cameFrom = new Map<number, number>();
    cameFrom.set(from, from);
    let frontier = [from];
    while (frontier.length > 0 && !cameFrom.has(to)) {
      const next: number[] = [];
      for (const room of frontier) {
        // Neighbours = rooms joined to this one by a relationship.
        for (const other of neighbours(graph, room)) {
          if (!cameFrom.has(other)) {
            cameFrom.set(other, room);
            next.push(other);
          }
        }
      }
      frontier = next;
    }

    // Never reached: the two rooms are in separate parts of the graph.
    if (!cameFrom.has(to)) return { kind: 'analysis', text: `No route from ${from} to ${to}: they are not connected.`, highlightNodes: [from, to] };

    // Walk back from To to From to list the route.
    const route = [to];
    while (route[0] !== from) route.unshift(cameFrom.get(route[0]!)!);

    // The edges along the route, for highlighting.
    const routeEdges: number[] = [];
    for (let i = 0; i + 1 < route.length; i++) routeEdges.push(edgesBetween(graph, route[i]!, route[i + 1]!)[0]!.id);

    const steps = route.length - 1;
    return {
      kind: 'analysis',
      value: steps,
      text: `${steps} step${steps === 1 ? '' : 's'}: ${route.join(' → ')}`,
      highlightNodes: route,
      highlightEdges: routeEdges,
    };
  },
});
