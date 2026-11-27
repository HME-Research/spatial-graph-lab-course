import { defineDesignAnalysis, type SpatialNode } from '@student-api';
import { connectionProblem, levels, pairKey, planHouseConnections } from '../lib/house-connections';

// Follow links from the entrance and collect every room that can be reached.
function reachable(start: number | undefined, links: ReadonlyMap<number, number[]>) {
  const visited = new Set<number>();
  if (start === undefined) return visited;
  const queue = [start];
  visited.add(start);
  for (const id of queue) {
    for (const next of links.get(id) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

export default defineDesignAnalysis({
  id: 'check-spatial-connectivity',
  label: 'Check Spatial Connectivity',
  description: 'Highlights missing links, bad geometry, unreachable rooms and privacy violations. Colour by the analysis to read each highlighted room’s findings.',
  inputs: [],
  uses: { functions: Object.keys(levels) },
  run(ctx) {
    const plan = planHouseConnections(ctx);
    const required = new Set(plan.required.map(([a, b]) => pairKey(a.id, b.id)));
    const nodes = new Map(ctx.design.nodes.map((room) => [room.id, room]));
    const roomIssues: Record<number, string> = {};
    const edgeIssues: number[] = [];
    const findings = new Map<string, Set<number>>();
    const allLinks = new Map<number, number[]>();
    const validLinks = new Map<number, number[]>();

    // Record each rule failure against the affected rooms.
    function flag(rule: string, rooms: SpatialNode[], detail = rule) {
      const ids = findings.get(rule) ?? new Set<number>();
      for (const room of rooms) {
        ids.add(room.id);
        roomIssues[room.id] = [roomIssues[room.id], detail].filter(Boolean).join('. ');
      }
      findings.set(rule, ids);
    }

    // Compare the raw graph with links that meet the geometry and privacy rules.
    function link(graph: Map<number, number[]>, from: number, to: number) {
      graph.set(from, [...(graph.get(from) ?? []), to]);
      graph.set(to, [...(graph.get(to) ?? []), from]);
    }
    for (const edge of ctx.design.edges) {
      const a = nodes.get(edge.source);
      const b = nodes.get(edge.target);
      if (!a || !b) continue;
      link(allLinks, a.id, b.id);
      const problem = connectionProblem(ctx, edge, a, b, required);
      if (problem) {
        flag(problem, [a, b], `${problem} on link ${edge.id} between rooms ${a.id} and ${b.id}`);
        edgeIssues.push(edge.id);
        continue;
      }
      link(validLinks, a.id, b.id);
    }

    // Flag absent doors, unpaired suites and rooms drawn on the wrong floor.
    for (const [a, b] of plan.required) {
      if (!plan.byPair.has(pairKey(a.id, b.id))) {
        flag('Missing connection', [a, b], `Missing connection between rooms ${a.id} and ${b.id}`);
      }
    }
    for (const room of plan.unpaired) flag('No exclusive bathroom pair', [room]);
    for (const room of ctx.design.nodes) {
      if (!Object.hasOwn(levels, room.function)) continue;
      const level = levels[room.function as keyof typeof levels];
      if (room.position[2] !== level) flag('Wrong floor', [room], `Needs level ${level}`);
    }

    // A valid route can enter a bedroom to reach its own bathroom and nowhere else.
    const allReachable = reachable(plan.entrance?.id, allLinks);
    const validReachable = reachable(plan.entrance?.id, validLinks);
    for (const room of ctx.design.nodes) {
      if (!allReachable.has(room.id)) flag('Disconnected from entrance', [room]);
      else if (!validReachable.has(room.id)) flag('No valid circulation route', [room]);
    }

    // Keep the summary short and put full room-level details in the analysis values.
    const notes = [];
    if (plan.missingRoles.size) notes.push(`Missing on required floors: ${[...plan.missingRoles].join(', ')}.`);
    for (const [rule, ids] of findings) notes.push(`${rule}: #${[...ids].join(', #')}.`);
    const summary = notes.join(' ');
    return {
      kind: 'analysis',
      value: plan.missingRoles.size + [...findings.values()].reduce((sum, ids) => sum + ids.size, 0),
      text: summary.length > 300 ? `${summary.slice(0, 259)}… See room analysis values.` :
        summary || 'All rooms have valid routes from the main entrance and the required connections.',
      highlightNodes: Object.keys(roomIssues).map(Number),
      highlightEdges: edgeIssues,
      nodeValues: roomIssues,
    };
  },
});
