import type { GraphId } from './types';

/**
 * Generic graph measures (Programme P4, Analyse). Pure functions over ids and endpoints only;
 * every edge is treated as UNDIRECTED (`source` / `target` order carries no meaning here).
 *
 * Conventions (documented in docs/DECISIONS.md, "Analyse measures"):
 * - Determinism: whenever several answers are equally good, ids are visited in ascending order
 *   (numbers numerically, text alphabetically), so the same graph always gives the same answer.
 *   Shortest paths are found by breadth-first search visiting neighbours in ascending
 *   (neighbour id, edge id) order; the first path found is returned.
 * - Multi-edges are allowed: two edges between the same nodes are two edges (degree 2, neither is
 *   a bridge). A self-loop adds 2 to its node's degree and is never a bridge or a path step.
 * - Edges whose endpoints are not nodes of the graph are ignored.
 * - Disconnected graphs: the diameter is the largest one found within any connected part; the
 *   most central node is chosen within the LARGEST connected part only (ties of size: the part
 *   with the smallest node id), because steps to unreachable nodes cannot be counted. Both report
 *   how many parts the graph has.
 */

/** Minimum graph shape the measures read. */
export interface MeasureGraph {
  readonly nodes: readonly { readonly id: GraphId }[];
  readonly edges: readonly { readonly id: GraphId; readonly source: GraphId; readonly target: GraphId }[];
}

/** A route: its nodes in order (from … to) and the edges between them. Steps = `edges.length`. */
export interface GraphPath {
  readonly nodes: readonly GraphId[];
  readonly edges: readonly GraphId[];
}

/** Ascending id order: numbers numerically, text alphabetically, numbers before text. */
export function compareIds(a: GraphId, b: GraphId): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

const sortIds = <T extends GraphId>(ids: Iterable<T>): T[] => [...ids].sort(compareIds);

interface Link {
  readonly node: GraphId;
  readonly edge: GraphId;
}

/** Neighbour lists per node, sorted by (neighbour id, edge id). Self-loops appear once. */
interface Adjacency {
  readonly ids: readonly GraphId[];
  readonly links: ReadonlyMap<GraphId, readonly Link[]>;
  readonly edges: ReadonlyMap<GraphId, { readonly source: GraphId; readonly target: GraphId }>;
}

const cache = new WeakMap<MeasureGraph, Adjacency>();

function adjacency(graph: MeasureGraph): Adjacency {
  const cached = cache.get(graph);
  if (cached) return cached;
  const ids = sortIds(new Set(graph.nodes.map((n) => n.id)));
  const links = new Map<GraphId, Link[]>(ids.map((id) => [id, []]));
  const edges = new Map<GraphId, { source: GraphId; target: GraphId }>();
  for (const e of graph.edges) {
    const a = links.get(e.source);
    const b = links.get(e.target);
    if (!a || !b || edges.has(e.id)) continue;
    edges.set(e.id, { source: e.source, target: e.target });
    a.push({ node: e.target, edge: e.id });
    if (e.source !== e.target) b.push({ node: e.source, edge: e.id });
  }
  for (const list of links.values()) list.sort((x, y) => compareIds(x.node, y.node) || compareIds(x.edge, y.edge));
  const result = { ids, links, edges };
  cache.set(graph, result);
  return result;
}

const has = (graph: MeasureGraph, nodeId: GraphId) => adjacency(graph).links.has(nodeId);

/** Number of nodes and (valid) edges. */
export function graphSize(graph: MeasureGraph): { readonly nodes: number; readonly edges: number } {
  const adj = adjacency(graph);
  return { nodes: adj.ids.length, edges: adj.edges.size };
}

/** Edges touching `nodeId` (ascending). Empty for an unknown node. */
export function incidentEdgeIds(graph: MeasureGraph, nodeId: GraphId): GraphId[] {
  return sortIds(new Set((adjacency(graph).links.get(nodeId) ?? []).map((l) => l.edge)));
}

/** Degree: the number of edge ends at `nodeId` (a self-loop counts 2). Undefined for an unknown node. */
export function degree(graph: MeasureGraph, nodeId: GraphId): number | undefined {
  const adj = adjacency(graph);
  const list = adj.links.get(nodeId);
  if (!list) return undefined;
  return list.reduce((sum, l) => sum + (l.node === nodeId ? 2 : 1), 0);
}

/** Distinct nodes joined to `nodeId` by an edge, excluding itself (ascending). */
export function neighbourIds(graph: MeasureGraph, nodeId: GraphId): GraphId[] {
  return sortIds(new Set((adjacency(graph).links.get(nodeId) ?? []).map((l) => l.node).filter((n) => n !== nodeId)));
}

/** The endpoints of an edge, or undefined for an unknown edge. */
export function edgeEnds(graph: MeasureGraph, edgeId: GraphId): { readonly source: GraphId; readonly target: GraphId } | undefined {
  return adjacency(graph).edges.get(edgeId);
}

/** Nodes joined to BOTH ends of the edge (never the ends themselves; ascending). Undefined for an unknown edge. */
export function sharedNeighbours(graph: MeasureGraph, edgeId: GraphId): GraphId[] | undefined {
  const ends = edgeEnds(graph, edgeId);
  if (!ends) return undefined;
  const b = new Set(neighbourIds(graph, ends.target));
  return neighbourIds(graph, ends.source).filter((n) => b.has(n) && n !== ends.source && n !== ends.target);
}

/** The other edges that share at least one node with the edge (ascending). Undefined for an unknown edge. */
export function touchingEdges(graph: MeasureGraph, edgeId: GraphId): GraphId[] | undefined {
  const ends = edgeEnds(graph, edgeId);
  if (!ends) return undefined;
  const out = new Set([...incidentEdgeIds(graph, ends.source), ...incidentEdgeIds(graph, ends.target)]);
  out.delete(edgeId);
  return sortIds(out);
}

interface Search {
  readonly distance: ReadonlyMap<GraphId, number>;
  /** How each reached node (except the start) was first reached. */
  readonly parent: ReadonlyMap<GraphId, Link>;
}

/** Breadth-first search from `start`, optionally without one edge and stopping after `maxSteps`. */
function search(graph: MeasureGraph, start: GraphId, options: { readonly skipEdge?: GraphId; readonly maxSteps?: number } = {}): Search {
  const { links } = adjacency(graph);
  const distance = new Map<GraphId, number>();
  const parent = new Map<GraphId, Link>();
  if (!links.has(start)) return { distance, parent };
  distance.set(start, 0);
  const queue: GraphId[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const d = distance.get(current)!;
    if (options.maxSteps !== undefined && d >= options.maxSteps) continue;
    for (const link of links.get(current)!) {
      if (link.edge === options.skipEdge || distance.has(link.node)) continue;
      distance.set(link.node, d + 1);
      parent.set(link.node, { node: current, edge: link.edge });
      queue.push(link.node);
    }
  }
  return { distance, parent };
}

function pathTo(found: Search, start: GraphId, target: GraphId): GraphPath | null {
  if (!found.distance.has(target)) return null;
  const nodes: GraphId[] = [target];
  const edges: GraphId[] = [];
  for (let at = target; at !== start; ) {
    const step = found.parent.get(at)!;
    edges.push(step.edge);
    nodes.push(step.node);
    at = step.node;
  }
  return { nodes: nodes.reverse(), edges: edges.reverse() };
}

/**
 * A shortest path (fewest edges) from `from` to `to`, or null when there is none or a node is
 * unknown. `from === to` gives a path of 0 steps. `skipEdge` searches as if that edge were removed.
 */
export function shortestPath(graph: MeasureGraph, from: GraphId, to: GraphId, options: { readonly skipEdge?: GraphId } = {}): GraphPath | null {
  if (!has(graph, from) || !has(graph, to)) return null;
  return pathTo(search(graph, from, options), from, to);
}

/**
 * Detour if the edge were removed: the shortest path between its ends without it, or
 * `{ splits: true }` when there is none (the edge is a bridge). Undefined for an unknown edge.
 * A self-loop's "detour" is 0 steps.
 */
export function detourIfRemoved(graph: MeasureGraph, edgeId: GraphId): { readonly path: GraphPath } | { readonly splits: true } | undefined {
  const ends = edgeEnds(graph, edgeId);
  if (!ends) return undefined;
  const path = shortestPath(graph, ends.source, ends.target, { skipEdge: edgeId });
  return path ? { path } : { splits: true };
}

/**
 * Nodes reachable from `start` in at most `k` steps (excluding `start`, ascending), with their
 * step counts and the edges of the breadth-first tree that reaches them. Undefined for an unknown node.
 */
export function reachWithin(
  graph: MeasureGraph,
  start: GraphId,
  k: number,
): { readonly nodes: readonly GraphId[]; readonly edges: readonly GraphId[]; readonly steps: ReadonlyMap<GraphId, number> } | undefined {
  if (!has(graph, start)) return undefined;
  const found = search(graph, start, { maxSteps: Math.max(0, Math.floor(k)) });
  const nodes = sortIds([...found.distance.keys()].filter((n) => n !== start));
  return { nodes, edges: sortIds([...found.parent.values()].map((l) => l.edge)), steps: found.distance };
}

/** Connected parts: each part's node ids ascending; parts ordered by their smallest id. */
export function connectedParts(graph: MeasureGraph): GraphId[][] {
  const seen = new Set<GraphId>();
  const parts: GraphId[][] = [];
  for (const id of adjacency(graph).ids) {
    if (seen.has(id)) continue;
    const part = [...search(graph, id).distance.keys()];
    for (const n of part) seen.add(n);
    parts.push(sortIds(part));
  }
  return parts;
}

/** Nodes with exactly one edge end (degree 1), ascending. */
export function leafNodes(graph: MeasureGraph): GraphId[] {
  return adjacency(graph).ids.filter((id) => degree(graph, id) === 1);
}

/** The highest degree and every node that has it (ascending), or null for an empty graph. */
export function mostConnected(graph: MeasureGraph): { readonly degree: number; readonly nodes: readonly GraphId[] } | null {
  const ids = adjacency(graph).ids;
  if (ids.length === 0) return null;
  const degrees = ids.map((id) => degree(graph, id)!);
  const best = Math.max(...degrees);
  return { degree: best, nodes: ids.filter((_, i) => degrees[i] === best) };
}

/** Bridges (edges whose removal splits a part) and cut nodes (articulation points), ascending. */
export function bridgesAndCutNodes(graph: MeasureGraph): { readonly bridges: readonly GraphId[]; readonly cutNodes: readonly GraphId[] } {
  const { ids, links } = adjacency(graph);
  const disc = new Map<GraphId, number>();
  const low = new Map<GraphId, number>();
  const bridges = new Set<GraphId>();
  const cuts = new Set<GraphId>();
  let time = 0;
  // Iterative Tarjan (no recursion limit). The parent EDGE (not node) is skipped, so a second
  // edge between the same nodes counts as a back edge and neither is a bridge.
  for (const root of ids) {
    if (disc.has(root)) continue;
    disc.set(root, time);
    low.set(root, time++);
    let rootChildren = 0;
    const stack: { node: GraphId; parentEdge: GraphId | undefined; next: number }[] = [{ node: root, parentEdge: undefined, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const list = links.get(frame.node)!;
      if (frame.next < list.length) {
        const { node: w, edge } = list[frame.next++]!;
        if (edge === frame.parentEdge || w === frame.node) continue;
        if (!disc.has(w)) {
          disc.set(w, time);
          low.set(w, time++);
          if (frame.node === root) rootChildren++;
          stack.push({ node: w, parentEdge: edge, next: 0 });
        } else low.set(frame.node, Math.min(low.get(frame.node)!, disc.get(w)!));
        continue;
      }
      stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) continue;
      low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node)! > disc.get(parent.node)!) bridges.add(frame.parentEdge!);
      if (parent.node !== root && low.get(frame.node)! >= disc.get(parent.node)!) cuts.add(parent.node);
    }
    if (rootChildren > 1) cuts.add(root);
  }
  return { bridges: sortIds(bridges), cutNodes: sortIds(cuts) };
}

/** Bridges: edges whose removal splits the graph (ascending). */
export const bridges = (graph: MeasureGraph): readonly GraphId[] => bridgesAndCutNodes(graph).bridges;

/** Cut nodes (articulation points): nodes whose removal splits the graph (ascending). */
export const cutNodes = (graph: MeasureGraph): readonly GraphId[] => bridgesAndCutNodes(graph).cutNodes;

/**
 * Diameter: the most steps of any shortest path, with one such path (the pair found first in
 * ascending id order). On a disconnected graph the largest value within any part, and `parts` > 1.
 * Null for an empty graph; a single node gives 0 steps.
 */
export function diameter(graph: MeasureGraph): { readonly steps: number; readonly path: GraphPath; readonly parts: number } | null {
  const ids = adjacency(graph).ids;
  if (ids.length === 0) return null;
  let best: { steps: number; from: GraphId; to: GraphId; found: Search } | null = null;
  for (const from of ids) {
    const found = search(graph, from);
    for (const to of ids) {
      const d = found.distance.get(to);
      if (d !== undefined && (best === null || d > best.steps)) best = { steps: d, from, to, found };
    }
  }
  const b = best!;
  return { steps: b.steps, path: pathTo(b.found, b.from, b.to)!, parts: connectedParts(graph).length };
}

/**
 * Most central node (closeness): the node(s) with the smallest total number of steps to every
 * other node, ascending. On a disconnected graph only the largest connected part is compared
 * (`partSize` nodes of `parts`). Null for an empty graph.
 */
export function mostCentral(
  graph: MeasureGraph,
): { readonly nodes: readonly GraphId[]; readonly totalSteps: number; readonly partSize: number; readonly parts: number } | null {
  const parts = connectedParts(graph);
  if (parts.length === 0) return null;
  const part = parts.reduce((a, b) => (b.length > a.length ? b : a));
  const totals = part.map((id) => [...search(graph, id).distance.values()].reduce((s, d) => s + d, 0));
  const totalSteps = Math.min(...totals);
  return { nodes: part.filter((_, i) => totals[i] === totalSteps), totalSteps, partSize: part.length, parts: parts.length };
}
