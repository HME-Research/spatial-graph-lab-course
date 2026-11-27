import { defineDesignAnalysis } from '@student-api';

/**
 * Daylight check: a design analysis with no input (Analyse › Network). A room can get daylight
 * when at least one of its walls faces the outside (the app's calculated value
 * "has-exterior-facade"; roofs and floors don't count). It highlights every room without one.
 */
export default defineDesignAnalysis({
  id: 'daylight-check',
  label: 'Daylight check',
  description: 'Highlights every room with no wall to the outside, so it cannot get daylight through a window.',
  inputs: [],
  run(ctx) {
    // Nothing to check yet: say so instead of giving an answer.
    if (ctx.design.nodes.length === 0) {
      return { kind: 'analysis', value: 0, text: 'No rooms in this design yet.' };
    }

    // Every room whose walls all touch other rooms (no outside wall).
    const dark = ctx.design.nodes
      .filter((room) => ctx.metrics.value('has-exterior-facade', room.id) !== true)
      .map((room) => room.id);

    // All rooms have an outside wall.
    if (dark.length === 0) {
      return { kind: 'analysis', value: 0, text: `All ${ctx.design.nodes.length} rooms have a wall to the outside.` };
    }

    return {
      kind: 'analysis',
      value: dark.length,
      text: `Room(s) with no wall to the outside: ${dark.join(', ')}.`,
      highlightNodes: dark,
    };
  },
});
