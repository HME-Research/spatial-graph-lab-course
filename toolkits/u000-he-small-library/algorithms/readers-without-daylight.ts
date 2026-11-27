import { defineDesignAnalysis } from '@student-api';

/** Locate reading rooms without an exterior wall and colour all rooms by exterior wall length. */
export default defineDesignAnalysis({
  id: 'readers-without-daylight',
  label: 'Readers without daylight',
  description: 'Highlight reading rooms without exterior façade; colour every room by exposed façade length in metres.',
  inputs: [],
  uses: { functions: ['reading-room'] },
  run(ctx) {
    // Calculate the exposed façade length of each room for the colour overlay.
    const lengths: Record<number, number> = {};
    const missing: number[] = [];
    for (const room of ctx.design.nodes) {
      const length = ctx.metrics.value('exposed-facade-length', room.id);
      lengths[room.id] = typeof length === 'number' ? length : 0;

      // Flag only Reading rooms whose exterior-wall metric is false.
      const exterior = ctx.metrics.value('has-exterior-facade', room.id);
      if (room.function === 'reading-room' && exterior === false) missing.push(room.id);
    }

    // Show the number without exterior façade, not a guaranteed amount of daylight.
    return {
      kind: 'analysis',
      value: missing.length,
      text: missing.length === 0
        ? 'All reading rooms have an exterior façade (daylight itself is not measured).'
        : `${missing.length} reading room(s) have no exterior façade. Colours show exposed façade length (m).`,
      highlightNodes: missing,
      nodeValues: lengths,
    };
  },
});
