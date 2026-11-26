/**
 * The "Learn more" links of the Guide and the explainers, in one place (Programme P4, item H).
 * Every URL was fetched on 19 November 2026 and checked to load and to be on topic. Owner rule: no
 * Wikipedia (guideContent.test.ts fails if a Wikipedia address appears in app/, docs/ or toolkits/).
 */
export interface LearnMoreLink {
  readonly label: string;
  readonly url: string;
}

const SS = 'https://www.spacesyntax.online/term';
const EK = 'https://www.cs.cornell.edu/home/kleinber/networks-book';

export const LINKS = {
  // Graphs, in architectural terms (Space Syntax Online glossary, UCL Space Syntax Network).
  ssGraph: { label: 'Graph — Space Syntax glossary', url: `${SS}/graph/` },
  ssAdjacent: { label: 'Adjacent space — Space Syntax glossary', url: `${SS}/adjacent-spaces/` },
  ssConvexGraph: { label: 'Convex adjacency graph — Space Syntax glossary', url: `${SS}/convex-adjacency-graph/` },
  ssConnectivity: { label: 'Connectivity — Space Syntax glossary', url: `${SS}/connectivity/` },
  ssIntegration: { label: 'Integration — Space Syntax glossary', url: `${SS}/integration/` },
  ssDepth: { label: 'Depth — Space Syntax glossary', url: `${SS}/depth/` },
  ssJustified: { label: 'Justified graph — Space Syntax glossary', url: `${SS}/justified-map-graph/` },
  ssRinginess: { label: 'Ringiness (rings of movement) — Space Syntax glossary', url: `${SS}/ringiness/` },
  ssASpace: { label: 'a-type space (dead end) — Space Syntax glossary', url: `${SS}/a-space-or-a-type-space/` },
  ssBSpace: { label: 'b-type space (on the way to a dead end) — Space Syntax glossary', url: `${SS}/b-space-or-b-type-space/` },
  ssTotalDepth: { label: 'Total depth — Space Syntax glossary', url: `${SS}/total-depth/` },
  // Graph theory.
  brilliantGraph: { label: 'Graph theory — Brilliant', url: 'https://brilliant.org/wiki/graph-theory/' },
  bfs: { label: 'Breadth-first search — Brilliant', url: 'https://brilliant.org/wiki/breadth-first-search-bfs/' },
  greedy: { label: 'Greedy algorithms — Brilliant', url: 'https://brilliant.org/wiki/greedy-algorithm/' },
  ekBook: { label: 'Networks, Crowds, and Markets — Easley & Kleinberg (free book)', url: `${EK}/` },
  ekGraphs: { label: 'Graphs: paths, components, distance (ch. 2) — Easley & Kleinberg', url: `${EK}/networks-book-ch02.pdf` },
  ekTies: { label: 'Bridges, local bridges and triangles (ch. 3) — Easley & Kleinberg', url: `${EK}/networks-book-ch03.pdf` },
  spatialNetworks: { label: 'Spatial networks — M. Barthelemy (review, arXiv)', url: 'https://arxiv.org/abs/1010.0302' },
  neo4jConcepts: { label: 'Nodes, relationships and properties — Neo4j graph concepts', url: 'https://neo4j.com/docs/getting-started/appendix/graphdb-concepts/' },
  edgeBetweenness: { label: 'Edge betweenness — NetworkX documentation', url: 'https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.centrality.edge_betweenness_centrality.html' },
  ocwAlgorithms: { label: 'Introduction to Algorithms — MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/' },
  // Architecture and representation.
  voxels: { label: 'Voxels — Tapestry reader, University of Washington (Architecture)', url: 'https://courses.washington.edu/arch481/1.Tapestry%20Reader/1.3D%20Data/1.Types/4.Voxels.html' },
  envelope: { label: 'Building envelope — Designing Buildings', url: 'https://www.designingbuildings.co.uk/wiki/Building_envelope' },
  floorPlan: { label: 'Floor plan — Designing Buildings', url: 'https://www.designingbuildings.co.uk/wiki/Floor_plan' },
  gia: { label: 'Gross internal area — Designing Buildings', url: 'https://www.designingbuildings.co.uk/wiki/Gross_internal_area' },
  openPlan: { label: 'Open plan v cellular buildings — Designing Buildings', url: 'https://www.designingbuildings.co.uk/wiki/Open_plan' },
  options: { label: 'Options appraisal — Designing Buildings', url: 'https://www.designingbuildings.co.uk/wiki/Options_appraisal' },
  projections: { label: 'Drawing projections — Designing Buildings', url: 'https://www.designingbuildings.co.uk/wiki/Axonometric_projection' },
  // Data and code.
  jsonOrg: { label: 'Introducing JSON — json.org', url: 'https://www.json.org/json-en.html' },
  mdnJson: { label: 'Working with JSON — MDN', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON' },
  typescript: { label: 'TypeScript for the new programmer — typescriptlang.org', url: 'https://www.typescriptlang.org/docs/handbook/typescript-from-scratch.html' },
} as const satisfies Record<string, LearnMoreLink>;

/**
 * The student tutorial (`tutorial/` at the repository root, owner 2026-11-25): step-by-step pages
 * for every way of working, served by the app at this address (vite.config.ts copies them into the
 * build). Opened in a new tab so the app keeps its state.
 */
export const TUTORIAL_URL = '/tutorial/01-start-here.html';

/** A page of the student tutorial by its file name, e.g. `tutorialPage('05-your-own-transform')` → `/tutorial/05-your-own-transform.html`. */
export const tutorialPage = (name: string): string => TUTORIAL_URL.replace(/[^/]+\.html$/, `${name}.html`);
