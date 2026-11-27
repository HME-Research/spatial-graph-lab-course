import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import { circulationRoutes } from '../lib/circulation';

export default defineSpatialAlgorithm({
  id: 'mark-circulation',
  label: 'Mark circulation paths',
  run(ctx) {
    // Use connections the app can build.
    const connections = ctx.design.edges.filter((edge) =>
      ctx.metrics.value('resolution-status', edge.id) !== 'unresolved');
    const routes = circulationRoutes(ctx.design.nodes, connections);

    // Update the route marks, including any left over from an earlier run.
    const operations: SpatialOperation[] = [];
    for (const edge of ctx.design.edges) {
      const onRoute = routes?.routeEdges.has(edge.id) ?? false;
      if ((ctx.edgeCustom(edge.id).circulationPath === true) === onRoute) continue;
      operations.push({
        op: 'set-edge-custom-attribute', edgeId: edge.id, key: 'circulationPath', value: onRoute,
      });
    }

    return {
      kind: 'transformation',
      summary: routes?.summary ?? 'Add a Reception room to start the circulation paths.',
      operations,
    };
  },
});
