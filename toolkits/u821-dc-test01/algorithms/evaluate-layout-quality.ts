import { defineDesignAnalysis, type AnalysisResult } from '@student-api';
import connectivity from './check-spatial-connectivity';
import dimensional from './check-dimensional-compliance';
import distribution from './check-room-distribution';
import privacy from './check-privacy-and-separation';
import { levels } from '../lib/house-connections';
import { buildingArea, walkDistances } from '../lib/house-rules';

export default defineDesignAnalysis({
  id: 'evaluate-layout-quality',
  label: 'Evaluate Layout Quality',
  inputs: [],
  uses: { functions: Object.keys(levels) },
  run(ctx) {
    // Combine rule reports and keep their per-room and per-edge findings.
    const checks: AnalysisResult[] = [distribution.run(ctx), connectivity.run(ctx), dimensional.run(ctx), privacy.run(ctx)];
    const mandatory = checks.some((check, index) => index === 1 ? check.value !== 0 : (check.value ?? 0) > 0);
    const [programme, links, dims, privacyCheck] = checks;
    const nodeValues: Record<number, string> = {};
    const edgeIds = new Set<number>();
    for (const check of checks) {
      for (const [id, message] of Object.entries(check.nodeValues ?? {})) {
        nodeValues[Number(id)] = [nodeValues[Number(id)], message].filter(Boolean).join('. ');
      }
      for (const id of check.highlightEdges ?? []) edgeIds.add(id);
    }

    // Score route length and footprint separately from mandatory compliance.
    const ground = ctx.design.nodes.filter((room) => room.position[2] === 0 && room.function !== 'swimming-pool');
    const span = (axis: 0 | 1) => Math.max(...ground.map((room) => room.position[axis] + room.size[axis])) -
      Math.min(...ground.map((room) => room.position[axis]));
    const compactness = ground.length ? Math.round(100 * buildingArea(ground) / (9 * span(0) * span(1))) : 0;
    const entrance = ctx.design.nodes.find((room) => room.function === 'main-entrance');
    const usableEdges = ctx.design.edges.filter((edge) => !edgeIds.has(edge.id));
    const distances = entrance ? walkDistances(entrance.id, usableEdges) : new Map<number, number>();
    const roomCount = ctx.design.nodes.length;
    const circulation = roomCount ? Math.round(ctx.design.nodes.reduce((sum, room) => {
      const distance = distances.get(room.id);
      return sum + (distance === undefined ? 0 : Math.max(0, 100 - 5 * distance));
    }, 0) / roomCount) : 0;
    const score = (count: number) => Math.max(0, 100 - count * 10);
    const c = score((programme?.value ?? 0) + (links?.value ?? 0));
    const p = score(privacyCheck?.value ?? 0);
    const d = score(dims?.value ?? 0);
    const overall = Math.round((c + circulation + compactness + p + d) / 5);
    return {
      kind: 'analysis',
      value: overall,
      text: `Mandatory checks ${mandatory ? 'need attention' : 'pass'}. Score ${overall}/100. Connectivity ${c}, circulation ${circulation}, compactness ${compactness}, privacy ${p}, dimensions ${d}. Compactness and route length are preferences. See highlighted rooms and individual checks for findings.`,
      highlightNodes: Object.keys(nodeValues).map(Number),
      highlightEdges: [...edgeIds],
      nodeValues,
    };
  },
});
