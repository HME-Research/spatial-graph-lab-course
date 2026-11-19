import { describe, expect, it } from 'vitest';
import {
  bridges,
  compareIds,
  connectedParts,
  cutNodes,
  degree,
  detourIfRemoved,
  diameter,
  graphSize,
  incidentEdgeIds,
  leafNodes,
  mostCentral,
  mostConnected,
  neighbourIds,
  reachWithin,
  sharedNeighbours,
  shortestPath,
  touchingEdges,
  type MeasureGraph,
} from './measures';

/** Graph from `[edgeId, a, b]` triples (and optional extra isolated nodes). */
function g(edges: readonly (readonly [number, number, number])[], extraNodes: readonly number[] = []): MeasureGraph {
  const ids = new Set<number>(extraNodes);
  for (const [, a, b] of edges) ids.add(a).add(b);
  return { nodes: [...ids].map((id) => ({ id })), edges: edges.map(([id, source, target]) => ({ id, source, target })) };
}

const EMPTY = g([]);
const SINGLE = g([], [1]);
/**
 * The Guide house: Entrance 1 – Hall 2; Hall – Bedroom 3, Bath 4, Living 5, Kitchen 6;
 * Living 5 – Kitchen 6 (a triangle Hall–Living–Kitchen).
 */
const HOUSE = g([
  [1, 1, 2],
  [2, 2, 3],
  [3, 2, 4],
  [4, 2, 5],
  [5, 2, 6],
  [6, 5, 6],
]);
/** A path 1–2–3–4 plus a separate pair 10–11. */
const SPLIT = g([
  [1, 1, 2],
  [2, 2, 3],
  [3, 3, 4],
  [9, 10, 11],
]);

describe('graph measures: node and edge', () => {
  it('degree, incident edges and neighbours', () => {
    expect(degree(HOUSE, 2)).toBe(5);
    expect(degree(HOUSE, 1)).toBe(1);
    expect(degree(HOUSE, 99)).toBeUndefined();
    expect(degree(SINGLE, 1)).toBe(0);
    expect(incidentEdgeIds(HOUSE, 6)).toEqual([5, 6]);
    expect(neighbourIds(HOUSE, 6)).toEqual([2, 5]);
    expect(neighbourIds(HOUSE, 99)).toEqual([]);
  });

  it('multi-edges count twice for degree but give one neighbour; a self-loop adds 2', () => {
    const multi = g([
      [1, 1, 2],
      [2, 2, 1],
      [3, 2, 2],
    ]);
    expect(degree(multi, 1)).toBe(2);
    expect(neighbourIds(multi, 1)).toEqual([2]);
    expect(degree(multi, 2)).toBe(4);
    expect(neighbourIds(multi, 2)).toEqual([1]);
  });

  it('shared neighbours and touching edges', () => {
    expect(sharedNeighbours(HOUSE, 6)).toEqual([2]);
    expect(sharedNeighbours(HOUSE, 1)).toEqual([]);
    expect(sharedNeighbours(HOUSE, 99)).toBeUndefined();
    expect(touchingEdges(HOUSE, 6)).toEqual([4, 5]);
    expect(touchingEdges(HOUSE, 1)).toEqual([2, 3, 4, 5]);
    expect(touchingEdges(HOUSE, 99)).toBeUndefined();
  });

  it('detour if removed: the way round, or splits the graph for a bridge', () => {
    expect(detourIfRemoved(HOUSE, 6)).toEqual({ path: { nodes: [5, 2, 6], edges: [4, 5] } });
    expect(detourIfRemoved(HOUSE, 1)).toEqual({ splits: true });
    expect(detourIfRemoved(HOUSE, 99)).toBeUndefined();
    // A parallel edge is a way round of one step.
    expect(detourIfRemoved(g([[1, 1, 2], [2, 1, 2]]), 1)).toEqual({ path: { nodes: [1, 2], edges: [2] } });
  });
});

describe('graph measures: network', () => {
  it('size, most connected (ties: all) and leaves', () => {
    expect(graphSize(HOUSE)).toEqual({ nodes: 6, edges: 6 });
    expect(graphSize(EMPTY)).toEqual({ nodes: 0, edges: 0 });
    expect(mostConnected(HOUSE)).toEqual({ degree: 5, nodes: [2] });
    expect(mostConnected(SPLIT)).toEqual({ degree: 2, nodes: [2, 3] });
    expect(mostConnected(EMPTY)).toBeNull();
    expect(mostConnected(SINGLE)).toEqual({ degree: 0, nodes: [1] });
    expect(leafNodes(HOUSE)).toEqual([1, 3, 4]);
    expect(leafNodes(SINGLE)).toEqual([]);
  });

  it('ignores edges to unknown nodes and duplicate edge ids', () => {
    const odd: MeasureGraph = { nodes: [{ id: 1 }, { id: 2 }], edges: [{ id: 1, source: 1, target: 2 }, { id: 1, source: 1, target: 2 }, { id: 2, source: 1, target: 7 }] };
    expect(graphSize(odd)).toEqual({ nodes: 2, edges: 1 });
    expect(degree(odd, 1)).toBe(1);
  });

  it('connected parts', () => {
    expect(connectedParts(HOUSE)).toEqual([[1, 2, 3, 4, 5, 6]]);
    expect(connectedParts(SPLIT)).toEqual([[1, 2, 3, 4], [10, 11]]);
    expect(connectedParts(EMPTY)).toEqual([]);
    expect(connectedParts(g([], [3, 1]))).toEqual([[1], [3]]);
  });

  it('bridges and cut nodes', () => {
    expect(bridges(HOUSE)).toEqual([1, 2, 3]);
    expect(cutNodes(HOUSE)).toEqual([2]);
    expect(bridges(SPLIT)).toEqual([1, 2, 3, 9]);
    expect(cutNodes(SPLIT)).toEqual([2, 3]);
    expect(bridges(EMPTY)).toEqual([]);
    expect(cutNodes(SINGLE)).toEqual([]);
    // A cycle has no bridges or cut nodes; parallel edges are never bridges.
    const cycle = g([[1, 1, 2], [2, 2, 3], [3, 3, 1]]);
    expect(bridges(cycle)).toEqual([]);
    expect(cutNodes(cycle)).toEqual([]);
    expect(bridges(g([[1, 1, 2], [2, 1, 2], [3, 2, 3]]))).toEqual([3]);
    // Two triangles sharing node 3: 3 is a cut node, no bridge.
    const bowtie = g([[1, 1, 2], [2, 2, 3], [3, 3, 1], [4, 3, 4], [5, 4, 5], [6, 5, 3]]);
    expect(cutNodes(bowtie)).toEqual([3]);
    expect(bridges(bowtie)).toEqual([]);
  });

  it('diameter: longest shortest path, within parts on a disconnected graph', () => {
    expect(diameter(HOUSE)).toEqual({ steps: 2, path: { nodes: [1, 2, 3], edges: [1, 2] }, parts: 1 });
    expect(diameter(SPLIT)).toEqual({ steps: 3, path: { nodes: [1, 2, 3, 4], edges: [1, 2, 3] }, parts: 2 });
    expect(diameter(SINGLE)).toEqual({ steps: 0, path: { nodes: [1], edges: [] }, parts: 1 });
    expect(diameter(EMPTY)).toBeNull();
  });

  it('most central node: smallest total steps; largest part only when disconnected', () => {
    expect(mostCentral(HOUSE)).toEqual({ nodes: [2], totalSteps: 5, partSize: 6, parts: 1 });
    // Path 1–2–3–4: nodes 2 and 3 tie (1+1+2 = 4).
    expect(mostCentral(SPLIT)).toEqual({ nodes: [2, 3], totalSteps: 4, partSize: 4, parts: 2 });
    expect(mostCentral(SINGLE)).toEqual({ nodes: [1], totalSteps: 0, partSize: 1, parts: 1 });
    expect(mostCentral(EMPTY)).toBeNull();
    // Equal-size parts: the part with the smallest id.
    expect(mostCentral(g([[1, 5, 6], [2, 1, 2]]))!.nodes).toEqual([1, 2]);
  });
});

describe('graph measures: queries', () => {
  it('shortest path with a deterministic tie-break by id', () => {
    // Square 1–2–4 and 1–3–4: both 2 steps; the lower ids win (via 2).
    const square = g([[1, 1, 3], [2, 1, 2], [3, 2, 4], [4, 3, 4]]);
    expect(shortestPath(square, 1, 4)).toEqual({ nodes: [1, 2, 4], edges: [2, 3] });
    expect(shortestPath(square, 4, 1)).toEqual({ nodes: [4, 2, 1], edges: [3, 2] });
    expect(shortestPath(HOUSE, 1, 6)).toEqual({ nodes: [1, 2, 6], edges: [1, 5] });
    expect(shortestPath(HOUSE, 3, 3)).toEqual({ nodes: [3], edges: [] });
    expect(shortestPath(SPLIT, 1, 10)).toBeNull();
    expect(shortestPath(HOUSE, 1, 99)).toBeNull();
  });

  it('reach within k steps', () => {
    const r = reachWithin(SPLIT, 1, 2)!;
    expect(r.nodes).toEqual([2, 3]);
    expect(r.edges).toEqual([1, 2]);
    expect(r.steps.get(3)).toBe(2);
    expect(reachWithin(SPLIT, 1, 0)!.nodes).toEqual([]);
    expect(reachWithin(SPLIT, 1, 10)!.nodes).toEqual([2, 3, 4]);
    expect(reachWithin(SPLIT, 99, 2)).toBeUndefined();
  });

  it('compares numbers numerically and before text', () => {
    expect([10, 2, 'b', 'a', 1].sort(compareIds)).toEqual([1, 2, 10, 'a', 'b']);
  });
});
