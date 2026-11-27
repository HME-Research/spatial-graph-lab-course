import { defineDesignAnalysis } from '@student-api';

export default defineDesignAnalysis({
  id: 'privacy-gradient',
  label: 'Privacy Gradient',
  description: 'Colour rooms by their shortest distance in resolved connections from a public entrance.',
  inputs: [],
  uses: { functions: ['entrance'], nodeFields: ['accessLevel', 'entranceType'] },
  run(ctx) {
    // Start every public entrance at depth zero, using its entrance type when set.
    const queue = ctx.design.nodes
      .filter((room) => room.function === 'entrance'
        && (room.custom.entranceType ?? room.custom.accessLevel) === 'public')
      .map((room) => room.id);
    const depths = new Map(queue.map((id) => [id, 0]));
    const entranceCount = queue.length;

    // Both access and open connections are two-way when the app can resolve them.
    const connections = new Map(ctx.design.nodes.map((room) => [room.id, [] as number[]]));
    for (const edge of ctx.design.edges) {
      const status = ctx.metrics.value('resolution-status', edge.id);
      if (status !== 'direct' && status !== 'routed') continue;
      connections.get(edge.source)?.push(edge.target);
      connections.get(edge.target)?.push(edge.source);
    }

    // Visit rooms in order of increasing depth, so the first route to each is shortest.
    for (const id of queue) {
      const depth = depths.get(id);
      if (depth === undefined) continue;
      for (const next of connections.get(id) ?? []) {
        if (depths.has(next)) continue;
        depths.set(next, depth + 1);
        queue.push(next);
      }
    }

    // Numeric values produce a gradient; unreachable rooms get a separate highlight.
    const nodeValues: Record<number, number | null> = {};
    const highlightNodes: number[] = [];
    for (const room of ctx.design.nodes) {
      const depth = depths.get(room.id);
      nodeValues[room.id] = depth ?? null;
      if (depth === undefined) highlightNodes.push(room.id);
    }

    return {
      kind: 'analysis',
      text: entranceCount === 0
        ? 'Add a public Entrance to measure depth. All rooms are currently unreachable.'
        : `Depth counts connections from the nearest public entrance. ${highlightNodes.length} unreachable.`,
      nodeValues,
      highlightNodes,
    };
  },
});
