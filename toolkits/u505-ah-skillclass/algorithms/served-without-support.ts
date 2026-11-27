import { defineDesignAnalysis } from '@student-api';

/** Highlight served rooms without a direct edge to a servant room. */
export default defineDesignAnalysis({
  id: 'served-without-support',
  label: 'Served spaces without support',
  description: 'Highlights Served Spaces with no direct graph edge to a Servant Space.',
  inputs: [],
  uses: { functions: ['served-space', 'servant-space'] },
  run(ctx) {
    // Collect the rooms that count as servant spaces in this toolkit.
    const servantIds = new Set(ctx.design.nodes
      .filter((room) => room.function === 'servant-space')
      .map((room) => room.id));

    // Keep served rooms that have no edge to any servant room.
    const unsupported = ctx.design.nodes
      .filter((room) => room.function === 'served-space')
      .filter((room) => !ctx.design.edges.some((edge) =>
        (edge.source === room.id && servantIds.has(edge.target)) ||
        (edge.target === room.id && servantIds.has(edge.source)),
      ))
      .map((room) => room.id);

    // Explain when every served room has a supporting-programme connection.
    return {
      kind: 'analysis',
      value: unsupported.length,
      text: unsupported.length === 0
        ? 'Every Served Space has a direct graph edge to a Servant Space.'
        : `${unsupported.length} Served Space(s) have no direct graph edge to a Servant Space.`,
      highlightNodes: unsupported,
    };
  },
});
