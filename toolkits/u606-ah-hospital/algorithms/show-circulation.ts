import { defineDesignAnalysis } from '@student-api';
import { circulationRoutes } from '../lib/circulation';

export default defineDesignAnalysis({
  id: 'show-circulation',
  label: 'Show circulation paths',
  inputs: [],
  uses: { functions: ['reception', 'hallway'] },
  run(ctx) {
    // Use the same route rule as the transform and highlight the result.
    const connections = ctx.design.edges.filter((edge) =>
      ctx.metrics.value('resolution-status', edge.id) !== 'unresolved');
    const routes = circulationRoutes(ctx.design.nodes, connections);
    if (!routes) return { kind: 'analysis', text: 'Add a Reception room to start the circulation paths.' };
    return {
      kind: 'analysis',
      text: routes.summary,
      highlightNodes: [...routes.reached],
      highlightEdges: [...routes.routeEdges],
    };
  },
});
