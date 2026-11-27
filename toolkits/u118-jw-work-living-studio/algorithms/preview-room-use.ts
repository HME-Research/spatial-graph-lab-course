import { defineSpatialAlgorithm } from '@student-api';
import { visitorRooms } from '../lib/visitor-rooms';

export default defineSpatialAlgorithm({
  id: 'preview-room-use',
  label: 'Preview day or evening use',
  parameters: {
    roomId: {
      kind: 'number',
      label: 'Room ID',
      description: 'Enter the number of a room highlighted by Visitor-accessible window rooms.',
      min: 1,
      default: 1,
    },
    time: { kind: 'enum', label: 'Time of day', values: ['Day', 'Evening'], default: 'Day' },
  },
  run(ctx) {
    // Check the chosen room against the same rule as the analysis.
    const rooms = visitorRooms(ctx.design, ctx.metrics, id => ctx.nodeCustom(id).hasWindow === true);
    const room = rooms.find(room => room.id === ctx.params.roomId);
    if (!room) {
      return {
        kind: 'transformation',
        summary: 'Run Visitor-accessible window rooms and enter a highlighted room ID.',
        operations: [],
      };
    }

    // Preview the use on the same room by changing only its scheduled-use field.
    const use = ctx.params.time === 'Evening' ? 'Evening: living room' : 'Day: meeting room';
    return {
      kind: 'transformation',
      summary: `Room ${room.id} — ${use}`,
      operations: [{ op: 'set-node-custom-attribute', nodeId: room.id, key: 'scheduledUse', value: use }],
    };
  },
});
