import type { Explainer } from '@app/ui/guideContracts';
import { LINKS } from '@app/ui/guide/links';

/**
 * Explainers of the Analyse and Transform tabs (Programme P4): one per Analyse section, one per
 * built-in analysis, and Analyse vs Transform. Plain language, answer first, one tiny example, one
 * checked link, and TWO contrasting diagrams side by side (`app/ui/guide/diagrams.tsx`), each with
 * a one-line caption (owner 2026-11-20). Generic analyses use graph vocabulary; the examples are
 * small purpose-made graphs of rooms A, B, C… (a row, a star, a loop, a fork), never the built-in
 * example house.
 */

/** Section explainers; `id` = `analyse-<section id>`. */
export const SECTION_EXPLAINERS: readonly Explainer[] = [
  {
    id: 'analyse-node',
    title: 'Node',
    summary: 'Measures about the node you have selected. An analysis lands here when its only input is one node.',
    example: 'In a row A–B–C that forks into D and E, select A: Degree 1, one neighbour. Select C instead: Degree 3, three neighbours. The same measures, a different node, a different answer.',
    diagrams: [
      { diagram: 'sec-node-leaf', caption: 'A selected: a dead end (1)' },
      { diagram: 'sec-node-hub', caption: 'C selected: a hub (3)' },
    ],
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'analyse-edge',
    title: 'Edge',
    summary: 'Measures about the edge you have selected and the two nodes it joins. An analysis lands here when its only input is one edge.',
    example: 'Five rooms in a row, A–B–C–D–E. Select the end relationship A–B: Routes through it is 1 · 4, it touches 1 other relationship, and its ends have 1 · 2 relationships. Select the middle one, B–C: 2 · 3, it touches 2, and its ends have 2 · 2.',
    diagrams: [
      { diagram: 'routes-end', caption: 'An end relationship: 1 · 4' },
      { diagram: 'routes-middle', caption: 'A middle one: 2 · 3' },
    ],
    learnMore: LINKS.ssAdjacent,
  },
  {
    id: 'analyse-network',
    title: 'Network',
    summary: 'Network = the whole graph: measures about all nodes and edges at once, with no input to pick.',
    example: 'How many rooms and relationships there are, which room is most connected, whether any part is cut off: five rooms all joined are 1 part; take away the relationship that links D and E to the rest and they become a second part.',
    diagrams: [
      { diagram: 'parts-one', caption: 'All joined: 1 part' },
      { diagram: 'parts-two', caption: 'Split: 2 parts' },
    ],
    learnMore: LINKS.ekBook,
  },
  {
    id: 'analyse-queries',
    title: 'Queries',
    summary: 'Measures that need inputs you pick: two nodes, a node and a number, or any other list. Pick nodes and edges in any view; type numbers.',
    example: 'Shortest path asks for From and To. In a row A–B–C–D, pick A and B: 1 step. Pick A and D: 3 steps. The current selection fills the first input when it fits; Esc cancels.',
    diagrams: [
      { diagram: 'path-short', caption: 'A to B: 1 step' },
      { diagram: 'path-long', caption: 'A to D: 3 steps' },
    ],
    learnMore: LINKS.bfs,
  },
];

/** Built-in analysis explainers; `id` = the built-in analysis id. */
export const ANALYSIS_EXPLAINERS: readonly Explainer[] = [
  {
    id: 'degree',
    title: 'Degree',
    summary: 'The number of edges a node has.',
    example: 'In a star of five rooms, an outer room has degree 1: a dead end, reached one way only. The centre has degree 4: a hub every route passes through. A high degree often marks a room people pass through.',
    diagrams: [
      { diagram: 'deg-1', caption: '1: a dead end' },
      { diagram: 'deg-4', caption: '4: a hub' },
    ],
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'neighbours',
    title: 'Neighbours',
    summary: 'The nodes joined to the selected node by an edge.',
    example: 'In a row A–B–C that forks into D and E, A has 1 neighbour (B); C has 3 (B, D and E): the rooms you can reach from it in one step.',
    diagrams: [
      { diagram: 'nb-1', caption: 'A: 1 neighbour' },
      { diagram: 'nb-3', caption: 'C: 3 neighbours' },
    ],
    learnMore: LINKS.ssAdjacent,
  },
  {
    id: 'routes-through',
    title: 'Routes through it',
    summary: 'Two numbers, one per end: how many nodes lie on each side of the edge. Shown as “first end’s side · second end’s side”. A node is on A’s side when it is nearer A than B: starting from B, a shortest route to it goes through this edge. The small line gives the trips between two nodes that use the edge.',
    example: 'Five rooms in a row, A–B–C–D–E. The end relationship A–B is 1 · 4: on one side only A, on the other the 4 rooms it leads to from A. The middle one, B–C, is 2 · 3. With no loops every trip from one side to the other uses it, so the trips are the product: 1 × 4 = 4 and 2 × 3 = 6 of the 10 pairs. In a loop a room can be equally near both ends (on neither side), and a trip with two equally short routes is shared, so the trips can have a decimal (e.g. 2.5). Many rooms on both sides means a busy route: a place for a wide door, a generous stair or a corridor. The views colour the two sides in two colours.',
    diagrams: [
      { diagram: 'routes-end', caption: 'An end relationship: 1 · 4, 4 trips' },
      { diagram: 'routes-middle', caption: 'A middle one: 2 · 3, 6 trips' },
    ],
    learnMore: LINKS.edgeBetweenness,
  },
  {
    id: 'touching-edges',
    title: 'Touching edges',
    summary: 'How many other edges share a node with the selected edge: the relationships you meet at either end of it.',
    example: 'In a row A–B–C that forks into D and E, A–B touches only B–C: 1. B–C touches A–B at B and both C–D and C–E at C: 3. Many touching edges means the relationship sits where several routes meet.',
    diagrams: [
      { diagram: 'touch-1', caption: 'A–B: 1' },
      { diagram: 'touch-3', caption: 'B–C: 3' },
    ],
    learnMore: LINKS.brilliantGraph,
  },
  {
    id: 'shared-neighbours',
    title: 'Shared neighbours',
    summary: 'How many nodes are joined to BOTH ends of the selected edge. Each one closes a loop of three, a triangle: a way round, so you do not have to go back the way you came.',
    example: 'A–B with a third room C joined to B only: 0. From A, the only way out is back through B the way you came. Join C to A as well: now C is joined to both, the answer is 1, and A, B and C form a loop you can walk round: A → B → C → A. Loops give a choice of route; space syntax calls a plan with many of them “ringy”.',
    diagrams: [
      { diagram: 'shared-0', caption: '0: no room joined to both' },
      { diagram: 'shared-1', caption: '1: C joined to both A and B, a loop' },
    ],
    learnMore: LINKS.ssRinginess,
  },
  {
    id: 'ends-connections',
    title: 'Ends’ connections',
    summary: 'How many edges each end of the selected edge has (its degree), shown as “first end · second end”. It tells you whether the edge links a hub to a dead end, two hubs, or two rooms on a line.',
    example: 'In a star, the relationship from the centre C to an outer room E is 4 · 1: a hub joined to a dead end, so E is reached only through C. In a row A–B–C–D, the middle relationship B–C is 2 · 2: two rooms on the way through.',
    diagrams: [
      { diagram: 'ends-hub-dead', caption: 'Hub–dead end: 4 · 1' },
      { diagram: 'ends-through', caption: 'Two pass-through rooms: 2 · 2' },
    ],
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'summary',
    title: 'Summary',
    summary: 'The size of the whole graph: how many nodes and how many edges it has.',
    example: 'Four rooms with three relationships: 4 · 3, one edge fewer than nodes, so (all in one part) there is no loop. Add a fourth relationship to close the square: 4 · 4, and there is a loop.',
    diagrams: [
      { diagram: 'sum-tree', caption: '4 nodes · 3 edges: no loop' },
      { diagram: 'sum-loop', caption: '4 nodes · 4 edges: one loop' },
    ],
    learnMore: LINKS.brilliantGraph,
  },
  {
    id: 'most-connected-node',
    title: 'Most connected node',
    summary: 'The node with the highest degree: the most edges.',
    example: 'In a row A–B–C–D, B and C tie with 2 edges each: no single centre. In a star, the centre has 4 edges: the room the others connect through, typical of a hub.',
    diagrams: [
      { diagram: 'mc-row', caption: 'A row: B and C tie (2)' },
      { diagram: 'mc-star', caption: 'A star: the centre (4)' },
    ],
    learnMore: LINKS.ssConnectivity,
  },
  {
    id: 'connected-parts',
    title: 'Connected parts',
    summary: 'How many separate groups the graph falls into; within a group every node can reach every other.',
    example: 'Five rooms all joined: 1 part. Remove the relationship that links D and E to the others: 2 parts. In one building, a second part means rooms you cannot reach from the rest; two houses on one site are two parts on purpose.',
    diagrams: [
      { diagram: 'parts-one', caption: '1 part' },
      { diagram: 'parts-two', caption: '2 parts' },
    ],
    learnMore: LINKS.ekGraphs,
  },
  {
    id: 'bridges',
    title: 'Bridges',
    summary: 'Edges that are the only link to part of the graph: remove one and the graph splits.',
    example: 'In a row A–B–C–D every relationship is a bridge (3): take one away and the row falls in two. Close it into a loop and there are none (0): every room can still be reached the other way round.',
    diagrams: [
      { diagram: 'bridges-row', caption: 'A row: 3 bridges' },
      { diagram: 'bridges-loop', caption: 'A loop: 0 bridges' },
    ],
    learnMore: LINKS.ekTies,
  },
  {
    id: 'cut-nodes',
    title: 'Cut nodes',
    summary: 'Nodes that hold the graph together: remove one and the graph splits.',
    example: 'In a row A–B–C–D, B and C are cut nodes (2): everyone going from one end to the other passes through them. In a loop there are none (0): remove any room and the rest are still joined.',
    diagrams: [
      { diagram: 'cut-row', caption: 'A row: 2 cut nodes' },
      { diagram: 'cut-loop', caption: 'A loop: 0' },
    ],
    learnMore: LINKS.ssBSpace,
  },
  {
    id: 'leaf-nodes',
    title: 'Leaf nodes',
    summary: 'Nodes with exactly one edge: dead ends.',
    example: 'In a loop of four rooms there are none (0): every room has two ways out. In a star, the four outer rooms are leaves (4). In a plan, dead ends are often the most private rooms, at the end of a route.',
    diagrams: [
      { diagram: 'leaf-loop', caption: 'A loop: 0 leaves' },
      { diagram: 'leaf-star', caption: 'A star: 4 leaves' },
    ],
    learnMore: LINKS.ssASpace,
  },
  {
    id: 'diameter',
    title: 'Diameter',
    summary: 'The largest number of steps you ever need between two nodes, always taking the shortest way.',
    example: 'In a star of five rooms no two rooms are more than 2 steps apart: the diameter is 2, a compact plan. Lay the same five rooms out in a row and the two ends are 4 steps apart: the diameter is 4, a deep, spread-out plan.',
    diagrams: [
      { diagram: 'diam-star', caption: 'A star: 2' },
      { diagram: 'diam-row', caption: 'A row: 4' },
    ],
    learnMore: LINKS.ssDepth,
  },
  {
    id: 'most-central-node',
    title: 'Most central node',
    summary: 'The node with the fewest steps, in total, to every other node.',
    example: 'In a row of five rooms the middle one, C, wins with 2 + 1 + 1 + 2 = 6 steps. In a star the centre wins with 1 step to each of the 4 others, 4 in total: even easier to reach. Space syntax calls the same idea integration: the most integrated space is the easiest to reach from everywhere.',
    diagrams: [
      { diagram: 'central-row', caption: 'A row: C, 6 steps in total' },
      { diagram: 'central-star', caption: 'A star: the centre, 4 steps' },
    ],
    learnMore: LINKS.ssIntegration,
  },
  {
    id: 'shortest-path',
    title: 'Shortest path',
    summary: 'The route with the fewest steps between two nodes you pick.',
    example: 'In a row A–B–C–D, from A to B is 1 step; from A to D is 3 steps, through B and C, even if D stands right above A (rooms without a relationship have a solid wall or floor between them). Counting steps from an entrance shows how deep, how private, each room is.',
    diagrams: [
      { diagram: 'path-short', caption: 'A to B: 1 step' },
      { diagram: 'path-long', caption: 'A to D: 3 steps' },
    ],
    learnMore: LINKS.bfs,
  },
  {
    id: 'reach-within-k',
    title: 'Reach within k steps',
    summary: 'All nodes you can reach from a chosen node in at most k steps.',
    example: 'In a row A–B–C–D–E, from A with k = 1 you reach only B. With k = 2 you also reach C. D and E are further away, so they are not included.',
    diagrams: [
      { diagram: 'reach-1', caption: 'k = 1: B' },
      { diagram: 'reach-2', caption: 'k = 2: B and C' },
    ],
    learnMore: LINKS.ssJustified,
  },
];

/** Analyse vs Transform (shown from both tabs). */
export const ANALYSE_VS_TRANSFORM: Explainer = {
  id: 'analysis-vs-transformation',
  title: 'Analyse vs Transform',
  summary: 'An analysis reads the graph and shows a result; a transform proposes a change you preview, Apply, and can undo.',
  example: 'Degree (an analysis) tells you a room has 3 edges; nothing changes. Grow to target area (a transform, House toolkit) shows the bigger rooms first; only Apply changes the design, and one Undo reverses it.',
  diagrams: [
    { diagram: 'avt-analyse', caption: 'Analyse: reads, nothing changes' },
    { diagram: 'avt-transform', caption: 'Transform: preview, Apply, Undo' },
  ],
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
