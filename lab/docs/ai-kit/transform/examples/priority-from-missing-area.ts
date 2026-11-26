// A transform for Spatial Graph Lab, for THIS PROJECT: it reads the House toolkit's field
// `targetArea` and sets its field `priority`, so it works only in projects that have both fields
// (PROJECT.md lists a project's fields). Upload it in Transform › Upload your own (.ts).
// The room that misses the most floor area gets priority 1, the next one 2, and so on.

import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

export default defineSpatialAlgorithm({
  id: 'priority-from-missing-area',
  label: 'Priority from missing area',

  parameters: {
    onlyBelowTarget: {
      kind: 'boolean',
      default: true,
      label: 'Only rooms below their target',
      description: 'Yes: rooms that already reach their target area keep their priority. No: every room with a target area gets a new one.',
    },
  },

  run(ctx) {
    const onlyBelow = ctx.params.onlyBelowTarget ?? true;

    // It needs two custom node fields of this project.
    const fields = ctx.customFields.nodes.map((f) => f.key);
    if (!fields.includes('targetArea') || !fields.includes('priority')) {
      return { kind: 'transformation', summary: 'This project has no targetArea or priority field (they come with the House toolkit).', operations: [] };
    }

    // How much floor area each room still misses, in m².
    const rooms: { id: number; missing: number }[] = [];
    for (const room of ctx.design.nodes) {
      // The room's own value, else its Function's default (the values Properties shows).
      const target = ctx.nodeCustom(room.id)['targetArea'];
      // Floor area calculated by the app.
      const area = ctx.metrics.value('area', room.id);
      if (typeof target !== 'number' || typeof area !== 'number') continue;
      if (onlyBelow && area >= target) continue;
      rooms.push({ id: room.id, missing: target - area });
    }

    // The largest missing area first; equal ones in id order.
    rooms.sort((a, b) => b.missing - a.missing || a.id - b.id);

    // Priority 1, 2, 3… in that order.
    const operations: SpatialOperation[] = rooms.map((room, index) => ({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'priority', value: index + 1 }));

    const summary = rooms.length === 0 ? 'No room is below its target area.' : `New priorities: ${rooms.map((r, i) => `room ${r.id} → ${i + 1}`).join(', ')}.`;
    return { kind: 'transformation', summary, operations };
  },
});
