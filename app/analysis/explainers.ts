import type { Explainer } from '@app/ui/guideContracts';
import { LINKS } from '@app/ui/guide/links';

/**
 * Explainers of the Analyse and Transform tabs (Programme P4): one per Analyse section, one per
 * built-in analysis, and Analyse vs Transform. Plain language, answer first, one tiny example, one
 * diagram (`app/ui/guide/diagrams.tsx`), one checked link. Generic analyses use graph vocabulary;
 * rooms appear only in the examples, and every example is the built-in example house
 * (1 Entrance, 2 Living, 3 Kitchen; 4 Bedroom over the Living room, 5 Bath over the Entrance;
 * Entrance–Living, Living–Kitchen (Open), Living–Bedroom, Bedroom–Bath). The house has no loops:
 * every relationship is the only way between its two rooms.
 */

/** Section explainers; `id` = `analyse-<section id>`. */
export const SECTION_EXPLAINERS: readonly Explainer[] = [
  {
    id: 'analyse-node',
    title: 'Node',
    summary: 'Measures about the node you have selected. An analysis lands here when its only input is one node.',
    example: 'Select the Living room to see how many edges it has (3) and which rooms it connects to.',
    diagram: 'section-node',
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'analyse-edge',
    title: 'Edge',
    summary: 'Measures about the edge you have selected and the two nodes it joins. An analysis lands here when its only input is one edge.',
    example: 'Select Living–Bedroom: 6 of the 10 trips between rooms use it, it touches 3 other relationships, no room is joined to both its ends (0), and its ends have 3 · 2 relationships.',
    diagram: 'section-edge',
    learnMore: LINKS.ssAdjacent,
  },
  {
    id: 'analyse-network',
    title: 'Network',
    summary: 'Network = the whole graph: measures about all nodes and edges at once, with no input to pick.',
    example: 'How many rooms and relationships the house has (5 and 4), which room is most connected (Living), whether any part is cut off (no: 1 part).',
    diagram: 'section-network',
    learnMore: LINKS.ekBook,
  },
  {
    id: 'analyse-queries',
    title: 'Queries',
    summary: 'Measures that need inputs you pick: two nodes, a node and a number, or any other list. Pick nodes and edges in any view; type numbers.',
    example: 'Shortest path asks for From and To: pick the Entrance, then the Bath. The current selection fills the first input when it fits; Esc cancels.',
    diagram: 'section-queries',
    learnMore: LINKS.bfs,
  },
];

/** Built-in analysis explainers; `id` = the built-in analysis id. */
export const ANALYSIS_EXPLAINERS: readonly Explainer[] = [
  {
    id: 'degree',
    title: 'Degree',
    summary: 'The number of edges a node has.',
    example: 'The Living room has degree 3: it connects to the Entrance, the Kitchen and the Bedroom. A high degree often marks a room people pass through.',
    diagram: 'degree',
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'neighbours',
    title: 'Neighbours',
    summary: 'The nodes joined to the selected node by an edge.',
    example: 'The Living room’s neighbours are the Entrance, the Kitchen and the Bedroom: the rooms you can reach in one step.',
    diagram: 'neighbours',
    learnMore: LINKS.ssAdjacent,
  },
  {
    id: 'routes-through',
    title: 'Routes through it',
    summary: 'Two numbers, one per end: how many nodes lie on each side of the edge. Shown as “first end’s side · second end’s side”. A node is on A’s side when it is nearer A than B: starting from B, a shortest route to it goes through this edge. The small line gives the trips between two nodes that use the edge.',
    example: 'Five rooms in a row, A–B–C–D–E. The end relationship A–B is 1 · 4: from B it leads only to A, from A it leads to the 4 others. The middle relationship B–C is 2 · 3: from C it leads to A and B, from B to C, D and E. With no loops, every trip from one side to the other must use it, so the trips are the product: 1 × 4 = 4 and 2 × 3 = 6 of the 10 pairs. In a loop a room can be equally near both ends (it is on neither side), and pairs with two equally short routes share their trip between them, so the trips can have a decimal (e.g. 2.5). A relationship with many rooms on both sides is a busy route: a place for a wide door, a generous stair or a corridor. The views colour the two sides in two colours.',
    diagram: 'routes-through',
    learnMore: LINKS.edgeBetweenness,
  },
  {
    id: 'touching-edges',
    title: 'Touching edges',
    summary: 'How many other edges share a node with the selected edge: the relationships you meet at either end of it.',
    example: 'Living–Bedroom: 3. It touches Entrance–Living and Living–Kitchen at the Living room, and Bedroom–Bath at the Bedroom. Many touching edges means the relationship sits where several routes meet.',
    diagram: 'touching-edges',
    learnMore: LINKS.brilliantGraph,
  },
  {
    id: 'shared-neighbours',
    title: 'Shared neighbours',
    summary: 'How many nodes are joined to BOTH ends of the selected edge. Each one closes a loop of three, a triangle: a way round, so you do not have to go back the way you came.',
    example: 'Living–Kitchen in the example house: 0. No room is related to both the Living room and the Kitchen, so from the Kitchen the only way out is back through the Living room. Add a relationship Entrance–Kitchen: now the Entrance is joined to both, the answer is 1, and Entrance, Living and Kitchen form a loop: you can walk Entrance → Living → Kitchen → Entrance instead of turning back. Loops give a choice of route; space syntax calls a plan with many of them “ringy”.',
    diagram: 'shared-neighbours',
    learnMore: LINKS.ssRinginess,
  },
  {
    id: 'ends-connections',
    title: 'Ends’ connections',
    summary: 'How many edges each end of the selected edge has (its degree), shown as “first end · second end”. It tells you whether the edge links a hub to a dead end, two hubs, or two rooms on a line.',
    example: 'Living–Kitchen: 3 · 1. The Living room has 3 relationships (a hub); the Kitchen has only this one (a dead end), so the Kitchen is reached only through the Living room. Bedroom–Bath is 2 · 1: the Bath is a dead end behind the Bedroom.',
    diagram: 'ends-connections',
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'summary',
    title: 'Summary',
    summary: 'The size of the whole graph: how many nodes and how many edges it has.',
    example: 'The example house has 5 nodes (rooms) and 4 edges (relationships): one edge fewer than nodes, all in one part, so it has no loops.',
    diagram: 'summary',
    learnMore: LINKS.brilliantGraph,
  },
  {
    id: 'most-connected-node',
    title: 'Most connected node',
    summary: 'The node with the highest degree: the most edges.',
    example: 'The Living room, with 3 edges: the room the others connect through, typical of a hub.',
    diagram: 'most-connected-node',
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'connected-parts',
    title: 'Connected parts',
    summary: 'How many separate groups the graph falls into; within a group every node can reach every other.',
    example: 'The example house is 1 part. Run Grow to target area with Houses = 2 and the copy, House 2, has no relationship to House 1: 2 parts. In one building, a second part means rooms you cannot reach from the rest.',
    diagram: 'connected-parts',
    learnMore: LINKS.ekGraphs,
  },
  {
    id: 'bridges',
    title: 'Bridges',
    summary: 'Edges that are the only link to part of the graph: remove one and the graph splits.',
    example: 'In the example house all 4 relationships are bridges, because it has no loops. Living–Bedroom, for instance, is the only way upstairs.',
    diagram: 'bridges',
    learnMore: LINKS.ekTies,
  },
  {
    id: 'cut-nodes',
    title: 'Cut nodes',
    summary: 'Nodes that hold the graph together: remove one and the graph splits.',
    example: 'The Living room and the Bedroom. Everyone going to the Kitchen or upstairs passes through the Living room; the Bath can only be reached through the Bedroom.',
    diagram: 'cut-nodes',
    learnMore: LINKS.ssBSpace,
  },
  {
    id: 'leaf-nodes',
    title: 'Leaf nodes',
    summary: 'Nodes with exactly one edge: dead ends.',
    example: 'The Entrance, the Kitchen and the Bath each have one relationship. In a plan, dead ends are often the most private rooms, at the end of a route.',
    diagram: 'leaf-nodes',
    learnMore: LINKS.ssASpace,
  },
  {
    id: 'diameter',
    title: 'Diameter',
    summary: 'The largest number of steps you ever need between two nodes, always taking the shortest way.',
    example: 'From the Entrance to the Bath takes 3 steps (Living, Bedroom, Bath), and no pair is further apart: the diameter is 3. A large diameter means a deep, spread-out plan.',
    diagram: 'diameter',
    learnMore: LINKS.ssDepth,
  },
  {
    id: 'most-central-node',
    title: 'Most central node',
    summary: 'The node with the fewest steps, in total, to every other node.',
    example: 'The Living room: 1 step to the Entrance, the Kitchen and the Bedroom and 2 to the Bath, 5 in total. Space syntax calls the same idea integration: the most integrated space is the easiest to reach from everywhere.',
    diagram: 'most-central-node',
    learnMore: LINKS.ssIntegration,
  },
  {
    id: 'shortest-path',
    title: 'Shortest path',
    summary: 'The route with the fewest steps between two nodes you pick.',
    example: 'Entrance → Living → Bedroom → Bath: 3 steps, although the Bath is right above the Entrance (they have no relationship, so the floor between them is solid). Counting steps from the Entrance shows how deep, how private, each room is.',
    diagram: 'shortest-path',
    learnMore: LINKS.bfs,
  },
  {
    id: 'reach-within-k',
    title: 'Reach within k steps',
    summary: 'All nodes you can reach from a chosen node in at most k steps.',
    example: 'From the Entrance with k = 2: the Living room (1 step), the Kitchen and the Bedroom (2 steps). The Bath is 3 steps away, so it is not included.',
    diagram: 'reach-within-k',
    learnMore: LINKS.ssJustified,
  },
];

/** Analyse vs Transform (shown from both tabs). */
export const ANALYSE_VS_TRANSFORM: Explainer = {
  id: 'analysis-vs-transformation',
  title: 'Analyse vs Transform',
  summary: 'An analysis reads the graph and shows a result; a transform proposes a change you preview, Apply, and can undo.',
  example: 'Degree (an analysis) tells you the Living room has 3 edges; nothing changes. Grow to target area (a transform, House toolkit) shows the bigger rooms first; only Apply changes the design, and one Undo reverses it.',
  diagram: 'analyse-vs-transform',
  learnMore: LINKS.ocwAlgorithms,
};

/** The explainer of an Analyse section. */
export const sectionExplainer = (section: string): Explainer | undefined => SECTION_EXPLAINERS.find((e) => e.id === `analyse-${section}`);

/** The explainer of a built-in analysis. */
export const analysisExplainer = (id: string): Explainer | undefined => ANALYSIS_EXPLAINERS.find((e) => e.id === id);

/** "Start (a node), Steps (a number)" — the inputs of an analysis in words. */
export function describeInputs(inputs: readonly { readonly kind: 'node' | 'edge' | 'number'; readonly label: string }[]): string {
  if (inputs.length === 0) return 'none: it reads the whole graph';
  return inputs.map((i) => `${i.label} (${i.kind === 'node' ? 'a node' : i.kind === 'edge' ? 'an edge' : 'a number'})`).join(', ');
}

/**
 * The ⓘ of an uploaded analysis, built from its own definition: its label, its description (or a
 * plain fallback), its inputs and the file it came from. No diagram or link.
 */
export function uploadedExplainer(upload: {
  readonly uploadId: string;
  readonly fileName: string;
  readonly definition: { readonly label: string; readonly description?: string; readonly inputs: readonly { readonly kind: 'node' | 'edge' | 'number'; readonly label: string }[] };
}): Explainer {
  const { label, description, inputs } = upload.definition;
  return {
    id: `yours-${upload.uploadId}`,
    title: label,
    summary: description ?? 'Your own analysis (it has no description: add `description: "…"` to its definition).',
    example: `Inputs: ${describeInputs(inputs)}. Uploaded from ${upload.fileName}.`,
  };
}
