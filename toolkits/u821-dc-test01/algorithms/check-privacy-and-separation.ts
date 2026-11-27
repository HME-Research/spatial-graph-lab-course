import { defineDesignAnalysis } from '@student-api';
import { connectionProblem, isPrivate, levels, pairKey, planHouseConnections } from '../lib/house-connections';
import { plantSeparation, reportFindings } from '../lib/house-rules';

export default defineDesignAnalysis({
  id: 'check-privacy-and-separation',
  label: 'Check Privacy and Separation',
  inputs: [],
  uses: { functions: Object.keys(levels) },
  run(ctx) {
    // Check the service path, ensuite pairing and private-room connections.
    const findings = plantSeparation(ctx.design.nodes, ctx.design.edges, ctx.touches);
    const plan = planHouseConnections(ctx);
    const required = new Set(plan.required.map(([a, b]) => pairKey(a.id, b.id)));
    const rooms = new Map(ctx.design.nodes.map((room) => [room.id, room]));
    const edges: number[] = [];
    for (const edge of ctx.design.edges) {
      const a = rooms.get(edge.source);
      const b = rooms.get(edge.target);
      if (!a || !b) continue;
      if (!isPrivate(a) && !isPrivate(b) && ![a.function, b.function].includes('guest-bathroom')) continue;
      const problem = connectionProblem(ctx, edge, a, b, required);
      if (!problem) continue;
      findings.push({ message: `${problem} on edge #${edge.id}`, ids: [a.id, b.id] });
      edges.push(edge.id);
    }
    for (const room of plan.unpaired) findings.push({ message: 'No exclusive ensuite pairing', ids: [room.id] });
    for (const [a, b] of plan.required) {
      if ((isPrivate(a) || isPrivate(b)) && !plan.byPair.has(pairKey(a.id, b.id))) {
        findings.push({ message: 'Missing private Access connection', ids: [a.id, b.id] });
      }
    }
    for (const id of plan.missingRoles) findings.push({ message: `Missing on required floor: ${id}`, ids: [] });
    return { ...reportFindings(findings, 'Private suites and plant separation comply.'), highlightEdges: edges };
  },
});
