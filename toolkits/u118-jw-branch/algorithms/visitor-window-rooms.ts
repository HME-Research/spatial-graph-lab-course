import { defineDesignAnalysis } from '@student-api';
import { visitorRooms } from '../lib/visitor-rooms';

export default defineDesignAnalysis({
  id: 'visitor-window-rooms',
  label: 'Visitor-accessible window rooms',
  inputs: [],
  uses: { functions: ['entrance', 'bedroom'], nodeFields: ['hasWindow'] },
  run(ctx) {
    // Read the window setting on every room, including Function defaults.
    const windows = new Set(ctx.design.nodes.filter(room => room.custom.hasWindow === true).map(room => room.id));
    const rooms = visitorRooms(ctx.design, ctx.metrics, id => windows.has(id));

    // Highlight the rooms visitors can reach without entering a bedroom.
    return {
      kind: 'analysis',
      value: rooms.length,
      text: rooms.length
        ? `${rooms.length} window room(s) reachable from an entrance without entering a bedroom.`
        : 'No window rooms reachable from an entrance without entering a bedroom.',
      highlightNodes: rooms.map(room => room.id),
    };
  },
});
