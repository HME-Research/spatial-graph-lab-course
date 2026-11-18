import { defineGraphAlgorithm, neighbours } from '@student-api';

/**
 * Generic graph analysis: how many relationship steps each room is from a start room
 * (breadth-first search). Uses only node ids and edges, so it works on any graph.
 * Rooms that cannot be reached get no number (null).
 */
export default defineGraphAlgorithm({
  id: 'access-depth',
  label: 'Access depth from a room',
  parameters: { start: { kind: 'text', default: 'entry-gallery' } },
  run({ graph, params }) {
    const start = params.start ?? '';
    const depth = new Map<string, number>();
    if (graph.nodes.some((n) => n.id === start)) {
      depth.set(start, 0);
      const queue = [start];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of neighbours(graph, current)) {
          if (!depth.has(next)) {
            depth.set(next, depth.get(current)! + 1);
            queue.push(next);
          }
        }
      }
    }
    const nodeValues: Record<string, number | null> = {};
    for (const n of graph.nodes) nodeValues[n.id] = depth.get(n.id) ?? null;
    const unreachable = graph.nodes.length - depth.size;
    return {
      kind: 'analysis',
      summary: depth.size === 0 ? `Start room "${start}" does not exist.` : `${unreachable} room(s) cannot be reached from "${start}".`,
      nodeValues,
    };
  },
});
