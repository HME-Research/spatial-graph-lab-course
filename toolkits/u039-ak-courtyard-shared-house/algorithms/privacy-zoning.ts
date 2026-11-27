import { defineDesignAnalysis } from '@student-api';

export default defineDesignAnalysis({
  id: 'privacy-zoning',
  label: 'Privacy Zoning',
  description: 'Colour each room by its access level and show the levels in the analysis legend.',
  inputs: [],
  uses: { nodeFields: ['accessLevel'] },
  run(ctx) {
    // Text values give each reported access level a distinct colour in the app.
    const nodeValues: Record<number, string | null> = {};
    for (const room of ctx.design.nodes) {
      const level = room.custom.accessLevel;
      nodeValues[room.id] = typeof level === 'string' ? level : null;
    }

    return {
      kind: 'analysis',
      text: ctx.design.nodes.length ? 'Rooms coloured by access level.' : 'Add rooms to see privacy zones.',
      nodeValues,
    };
  },
});
