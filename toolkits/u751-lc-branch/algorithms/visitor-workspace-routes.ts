import { defineDesignAnalysis } from '@student-api';
import { visitorRoutes } from '../lib/visitor-routes';

/** Find a shortest bedroom-free route to each Workspace. */
export default defineDesignAnalysis({
  id: 'visitor-workspace-routes',
  label: 'Visitor workspace routes',
  description: 'Highlight shortest routes from an Entrance to every Workspace, excluding all Bedrooms. Shortest means fewest connections, not metres.',
  inputs: [],
  uses: { functions: ['entrance', 'bedroom', 'workspace'] },
  run(ctx) {
    // Every Workspace needs a route, even when another Workspace is reachable.
    const destinations = ctx.design.nodes.filter((node) => node.function === 'workspace');
    return visitorRoutes(ctx, destinations, 'Workspace');
  },
});
