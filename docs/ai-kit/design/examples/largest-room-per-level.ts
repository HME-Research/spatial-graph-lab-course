// A design analysis for Spatial Graph Lab: the largest room on each level.
// No inputs → it appears in Analyse › Network. It uses only what every project has
// (positions and the calculated floor area), so it leaves `uses` out and works in any project.

import { defineDesignAnalysis } from '@student-api';

export default defineDesignAnalysis({
  id: 'largest-room-per-level',
  label: 'Largest room per level',
  description: 'The room with the largest floor area on each level, and every room coloured by its floor area.',

  // Nothing to pick: it runs on the whole design.
  inputs: [],

  run(ctx) {
    // The largest room found so far on each level (level = z of the room's position).
    const best = new Map<number, { id: number; area: number }>();
    // Every room's floor area, to colour the rooms.
    const areas: Record<number, number> = {};

    for (const room of ctx.design.nodes) {
      // Floor area in m², calculated by the app.
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number') continue;
      areas[room.id] = area;
      const level = room.position[2];
      const current = best.get(level);
      // Keep the larger room (on a tie, the smaller id).
      if (!current || area > current.area) best.set(level, { id: room.id, area });
    }

    if (best.size === 0) return { kind: 'analysis', text: 'There are no rooms.' };

    // One short line: "Level 0: room 2 (36 m²) · Level 1: room 5 (18 m²)".
    const levels = [...best.keys()].sort((a, b) => a - b);
    const text = levels.map((level) => `Level ${level}: room ${best.get(level)!.id} (${best.get(level)!.area} m²)`).join(' · ');

    return {
      kind: 'analysis',
      text: text.length <= 300 ? text : `${best.size} levels: the largest rooms are lit up.`,
      highlightNodes: levels.map((level) => best.get(level)!.id),
      nodeValues: areas,
    };
  },
});
