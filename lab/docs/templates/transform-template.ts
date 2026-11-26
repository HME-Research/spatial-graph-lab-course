// A transform for Spatial Graph Lab: connect every two nodes whose rooms touch but have no edge yet.
// Upload it in Transform › Upload your own (.ts). It uses only what every project has (the rooms
// and where they touch), so it works in any project. Run shows the new edges as a preview; nothing
// changes until you Apply, and one Undo removes all of them again.

import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

export default defineSpatialAlgorithm({
  id: 'connect-touching-rooms',
  label: 'Connect touching rooms',

  // Set in Transform before it runs; an empty field uses the default.
  parameters: {
    relationship: {
      kind: 'enum',
      values: ['access', 'open'],
      default: 'access',
      label: 'Relationship',
      description: 'Access: people can pass (a door). Open: no wall between the two rooms.',
    },
  },

  run(ctx) {
    // Access or Open, as chosen in Transform.
    const relationship = ctx.params.relationship === 'open' ? 'open' : 'access';
    const operations: SpatialOperation[] = [];
    const nodes = ctx.design.nodes;

    // Every pair of nodes once: each node with every node after it in the list.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!.id;
        const b = nodes[j]!.id;
        // Only rooms that share a wall or a floor, and that have no edge yet.
        if (ctx.touches(a, b) && ctx.canRelate(a, b)) {
          operations.push({ op: 'add-edge', source: a, target: b, relationship });
        }
      }
    }

    // One short line for the preview.
    const summary =
      operations.length === 0
        ? 'Every two rooms that touch already have an edge.'
        : `${operations.length} new ${relationship} edge(s) between rooms that touch.`;
    return { kind: 'transformation', summary, operations };
  },
});
