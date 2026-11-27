import { defineDesignAnalysis } from '@student-api';
import { levels } from '../lib/house-connections';
import { reportFindings, roomProgramme } from '../lib/house-rules';

export default defineDesignAnalysis({
  id: 'check-room-distribution',
  label: 'Check Room Distribution',
  inputs: [],
  uses: { functions: Object.keys(levels) },
  run(ctx) {
    // Compare every room type and storey with the programme.
    return reportFindings(roomProgramme(ctx.design.nodes), 'All 19 rooms match the required counts and levels.');
  },
});
