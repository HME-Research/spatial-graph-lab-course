import { defineSpatialAlgorithm, neighbours, type SpatialOperation } from '@student-api';
import { SEED } from '../lib/rules';

/**
 * Rate the rooms: changes only the `privacy` and `daylight` attributes of the existing rooms.
 *
 * - privacy: the number of steps (relationships) from the Hall: 0–1 public, 2 shared, 3 or more
 *   private. A room the Hall cannot reach is private.
 * - daylight: from the room's exterior façade (`exposed-facade-length`): good from 6 m, poor when it
 *   has some exterior façade, none without one.
 */
export default defineSpatialAlgorithm({
  id: 'rate-the-rooms',
  label: 'Rate the rooms',
  run(ctx) {
    const rooms = [...ctx.design.nodes].sort((a, b) => a.id - b.id);
    if (rooms.length === 0) return { kind: 'transformation', summary: 'There are no rooms to rate.', operations: [] };

    // Steps from the Hall: start at every Hall (0 steps), then walk the relationships one step at a time.
    const steps = new Map<number, number>();
    let front = rooms.filter((r) => r.function === SEED).map((r) => r.id);
    for (const id of front) steps.set(id, 0);
    for (let step = 1; front.length > 0; step++) {
      const next: number[] = [];
      for (const id of front) {
        for (const other of neighbours(ctx.design, id)) {
          if (steps.has(other)) continue;
          steps.set(other, step);
          next.push(other);
        }
      }
      front = next;
    }

    const operations: SpatialOperation[] = [];
    const tally: Record<string, number> = {};
    for (const room of rooms) {
      // Privacy from the steps (no path from the Hall: private).
      const s = steps.get(room.id);
      const privacy = s === undefined || s >= 3 ? 'private' : s === 2 ? 'shared' : 'public';
      // Daylight from the exterior façade length (m) and whether it has any exterior façade.
      const facade = ctx.metrics.value('exposed-facade-length', room.id);
      const outside = ctx.metrics.value('has-exterior-facade', room.id) === true;
      const daylight = typeof facade === 'number' && facade >= 6 ? 'good' : outside ? 'poor' : 'none';
      // Set a value only when it changes.
      const now = ctx.nodeCustom(room.id);
      if (now.privacy !== privacy) operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'privacy', value: privacy });
      if (now.daylight !== daylight) operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'daylight', value: daylight });
      // Count the ratings for the summary.
      const light = daylight === 'none' ? 'no daylight' : `${daylight} daylight`;
      tally[privacy] = (tally[privacy] ?? 0) + 1;
      tally[light] = (tally[light] ?? 0) + 1;
    }

    // Summary: how many values changed, and the totals.
    const totals = Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(', ');
    const noHall = steps.size === 0 ? ' There is no Hall, so every room is private.' : '';
    return {
      kind: 'transformation',
      summary: `${rooms.length} rooms rated, ${operations.length} value${operations.length === 1 ? '' : 's'} changed: ${totals}.${noHall}`,
      operations,
    };
  },
});
