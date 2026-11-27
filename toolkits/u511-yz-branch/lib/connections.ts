import type { DesignAnalysisContext } from '@student-api';

// Build a two-way neighbour list once, including isolated nodes.
export function connections(design: DesignAnalysisContext['design']) {
  const adjacent = new Map<number, number[]>();
  for (const node of design.nodes) adjacent.set(node.id, []);
  for (const edge of design.edges) {
    adjacent.get(edge.source)?.push(edge.target);
    adjacent.get(edge.target)?.push(edge.source);
  }
  return adjacent;
}
