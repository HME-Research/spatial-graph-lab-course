// A design analysis for Spatial Graph Lab: the neighbours of a room that have the same Function.
// One node input → it appears in Analyse › Node and runs on the selected room. It reads Functions
// only as labels (it never names one, such as 'kitchen'), so it leaves `uses` out and works in any project.

import { defineDesignAnalysis, getNode, neighbours } from '@student-api';

export default defineDesignAnalysis({
  id: 'same-function-neighbours',
  label: 'Neighbours with the same Function',
  description: 'The rooms joined to this room by a relationship that have the same Function, and whether they share a wall or a floor.',

  // The student selects one room.
  inputs: [{ kind: 'node', label: 'Room' }],

  run(ctx) {
    const roomId = ctx.inputs[0]!;
    const room = getNode(ctx.design, roomId)!;

    // Neighbours = rooms joined to this one by one relationship.
    const same = neighbours(ctx.design, roomId).filter((id) => getNode(ctx.design, id)!.function === room.function);

    // The Function's label, e.g. "Bedroom" (else its id).
    const label = ctx.functions.find((f) => f.id === room.function)?.label ?? room.function;
    if (same.length === 0) return { kind: 'analysis', value: 0, text: `No neighbour of room ${roomId} is also a ${label}.`, highlightNodes: [roomId] };

    // Of those, the ones that share a wall or a floor with it.
    const touching = same.filter((id) => ctx.touches(roomId, id)).length;
    return {
      kind: 'analysis',
      value: same.length,
      text: `${same.length} neighbour(s) of room ${roomId} are also a ${label}; ${touching} of them share a wall or a floor with it.`,
      highlightNodes: [roomId, ...same],
    };
  },
});
