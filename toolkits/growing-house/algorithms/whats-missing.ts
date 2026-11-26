import { defineDesignAnalysis } from '@student-api';
import { FUNCTIONS, PROGRAMME } from '../lib/rules';

/**
 * What's missing: a design analysis (it reads the rooms themselves, not only the graph).
 *
 * One line listing the Functions the house still lacks, or has too few of, compared with the
 * complete programme in `lib/rules.ts` (e.g. "Missing: Kitchen, Bedroom ×2"), or "Complete
 * programme". It lights up the rooms whose floor area is still below their `targetArea`.
 *
 * `uses` lists every Function id it names and the field it reads, so the app knows it works only in
 * projects that have them.
 */
export default defineDesignAnalysis({
  id: 'whats-missing',
  label: "What's missing",
  description: 'Lists the Functions the house still lacks for a complete programme, and lights up the rooms below their target area.',
  inputs: [],
  uses: { functions: FUNCTIONS.map((f) => f.id), nodeFields: ['targetArea'] },
  run(ctx) {
    // How many rooms of each Function the house has.
    const count: Record<string, number> = {};
    for (const room of ctx.design.nodes) count[room.function] = (count[room.function] ?? 0) + 1;

    // Every Function with fewer rooms than the programme asks for, e.g. "Bedroom ×2".
    const missing: string[] = [];
    for (const fn of FUNCTIONS) {
      const short = (PROGRAMME[fn.id] ?? 0) - (count[fn.id] ?? 0);
      if (short > 0) missing.push(short === 1 ? fn.label : `${fn.label} ×${short}`);
    }

    // Rooms whose floor area is still below their target area.
    const small: number[] = [];
    for (const room of ctx.design.nodes) {
      const target = room.custom.targetArea;
      const area = ctx.metrics.value('area', room.id);
      if (typeof target === 'number' && typeof area === 'number' && area < target) small.push(room.id);
    }

    // One line: what's missing, and how many rooms are still small.
    const programme = missing.length === 0 ? 'Complete programme' : `Missing: ${missing.join(', ')}`;
    const rooms = small.length === 0 ? '' : ` · ${small.length} room${small.length === 1 ? '' : 's'} below target area`;
    return { kind: 'analysis', text: `${programme}${rooms}`, highlightNodes: small };
  },
});
