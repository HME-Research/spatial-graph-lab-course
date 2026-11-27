import { defineDesignAnalysis, type SpatialNode } from '@student-api';

/**
 * Escape distance: a design analysis. For every Guest room it finds the shortest walk through the
 * graph (room centre to room centre, along the edges) to the nearest escape Stair or exit entrance.
 * It shows the distance on each Guest room and highlights the rooms over the limit, or with no route.
 *
 * The limit is a number input (analyses have no parameters), so it appears in Analyse › Queries.
 */
export default defineDesignAnalysis({
  id: 'escape-distance',
  label: 'Escape distance',
  description: 'Shortest walk from every Guest room to the nearest escape Stair or exit, along the edges. Rooms over the limit light up.',
  inputs: [{ kind: 'number', label: 'Limit (m)', min: 1, default: 30 }],
  uses: {
    functions: ['guest-room', 'stair', 'main-entrance', 'secondary-entrance'],
    nodeFields: ['isEscapeStair', 'countsAsExit'],
  },
  run(ctx) {
    const limit = ctx.inputs[0] ?? 30;
    const nodes = ctx.design.nodes;

    // The centre of a room in metres (one cell is 3 × 3 m, one level 3 m high).
    const centre = (n: SpatialNode) => n.position.map((p, i) => (p + n.size[i]! / 2) * 3);
    // The straight distance between two room centres (m).
    const between = (a: SpatialNode, b: SpatialNode) => {
      const ca = centre(a);
      const cb = centre(b);
      return Math.hypot(ca[0]! - cb[0]!, ca[1]! - cb[1]!, ca[2]! - cb[2]!);
    };

    // The escape targets: escape Stairs and entrances that count as an exit.
    const isTarget = (n: SpatialNode) =>
      (n.function === 'stair' && n.custom.isEscapeStair === true) ||
      ((n.function === 'main-entrance' || n.function === 'secondary-entrance') && n.custom.countsAsExit === true);

    // Start every target at 0 m and every other room at "not reached yet".
    const distance = new Map<number, number>();
    for (const n of nodes) distance.set(n.id, isTarget(n) ? 0 : Infinity);

    // Shortest paths from all targets at once (Dijkstra): each round fixes the nearest unfixed room.
    const done = new Set<number>();
    for (let round = 0; round < nodes.length; round++) {
      // The nearest room that is not fixed yet.
      let nearest: SpatialNode | undefined;
      for (const n of nodes) {
        if (done.has(n.id)) continue;
        if (nearest === undefined || distance.get(n.id)! < distance.get(nearest.id)!) nearest = n;
      }
      // Stop when the rest cannot be reached.
      if (nearest === undefined || distance.get(nearest.id) === Infinity) break;
      done.add(nearest.id);
      // Walk along every edge of that room and keep the shorter distance.
      for (const e of ctx.design.edges) {
        const otherId = e.source === nearest.id ? e.target : e.target === nearest.id ? e.source : undefined;
        if (otherId === undefined || done.has(otherId)) continue;
        const other = nodes.find((n) => n.id === otherId);
        if (other === undefined) continue;
        const viaHere = distance.get(nearest.id)! + between(nearest, other);
        if (viaHere < distance.get(otherId)!) distance.set(otherId, viaHere);
      }
    }

    // Read off the Guest rooms: show their distance, highlight those too far or with no route.
    const shown: Record<number, number> = {};
    const tooFar: number[] = [];
    let guestRooms = 0;
    let noRoute = 0;
    for (const n of nodes) {
      if (n.function !== 'guest-room') continue;
      guestRooms++;
      const d = distance.get(n.id)!;
      if (d === Infinity) {
        noRoute++;
        tooFar.push(n.id);
        continue;
      }
      shown[n.id] = Math.round(d * 10) / 10;
      if (d > limit) tooFar.push(n.id);
    }

    // Explain the answer in one line.
    let text: string;
    if (guestRooms === 0) text = 'No Guest room in this design.';
    else if (tooFar.length === 0) text = `Every Guest room is within ${limit} m of an escape Stair or exit.`;
    else text = `${tooFar.length} of ${guestRooms} Guest room(s) are over ${limit} m (${noRoute} with no route at all).`;

    return { kind: 'analysis', value: tooFar.length, text, highlightNodes: tooFar, nodeValues: shown };
  },
});
