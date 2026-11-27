import { defineDesignAnalysis } from '@student-api';

/** Find existing connections that jump straight from loud to quiet. */
export default defineDesignAnalysis({
  id: 'noise-clashes',
  label: 'Noise clashes',
  description: 'Count and highlight relationships joining loud and quiet rooms.',
  inputs: [],
  uses: { nodeFields: ['noise'] },
  run(ctx) {
    // Look up the intended noise level of each room, including its default.
    const noises = new Map(ctx.design.nodes.map((room) => [
      room.id,
      typeof room.custom.noise === 'string' ? room.custom.noise : null,
    ]));

    // Collect each relationship with loud on one end and quiet on the other.
    const clashes: number[] = [];
    for (const edge of ctx.design.edges) {
      const a = noises.get(edge.source);
      const b = noises.get(edge.target);
      if ((a === 'loud' && b === 'quiet') || (a === 'quiet' && b === 'loud')) {
        clashes.push(edge.id);
      }
    }

    // Report the count and light up the clashing edges.
    return {
      kind: 'analysis',
      value: clashes.length,
      text: clashes.length === 0 ? 'No loud-to-quiet connections.' : `${clashes.length} loud-to-quiet connection(s).`,
      highlightEdges: clashes,
    };
  },
});
