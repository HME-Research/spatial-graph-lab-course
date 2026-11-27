import { defineDesignAnalysis } from '@student-api';

export default defineDesignAnalysis({
  id: 'privacy-and-access',
  label: 'Privacy and accessibility',
  description: 'Compare which rooms visitors and residents can reach from entrances through resolved connections.',
  inputs: [],
  uses: { functions: ['entrance'], nodeFields: ['accessLevel', 'entranceType'] },
  run(ctx) {
    // An entrance can have its own access rule.
    const access = new Map(ctx.design.nodes.map((room) => [
      room.id,
      room.function === 'entrance' ? room.custom.entranceType ?? room.custom.accessLevel : room.custom.accessLevel,
    ]));
    const entrances = ctx.design.nodes.filter((room) => room.function === 'entrance');
    if (entrances.length === 0) {
      return { kind: 'analysis', text: 'Add an Entrance to compare visitor and resident routes.' };
    }

    // Make a two-way map of connections the app can resolve.
    const connections = new Map(ctx.design.nodes.map((room) => [room.id, [] as number[]]));
    for (const edge of ctx.design.edges) {
      const status = ctx.metrics.value('resolution-status', edge.id);
      if (status !== 'direct' && status !== 'routed') continue;
      connections.get(edge.source)?.push(edge.target);
      connections.get(edge.target)?.push(edge.source);
    }

    // Follow each group's permitted connections, visiting each room at most once.
    function reachable(visitor: boolean) {
      const starts = entrances.filter((room) => {
        const level = access.get(room.id);
        return level === 'public' || (!visitor && level === 'resident-only');
      });
      const queue = starts.map((room) => room.id);
      const seen = new Set(queue);
      for (const id of queue) {
        // Residents can reach private rooms, but those rooms end the route.
        if (access.get(id) === 'private') continue;
        for (const next of connections.get(id) ?? []) {
          const level = access.get(next);
          const allowed = level === 'public' || level === 'semi-public'
            || (!visitor && (level === 'resident-only' || level === 'private'));
          if (!allowed || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      return seen;
    }

    // Colour by reach and highlight places where an intended route is missing.
    const visitors = reachable(true);
    const residents = reachable(false);
    const nodeValues: Record<number, string> = {};
    const highlightNodes: number[] = [];
    for (const room of ctx.design.nodes) {
      const level = access.get(room.id);
      nodeValues[room.id] = visitors.has(room.id) ? 'Visitors and residents'
        : residents.has(room.id) ? 'Residents only' : 'Unreachable';
      if (!residents.has(room.id) || (level === 'public' && !visitors.has(room.id))) {
        highlightNodes.push(room.id);
      }
    }
    return {
      kind: 'analysis',
      value: highlightNodes.length,
      text: `Visitors reach ${visitors.size} rooms and residents reach ${residents.size}. ${highlightNodes.length} lack an intended route.`,
      nodeValues,
      highlightNodes,
    };
  },
});
