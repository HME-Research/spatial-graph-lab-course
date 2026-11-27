import { defineDesignAnalysis } from '@student-api';

/** Highlight compact served rooms that connect directly to a servant room. */
export default defineDesignAnalysis({
  id: 'compact-served-with-support',
  label: 'Compact served spaces with support',
  description: 'Highlights Served Spaces no longer than 6 m that have a direct graph edge to a Servant Space.',
  inputs: [],
  uses: { functions: ['served-space', 'servant-space'] },
  run(ctx) {
    // Collect the rooms that count as servant spaces in this toolkit.
    const servantIds = new Set(ctx.design.nodes
      .filter((room) => room.function === 'servant-space')
      .map((room) => room.id));

    // Keep compact served rooms with an edge to any servant room.
    const matching = ctx.design.nodes
      .filter((room) => room.function === 'served-space')
      .filter((room) => Math.max(room.size[0], room.size[1]) * 3 <= 6)
      .filter((room) => ctx.design.edges.some((edge) =>
        (edge.source === room.id && servantIds.has(edge.target)) ||
        (edge.target === room.id && servantIds.has(edge.source)),
      ))
      .map((room) => room.id);

    // Explain the result and highlight every matching room.
    return {
      kind: 'analysis',
      value: matching.length,
      text: matching.length === 0
        ? 'No compact Served Spaces have a direct graph edge to a Servant Space.'
        : `${matching.length} compact Served Space(s) have a direct graph edge to a Servant Space.`,
      highlightNodes: matching,
    };
  },
});
