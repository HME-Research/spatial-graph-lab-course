// A design analysis for Spatial Graph Lab that uses a PROJECT field: the House toolkit's `targetArea`.
// It lists that field in `uses`, so it works only in projects that have it (with the House toolkit, for example);
// anywhere else Analyse lists it as disabled, with the reason. The same file is toolkits/house/algorithms/below-target-area.ts.

import { defineDesignAnalysis } from '@student-api';

/**
 * Below target area: a design analysis (it reads the rooms themselves, not only the graph).
 *
 * For every room, it compares the floor area the app calculates with the room's House attribute
 * `targetArea` (the room's own value, else its Function's default). It lights up the rooms that are
 * still too small, colours every room by how many m² it is missing (0 when it is big enough), and
 * shows how many rooms are too small. Run it before and after "Grow to target area".
 *
 * `uses` lists the House field it reads, so the app knows it works only in projects that have
 * `targetArea`: anywhere else it is listed as disabled, with the reason.
 */
export default defineDesignAnalysis({
  id: 'below-target-area',
  label: 'Below target area',
  description: 'Rooms whose floor area is still smaller than their target area, and how many m² each one is missing.',
  inputs: [],
  uses: { nodeFields: ['targetArea'] },
  run(ctx) {
    const tooSmall: number[] = [];
    const missing: Record<number, number> = {};
    for (const room of ctx.design.nodes) {
      // The room's target area: a number, or nothing when it has none.
      const target = room.custom.targetArea;
      if (typeof target !== 'number') continue;
      // Its floor area, as the app calculates it (m²).
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number') continue;
      // How many m² it still needs (never below 0).
      missing[room.id] = Math.max(0, Math.round((target - area) * 100) / 100);
      if (area < target) tooSmall.push(room.id);
    }
    const rooms = tooSmall.length === 1 ? 'room is' : 'rooms are';
    return {
      kind: 'analysis',
      value: tooSmall.length,
      text: tooSmall.length === 0 ? 'Every room reaches its target area.' : `${tooSmall.length} ${rooms} below their target area.`,
      highlightNodes: tooSmall,
      nodeValues: missing,
    };
  },
});
