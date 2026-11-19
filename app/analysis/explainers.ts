import type { Explainer } from '@app/ui/guideContracts';

/**
 * Explainers of the Analyse and Transform tabs (Programme P4): one per Analyse section, one per
 * built-in analysis, and Analyse vs Transform. Text from the owner-reviewed Guide draft
 * (19 November 2026; "using the Student API"); final wording and the diagrams come with the Guide
 * content (item H), so `diagram` is left empty here. Plain language; rooms appear only as examples.
 */

/** Section explainers; `id` = `analyse-<section id>`. */
export const SECTION_EXPLAINERS: readonly Explainer[] = [
  {
    id: 'analyse-node',
    title: 'Node',
    summary: 'Measures about the node you have selected.',
    example: 'Select the Kitchen to see how many edges it has and which rooms it connects to.',
    learnMore: { label: 'Vertex (graph theory) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Vertex_(graph_theory)' },
  },
  {
    id: 'analyse-edge',
    title: 'Edge',
    summary: 'Measures about the edge you have selected and the two nodes it joins.',
    example: 'Select Living–Kitchen to see which rooms both connect to, or how long the way round would be without it.',
    learnMore: { label: 'Edge — Glossary of graph theory, Wikipedia', url: 'https://en.wikipedia.org/wiki/Glossary_of_graph_theory#edge' },
  },
  {
    id: 'analyse-network',
    title: 'Network',
    summary: 'Network = the whole graph: these are graph-level measures, about all nodes and edges at once.',
    example: 'How many rooms and edges the house has, which room is most connected, whether any part is cut off.',
    learnMore: { label: 'Network science — Wikipedia', url: 'https://en.wikipedia.org/wiki/Network_science' },
  },
  {
    id: 'analyse-queries',
    title: 'Queries',
    summary: 'Measures that need inputs you pick, such as two nodes or a number of steps.',
    example: 'Pick the Entrance and the Kitchen to find the shortest way between them.',
    learnMore: { label: 'Graph traversal — Wikipedia', url: 'https://en.wikipedia.org/wiki/Graph_traversal' },
  },
];

/** Built-in analysis explainers; `id` = the built-in analysis id. */
export const ANALYSIS_EXPLAINERS: readonly Explainer[] = [
  {
    id: 'degree',
    title: 'Degree',
    summary: 'The number of edges a node has.',
    example: 'The Hall has degree 5: it connects to the Entrance, Bedroom, Bath, Living and Kitchen. A high degree often marks a circulation space.',
    learnMore: { label: 'Degree (graph theory) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Degree_(graph_theory)' },
  },
  {
    id: 'neighbours',
    title: 'Neighbours',
    summary: 'The nodes joined to the selected node by an edge.',
    example: 'The Kitchen’s neighbours are the Hall and the Living room: the rooms you can reach in one step.',
    learnMore: { label: 'Neighbourhood (graph theory) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Neighbourhood_(graph_theory)' },
  },
  {
    id: 'shared-neighbours',
    title: 'Shared neighbours',
    summary: 'The nodes connected to both ends of the selected edge.',
    example: 'Living–Kitchen: the Hall connects to both, so the three rooms form a loop (a triangle).',
    learnMore: { label: 'Triadic closure — Wikipedia', url: 'https://en.wikipedia.org/wiki/Triadic_closure' },
  },
  {
    id: 'detour-if-removed',
    title: 'Detour if removed',
    summary: 'How many steps it would take to get from one end of the edge to the other if the edge were removed.',
    example: 'Remove Living–Kitchen: the way round is Living → Hall → Kitchen, 2 steps. If there is no way round, the edge is a bridge.',
    learnMore: { label: 'Shortest path problem — Wikipedia', url: 'https://en.wikipedia.org/wiki/Shortest_path_problem' },
  },
  {
    id: 'touching-edges',
    title: 'Touching edges',
    summary: 'The other edges that share a node with the selected edge.',
    example: 'Living–Kitchen touches Hall–Living and Hall–Kitchen: the other connections at its two rooms.',
    learnMore: { label: 'Adjacent — Glossary of graph theory, Wikipedia', url: 'https://en.wikipedia.org/wiki/Glossary_of_graph_theory#adjacent' },
  },
  {
    id: 'summary',
    title: 'Summary',
    summary: 'The size of the whole graph: how many nodes and how many edges it has.',
    example: 'This house has 6 nodes (rooms) and 6 edges (connections).',
    learnMore: { label: 'Dense graph — Wikipedia', url: 'https://en.wikipedia.org/wiki/Dense_graph' },
  },
  {
    id: 'most-connected-node',
    title: 'Most connected node',
    summary: 'The node with the highest degree — the most edges.',
    example: 'The Hall, with 5 edges: the room most others connect through, typical of a circulation hub.',
    learnMore: { label: 'Degree centrality — Centrality, Wikipedia', url: 'https://en.wikipedia.org/wiki/Centrality#Degree_centrality' },
  },
  {
    id: 'connected-parts',
    title: 'Connected parts',
    summary: 'How many separate groups the graph falls into, where every node in a group can reach the others.',
    example: 'A house plus a garden Studio–Store pair with no edge to the house: 2 parts. In a building, a second part means rooms you cannot reach from the rest.',
    learnMore: { label: 'Component (graph theory) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Component_(graph_theory)' },
  },
  {
    id: 'bridges',
    title: 'Bridges',
    summary: 'Edges that are the only link to part of the graph: remove one and the graph splits.',
    example: 'Hall–Bedroom is a bridge: it is the only way into the Bedroom. Living–Kitchen is not, because you can go round through the Hall.',
    learnMore: { label: 'Bridge (graph theory) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Bridge_(graph_theory)' },
  },
  {
    id: 'cut-nodes',
    title: 'Cut nodes',
    summary: 'Nodes that hold the graph together: remove one and the graph splits.',
    example: 'The Hall is a cut node: everyone must pass through it to reach the Bedroom or the Bath — typical of a hallway.',
    learnMore: { label: 'Cut vertex (articulation point) — Biconnected component, Wikipedia', url: 'https://en.wikipedia.org/wiki/Biconnected_component' },
  },
  {
    id: 'leaf-nodes',
    title: 'Leaf nodes',
    summary: 'Nodes with exactly one edge — dead ends.',
    example: 'The Entrance, Bedroom and Bath each have one connection. In a plan, leaves are often private rooms at the end of a route.',
    learnMore: { label: 'Leaf — Glossary of graph theory, Wikipedia', url: 'https://en.wikipedia.org/wiki/Glossary_of_graph_theory#leaf' },
  },
  {
    id: 'diameter',
    title: 'Diameter',
    summary: 'The largest number of steps you ever need between two nodes, always taking the shortest way.',
    example: 'From the Entrance to the Kitchen takes 3 steps (via Hall and Living); no pair is further apart, so the diameter is 3. A large diameter means a deep, spread-out plan.',
    learnMore: { label: 'Distance (graph theory) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Distance_(graph_theory)' },
  },
  {
    id: 'most-central-node',
    title: 'Most central node',
    summary: 'The node with the fewest steps, in total, to every other node (closeness centrality).',
    example: 'The Hall is 1 step from three rooms and 2 from the Kitchen. In space syntax, a similar idea is called integration: the most integrated space is the easiest to reach from everywhere.',
    learnMore: { label: 'Closeness centrality — Wikipedia', url: 'https://en.wikipedia.org/wiki/Closeness_centrality' },
  },
  {
    id: 'shortest-path',
    title: 'Shortest path',
    summary: 'The route with the fewest steps between two nodes you pick.',
    example: 'Entrance → Hall → Kitchen: 2 steps. Counting steps from the Entrance shows how deep (how private) each room is.',
    learnMore: { label: 'Shortest path problem — Wikipedia', url: 'https://en.wikipedia.org/wiki/Shortest_path_problem' },
  },
  {
    id: 'reach-within-k',
    title: 'Reach within k steps',
    summary: 'All nodes you can reach from a chosen node in at most k steps.',
    example: 'From the Entrance with k = 2: Hall, Bedroom and Living. The Kitchen is 3 steps away, so it is not included.',
    learnMore: { label: 'Breadth-first search — Brilliant', url: 'https://brilliant.org/wiki/breadth-first-search-bfs/' },
  },
];

/** Analyse vs Transform (shown from both tabs). */
export const ANALYSE_VS_TRANSFORM: Explainer = {
  id: 'analysis-vs-transformation',
  title: 'Analyse vs Transform',
  summary: 'An analysis reads the graph and shows a result; a transform proposes changes you preview, Apply, and can undo.',
  example: 'Degree (analysis) tells you the Hall has 5 edges — nothing changes. Grow to target area (transform) shows the bigger rooms first; only Apply changes the design, and one Undo reverses it.',
  learnMore: { label: 'Algorithm — Wikipedia', url: 'https://en.wikipedia.org/wiki/Algorithm' },
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
