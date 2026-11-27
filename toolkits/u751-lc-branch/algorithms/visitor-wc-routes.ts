import { defineDesignAnalysis } from '@student-api';
import { visitorRoutes } from '../lib/visitor-routes';

/** Find a shortest bedroom-free route to each WC authorised for visitors. */
export default defineDesignAnalysis({
  id: 'visitor-wc-routes',
  label: 'Visitor WC routes',
  description: 'Highlight shortest routes from an Entrance to every WC with visitor access allowed, excluding all Bedrooms. Report unreachable destinations.',
  inputs: [],
  uses: { functions: ['entrance', 'bedroom', 'wc'], nodeFields: ['visitorAccessAllowed'] },
  run(ctx) {
    // Only a WC explicitly authorised for visitors is a destination.
    const destinations = ctx.design.nodes.filter(
      (node) => node.function === 'wc' && node.custom.visitorAccessAllowed === true,
    );
    return visitorRoutes(ctx, destinations, 'Visitor-authorised WC');
  },
});
