import { defineDesignAnalysis } from '@student-api';
import { levels } from '../lib/house-connections';
import { buildingArea, dimensions, drawnArea, reportFindings } from '../lib/house-rules';

export default defineDesignAnalysis({
  id: 'check-dimensional-compliance',
  label: 'Check Dimensional Compliance',
  inputs: [],
  uses: { functions: Object.keys(levels) },
  run(ctx) {
    // Use the app's nominal floor area and omit the outdoor pool.
    const area = (room: (typeof ctx.design.nodes)[number]) => {
      const measured = ctx.metrics.value('area', room.id);
      return typeof measured === 'number' ? measured : drawnArea(room);
    };
    const nominalAreas = new Map(ctx.design.nodes.map((room) => [room.id, area(room)]));
    const measuredArea: typeof drawnArea = (room) => nominalAreas.get(room.id ?? -1) ?? drawnArea(room);
    const rooms = ctx.design.nodes;
    return reportFindings(dimensions(rooms, measuredArea), 'Room dimensions comply.', `Building area ${buildingArea(rooms, measuredArea)} m². `);
  },
});
