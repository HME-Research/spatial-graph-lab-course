import { defineDesignAnalysis, getNode, neighbours } from '@student-api';

/**
 * Occupancy around a node: a design analysis (it reads the nodes themselves, not only the graph).
 * It takes one node as input, so it appears in Analyse › Node and runs on the selected node.
 * It reads the toolkit attribute `occupancy`, so `uses` lists it.
 */
export default defineDesignAnalysis({
  id: 'occupancy-around',
  label: 'Occupancy around',
  description: 'How many people the selected node and the nodes joined to it hold together.',
  inputs: [{ kind: 'node', label: 'Node' }],
  uses: { nodeFields: ['occupancy'] },
  run(ctx) {
    // The selected node and its neighbours (nodes joined to it by one edge).
    const start = ctx.inputs[0]!;
    const around = [start, ...neighbours(ctx.design, start)];

    // Add up their occupancy; a node without a value counts as 0.
    let people = 0;
    for (const id of around) {
      const value = getNode(ctx.design, id)?.custom.occupancy;
      if (typeof value === 'number') people += value;
    }

    return {
      kind: 'analysis',
      value: people,
      text: `${people} people in node ${start} and the ${around.length - 1} node(s) joined to it.`,
      highlightNodes: around,
    };
  },
});
