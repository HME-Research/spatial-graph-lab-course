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
    example: 'Select Living–Kitchen to see whether there is another way between the two rooms if it were removed (there is none).',
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
    id: 'shared-neighbours',
    title: 'Shared neighbours',
    summary: 'Rooms related to both rooms of the selected relationship: each one closes a small loop you can walk round.',
    example: 'In the example house the answer is 0 for every relationship: it has no loops. Add a relationship Entrance–Kitchen and Living–Kitchen gets one shared neighbour, the Entrance: you can now walk Living → Kitchen → Entrance → Living, so Living–Kitchen is no longer the only way between the two rooms.',
    diagram: 'shared-neighbours',
    learnMore: LINKS.ssRinginess,
  },
  {
    id: 'detour-if-removed',
    title: 'Detour if removed',
    summary: 'How many steps it would take from one end of the edge to the other if the edge were removed.',
    example: 'Remove Living–Kitchen: there is no other way into the Kitchen, so the answer is “splits the graph”. That is true for every relationship of the example house; with an extra relationship Entrance–Kitchen the detour would be Living → Entrance → Kitchen, 2 steps.',
    diagram: 'detour-if-removed',
    learnMore: LINKS.ekTies,
  },
  {
    id: 'touching-edges',
    title: 'Touching edges',
    summary: 'The other edges that share a node with the selected edge.',
    example: 'Living–Bedroom touches Entrance–Living and Living–Kitchen (at the Living room) and Bedroom–Bath (at the Bedroom).',
    diagram: 'touching-edges',
    learnMore: LINKS.brilliantGraph,
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
