import { defineDesignAnalysis } from '@student-api';

/**
 * Room daylight: a design analysis (it reads the rooms themselves).
 *
 * It takes one room as input (so it appears in Analyse › Node and runs on the selected room) and
 * says where it gets daylight: an outside wall (any wall facing an empty cell), or a Courtyard or
 * Garden it touches. It lights up the room and the courtyards/gardens that give it light. Run it on
 * a bedroom to check the light wells.
 *
 * `uses` lists the Function ids it names, so the app knows it needs `courtyard` and `garden`.
 */
export default defineDesignAnalysis({
  id: 'room-daylight',
  label: 'Room daylight',
  description: 'Where the selected room gets daylight: an outside wall, or a courtyard or garden it touches.',
  inputs: [{ kind: 'node', label: 'Room' }],
  uses: { functions: ['courtyard', 'garden'] },
  run(ctx) {
    const id = ctx.inputs[0]!;
    if (!ctx.design.nodes.some((n) => n.id === id)) {
      return { kind: 'analysis', value: 0, text: 'Select a room to check its daylight.' };
    }

    // An outside wall already gives daylight.
    const outside = ctx.metrics.value('has-exterior-facade', id) === true;

    // A courtyard or garden that touches the room lets light in.
    const givers: number[] = [];
    for (const other of ctx.design.nodes) {
      if (other.id === id) continue;
      const givesLight = other.function === 'courtyard' || other.function === 'garden';
      if (givesLight && ctx.touches(id, other.id)) givers.push(other.id);
    }

    const hasDaylight = outside || givers.length > 0;
    let text: string;
    if (outside && givers.length > 0) {
      text = `Room ${id} gets daylight from an outside wall and ${givers.length} courtyard/garden(s) it touches.`;
    } else if (outside) {
      text = `Room ${id} gets daylight from an outside wall.`;
    } else if (givers.length > 0) {
      text = `Room ${id} gets daylight through ${givers.length} courtyard/garden(s) it touches.`;
    } else {
      text = `Room ${id} has no daylight yet: give it an outside wall or put a courtyard or garden next to it.`;
    }
    return { kind: 'analysis', value: hasDaylight ? 1 : 0, text, highlightNodes: [id, ...givers] };
  },
});
