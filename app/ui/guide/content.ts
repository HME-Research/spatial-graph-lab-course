import { GUIDE_TAB_IDS, type Explainer, type GuideTabId } from '../guideContracts';
import { LINKS } from './links';
import { withScreenshot } from './screenshots';

/** One Guide tab: its blocks (each block is an Explainer; `id` is the section anchor). */
export interface GuideTabContent {
  readonly tab: GuideTabId;
  readonly blocks: readonly Explainer[];
}

/** The AI kit zip (built by `npm run build:ai-kit`, served from `public/downloads/`). */
export const AI_KIT_URL = '/downloads/spatial-graph-lab-ai-kit.zip';

/**
 * The Guide text (Programme P4, item H; from the owner-reviewed draft of 19 November 2026). Plain
 * language, answer first, one tiny example, one diagram, one checked link. Every example uses ONE
 * house: the built-in example (`app/document/examples/house.json`), the same house as the House
 * toolkit's design — 1 Entrance, 2 Living, 3 Kitchen on the ground floor; 4 Bedroom over the Living
 * room and 5 Bath over the Entrance; Entrance–Living Access, Living–Kitchen Open, Living–Bedroom
 * Access, Bedroom–Bath Access. Diagrams: `diagrams.tsx`. Screenshots and their numbered markers are
 * captured by `scripts/guide-shots.mjs` into `public/guide/` + `screenshots.json` and attached by
 * `withScreenshot`; the marker numbers repeat the numbered steps of the example.
 */
const TEXT: readonly GuideTabContent[] = [
  {
    tab: 'graphs',
    blocks: [
      {
        id: 'what-is-a-graph',
        title: 'What is a graph?',
        summary: 'A graph is a set of elements (nodes) and the relationships between them (edges).',
        example: 'The example house: each of its five rooms is a node; “you can go from the Entrance to the Living room” is an edge. The graph alone says nothing about walls or sizes: that comes from the geometry.',
        diagram: 'house-graph',
        learnMore: LINKS.ssGraph,
      },
      {
        id: 'nodes',
        title: 'Nodes',
        summary: 'A node is one element of the graph: in this app, one room.',
        example: 'The Living room is node 2. Its number is its id: it never changes and is never reused, even if the room is moved, resized or deleted.',
        diagram: 'node',
        learnMore: LINKS.brilliantGraph,
      },
      {
        id: 'edges',
        title: 'Edges',
        summary: 'An edge joins two nodes and says how they are related: in this app, a relationship between two rooms.',
        example: 'Edge 1 joins the Entrance (1) and the Living room (2). Its Relationship is Access: a door between them. Edges have no direction; “1 → 2” only shows which end is stored first.',
        diagram: 'edge',
        learnMore: LINKS.ssAdjacent,
      },
      {
        id: 'attributes',
        title: 'Attributes',
        summary: 'Attributes are named values stored on a node or an edge, such as a room’s Function or its target area.',
        example: 'Living: function = living, targetArea = 36 (m², from the House toolkit). The Living–Kitchen edge: relationship = open.',
        diagram: 'attributes',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'same-graph-many-forms',
        title: 'A graph is data, not a drawing',
        summary: 'The same graph can be shown as a diagram, written as JSON text or listed in a table: it is still one graph.',
        example: 'Edge 1 is a line in Graph 2D, a record { "id": 1, "source": 1, "target": 2, "relationship": "access" } in the JSON, and a row in the Data view’s table. Select it in one and it is selected in all.',
        diagram: 'same-graph-three-ways',
        learnMore: LINKS.jsonOrg,
      },
      {
        id: 'graph-vs-space',
        title: 'An edge is a relationship, not a corridor',
        summary: 'An edge says two rooms should be connected; the building grid decides whether and how that can be built.',
        example: 'Living–Kitchen (Open): the rooms touch, so there is no wall between them. Move the Kitchen one cell away and the app builds a corridor through the free cell; if no straight corridor fits, the relationship is kept and marked Unresolved. A relationship between two storeys is not a staircase.',
        diagram: 'graph-vs-space',
        learnMore: LINKS.ssConvexGraph,
      },
    ],
  },
  {
    tab: 'attributes',
    blocks: [
      {
        id: 'attribute-sections',
        title: 'The five sections',
        summary: 'Every node and edge lists its attributes in five sections, always in this order: Identity, Required by the app, Geometry, Custom, Calculated.',
        example: 'The Living room shows ID 2 (Identity), Function Living (Required), its Position and Size (Geometry), Target area and Priority (Custom) and its Area (Calculated). Properties, Attributes and the Data view all use these sections.',
        diagram: 'sections-all',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-identity',
        title: 'Identity',
        summary: 'What makes an element itself: a whole-number id given by the app and, for an edge, the two nodes it joins. Locked.',
        example: 'Delete the Bath (5) and add a new room: the new room becomes 6, not 5. Ids are never reused, so undo, other scenarios and your notes never point at the wrong room.',
        diagram: 'section-identity',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-required',
        title: 'Required by the app',
        summary: 'What the app needs on every element: a Function for each node and a Relationship (Access or Open) for each edge.',
        example: 'The Living room’s Function is Living, which sets its colour and façade. Entrance–Living is Access (a door, or a floor opening between storeys); Living–Kitchen is Open (no wall). The toolkit supplies the list of Functions; add your own with Edit functions.',
        diagram: 'section-required',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-geometry',
        title: 'Geometry',
        summary: 'Where a room is and how big it is, in grid cells of 3 × 3 m: Position x | y | z (Level) and Size x | y | z (Floors). For an edge: the look of its corridor.',
        example: 'Living: Position 1 | 1 | 0, Size 1 | 1 | 1 = one cell = 9 m². In the JSON: "position": [1, 1, 0], "size": [1, 1, 1]. Every change is checked, so rooms never overlap. An edge’s Corridor (walls | roof) only matters when the app builds a corridor for it.',
        diagram: 'section-geometry',
        learnMore: LINKS.voxels,
      },
      {
        id: 'section-custom',
        title: 'Custom',
        summary: 'Attributes added by the toolkit or by you; every node (or every edge) has the same set. Saved in the JSON under "custom".',
        example: 'The House toolkit adds Target area and Priority, tagged Toolkit: House; they cannot be deleted. Add Daylight yourself and it is tagged Yours; you can delete it. A room shows its Function’s default (faded) until you type its own value.',
        diagram: 'section-custom',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-calculated',
        title: 'Calculated',
        summary: 'Values the app works out from the graph and the geometry: never typed, always up to date, and not saved in the JSON. Locked.',
        example: 'Make the Living room 2 × 2 cells and its Area changes from 9 m² to 36 m² by itself. Only Area is shown at the start; add others, such as Degree or Exposed façade area, with + Add attribute › Calculated attribute.',
        diagram: 'section-calculated',
        learnMore: LINKS.gia,
      },
    ],
  },
  {
    tab: 'views',
    blocks: [
      {
        id: 'view-graph2d',
        title: 'Graph 2D',
        summary: 'The graph as a flat diagram of circles and lines: the place to add, connect and delete.',
        example: 'Drag the Living circle to tidy the diagram: the Living room stays where it is in the building. Positions in this diagram are only for drawing. An Open relationship is drawn heavier than Access.',
        diagram: 'view-graph2d',
        learnMore: LINKS.ssConvexGraph,
      },
      {
        id: 'view-graph3d',
        title: 'Graph 3D',
        summary: 'The same graph placed in 3D: each node sits where its room is, so you see the edges between storeys.',
        example: 'The Living room (level 0) and the Bedroom above it (level 1) are joined by a vertical edge. Select here; move rooms with the arrows or in Properties.',
        diagram: 'view-graph3d',
        learnMore: LINKS.spatialNetworks,
      },
      {
        id: 'view-voxels',
        title: 'Voxels',
        summary: 'Rooms as see-through cubes, one cube per grid cell, coloured by an attribute you choose.',
        example: 'Each room of the example is one cube; after Grow to target area the Living room is four. Colour by Function to see the programme, or by Target area to compare rooms.',
        diagram: 'view-voxels',
        learnMore: LINKS.voxels,
      },
      {
        id: 'view-building',
        title: 'Building',
        summary: 'A 3D building made from the graph and the geometry: walls, doors, openings, windows and roofs.',
        example: 'Access between two touching rooms → a door in the shared wall (a floor opening between storeys). Open → no wall. Touching but no relationship → a solid wall or floor, like the floor between the Entrance and the Bath. A wall facing outside → a façade styled by the room’s Function.',
        diagram: 'view-building',
        learnMore: LINKS.envelope,
      },
      {
        id: 'view-plan',
        title: 'Plan',
        summary: 'A floor plan of one storey, drawn from the same walls and openings as the Building view.',
        example: 'Level 0: a door between the Entrance and the Living room (Access) and no wall between the Living room and the Kitchen (Open). Choose Level 1 to see the Bedroom and the Bath; dashed lines show what is above.',
        diagram: 'view-plan',
        learnMore: LINKS.floorPlan,
      },
      {
        id: 'view-data',
        title: 'Data',
        summary: 'The design as data: switch between the JSON text and a table. Selection is shared with every other view.',
        example: 'Click the Living row: the Living room lights up in Graph 2D and the Building. In the table, faded values come from the Function’s default; locked columns are “Calculated, not saved”. Click a cell to edit it (the JSON stays read-only).',
        diagram: 'view-data',
        learnMore: LINKS.mdnJson,
      },
    ],
  },
  {
    tab: 'panels',
    blocks: [
      {
        id: 'panel-properties',
        title: 'Properties',
        summary: 'The right-hand panel: every attribute of the selected room or relationship, ready to edit.',
        example: 'Select the Living room: (1) Room 2, (2) its Function, (3) Position and Size, (4) Target area and Priority from the House toolkit. Select a relationship to choose Access or Open.',
        diagram: 'panel-properties',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'panel-attributes',
        title: 'Attributes',
        summary: 'Which attributes every node (or every edge) has, in the five sections; add or remove your own here.',
        example: '(1) Node or Edge, (2) the list, with Target area and Priority tagged Toolkit: House and Area tagged Calculated, (3) + Add attribute for a Custom or a Calculated attribute.',
        diagram: 'panel-attributes',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'panel-designer',
        title: 'Building Designer',
        summary: 'How the building looks: rooms are styled by one attribute, and each group gets a look card (façade, windows, roof).',
        example: '(1) Style rooms by Function, (2) the Default card for every room without its own card, (3) the Corridors (generated) card: Walls Enclosed or Open, Roof Flat, Pergola or None, and Width in metres, centred in the corridor’s cells (default Open + Flat, 1.5 m), (4) + Style another function to give, say, the Kitchen its own look.',
        diagram: 'panel-designer',
        learnMore: LINKS.envelope,
      },
      {
        id: 'panel-analyse',
        title: 'Analyse',
        summary: 'Measures that read the graph and show a result; they never change your design.',
        example: '(1) Upload your own (.ts), (2) Show: All, Built-in, Toolkit or Yours, (3) Node and (4) Edge run on the current selection, (5) Network reads the whole graph, (6) Queries ask you to pick inputs. The inputs decide the section: none → Network; one node → Node; one edge → Edge; anything else → Queries, picked in any view.',
        diagram: 'panel-analyse',
        learnMore: LINKS.ekBook,
      },
      {
        id: 'panel-transform',
        title: 'Transform',
        summary: 'Algorithms that propose a change to your design: preview first, then Apply as one undo step.',
        example: '(1) Grow to target area, from the House toolkit, (2) its Houses parameter, (3) Run, (4) the preview, one line per room, (5) Apply or Discard. Without a toolkit this panel is empty.',
        diagram: 'panel-transform',
        learnMore: LINKS.ocwAlgorithms,
      },
      {
        id: 'panel-scenarios',
        title: 'Scenarios',
        summary: 'Alternative versions of the design inside one project; each has its own graph and its own undo history.',
        example: '(1) Scenario 1, the one you work on, (2) a duplicate called “Grown” where you run Grow to target area, (3) + New scenario. Attributes and looks are shared by every scenario.',
        diagram: 'panel-scenarios',
        learnMore: LINKS.options,
      },
      {
        id: 'panel-camera',
        title: 'Camera',
        summary: 'Save and recall views of a 3D viewport, per scenario.',
        example: '(1) Choose the target viewport, e.g. 2 · Building, (2) name and save the current view, (3) recall it later from Saved cameras.',
        diagram: 'panel-camera',
        learnMore: LINKS.projections,
      },
      {
        id: 'panel-display',
        title: 'Display',
        summary: 'How each view is drawn: labels, legend, roofs, colours and lighting. Appearance only: it never changes the design.',
        example: '(1) Pick the view, e.g. Building, (2) turn Labels, Legend or Roofs on or off, (3) colour by Function or by another attribute. Which rooms get a roof is set in the Building Designer.',
        diagram: 'panel-display',
        learnMore: LINKS.projections,
      },
      {
        id: 'panel-project',
        title: 'Project',
        summary: 'Save, export and open projects; a project holds all its scenarios, attributes and looks.',
        example: '(1) Save locally keeps it in this browser, (2) Export project downloads one file to keep or hand in, (3) Open project reads such a file (or a single design JSON) back, (4) New project asks which toolkit to start from (No toolkit unless you choose one, e.g. House), (5) Open example… opens the example house or a toolkit design as a new project.',
        diagram: 'panel-project',
        learnMore: LINKS.jsonOrg,
      },
    ],
  },
  {
    tab: 'toolkits',
    blocks: [
      {
        id: 'what-is-a-toolkit',
        title: 'What is a toolkit?',
        summary: 'A toolkit is a folder that gives the app a vocabulary: Functions, the custom attributes they use, algorithms that read them and example designs.',
        example: 'toolkits/house/ has six Functions in functions/ (each made with defineFunction), the custom attributes targetArea and priority, the transform Grow to target area in algorithms/, the example house and a finished House showcase in designs/, and the façade file the showcase uses in assets/. Without a toolkit, the built-in example is the same house as a plain graph.',
        diagram: 'toolkit',
        learnMore: LINKS.typescript,
      },
      {
        id: 'house-toolkit',
        title: 'The House toolkit: Grow to target area',
        summary: 'Grows each room, one row or column of cells at a time, towards its target area, in priority order.',
        example: 'Targets: Entrance 9, Circulation 9, Living 36, Kitchen 18, Bedroom 18, Bath 9 m²; one cell = 3 × 3 m = 9 m². On the example, Living grows first to 36 m², then the Kitchen and the Bedroom to 18 m²; nothing is blocked. Rooms joined by relationships form one house, and houses never touch: set Houses to 2 and House 1 is copied before everything grows.',
        diagram: 'grow-to-target-area',
        learnMore: LINKS.greedy,
      },
      {
        id: 'design-json',
        title: 'The design file (JSON)',
        summary: 'A design is saved as JSON text: a list of nodes and a list of edges, each with its values.',
        example: 'Node: "id", "function", "position": [x, y, z] (z = Level), "size": [x, y, z] (z = Floors), "custom": { your values }. Edge: "id", "source", "target", "relationship" ("access" or "open"), an optional "corridor" and "custom". Calculated values are not saved.',
        diagram: 'design-json',
        learnMore: LINKS.mdnJson,
      },
      {
        id: 'analysis-vs-transformation',
        title: 'Analyse vs Transform',
        summary: 'An analysis reads the graph and shows a result; a transform proposes a change you preview, Apply, and can undo.',
        example: 'Degree (an analysis) tells you the Living room has 3 edges; nothing changes. Grow to target area (a transform) shows the bigger rooms first; only Apply changes the design, and one Undo reverses it.',
        diagram: 'analyse-vs-transform',
        learnMore: LINKS.ocwAlgorithms,
      },
      {
        id: 'ask-ai-for-analysis',
        title: 'Write your own analysis (with an AI assistant)',
        summary: 'Describe a graph measure in words; an AI assistant writes it as a .ts file using the Student API; upload it in Analyse.',
        example: 'Download the AI kit, give the whole folder to an AI assistant and fill in YOUR-PROMPT.md, e.g. “For each room, how many steps is it from the Entrance?”. The file may import only @student-api, sees only node ids and edges, and lists its inputs (which decide its section). Or start from the template yourself.',
        diagram: 'ask-ai',
        learnMore: LINKS.typescript,
        downloads: [
          { label: 'AI kit (.zip)', fileName: 'spatial-graph-lab-ai-kit.zip', href: AI_KIT_URL },
          {
            label: 'Template analysis (.ts)',
            fileName: 'graph-analysis-template.ts',
            load: () => import('../../../docs/templates/graph-analysis-template.ts?raw').then((m) => m.default),
          },
        ],
      },
    ],
  },
  {
    tab: 'how-to',
    blocks: [
      {
        id: 'howto-start',
        title: 'Start: the example, a new project or a file',
        summary: 'The Welcome screen opens the example house, creates an empty project, or opens a file.',
        example: '1. Try example opens the house (no toolkit). 2. Create project starts an empty graph; with a toolkit chosen beside it (e.g. House) its custom attributes are ready. 3. Open project reads a project or design file. 4. Open example… lists the example house and every toolkit design. 5. Recent projects are listed below.',
        diagram: 'howto-start',
        learnMore: LINKS.jsonOrg,
      },
      {
        id: 'howto-open-example',
        title: 'Open an example',
        summary: 'Open example… opens the example house or a toolkit’s design as a new project, ready to explore; the project you had open is not changed.',
        example: '1. Open example… on Welcome or in Project. 2. Pick one: House – graph only (No toolkit), or a design tagged Toolkit: House, e.g. House showcase. 3. It opens with its toolkit and custom attributes, its looks by Function, its corridors and any imported façade (the showcase’s Bedrooms use one). 4. Set a view to Building to see it.',
        diagram: 'howto-open-example',
        learnMore: LINKS.envelope,
      },
      {
        id: 'howto-select-inspect',
        title: 'Select and inspect',
        summary: 'Click a node or edge in any view to select it; read and edit its values in Properties.',
        example: '1. Click the Living room (2) in Graph 2D. 2. It is highlighted in every open view. 3. Properties (right) shows its five sections.',
        diagram: 'howto-select',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'howto-add-room',
        title: 'Add a room',
        summary: 'In Graph 2D press + Add node; the new room takes a free cell. Then set its Function, Position and Size. To copy a room, right-click it › Duplicate (or Ctrl+D): same Function, Size and values, in the closest free place, without relationships.',
        example: '1. + Add node: room 6 appears. 2. In Properties choose its Function, e.g. Circulation. 3. Set Position and Size (cells of 3 × 3 m); a place that overlaps another room is refused with a reason.',
        diagram: 'howto-add-room',
        learnMore: LINKS.voxels,
      },
      {
        id: 'howto-connect',
        title: 'Connect two rooms (Access or Open)',
        summary: 'Select a room, choose Add connection…, click the second room, then choose Access or Open in Properties.',
        example: '1. Select the Entrance (1). 2. Add connection… 3. Click the Bath (5). 4. Choose Access (a door, or a floor opening between storeys: the rooms stay separate) or Open (no wall: one open space, like Living–Kitchen). Rooms that touch with no relationship get a solid wall; related rooms that don’t touch get a corridor.',
        diagram: 'howto-connect',
        learnMore: LINKS.openPlan,
      },
      {
        id: 'howto-add-attribute',
        title: 'Add an attribute',
        summary: 'Open Attributes in the left rail and press + Add attribute; every node (or edge) gets it.',
        example: '1. Attributes (left rail). 2. + Add attribute. 3. Custom attribute: name it “Daylight”, kind Choice, values high / low; it is tagged Yours. 4. Select a room and set its value in Properties.',
        diagram: 'howto-attribute',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'howto-run-analysis',
        title: 'Run an analysis',
        summary: 'Select what it is about, open Analyse and press the measure; the answer appears and is highlighted in every view.',
        example: '1. Select the Living room. 2. Analyse. 3. Degree. 4. It shows 3, and the Living room’s three edges light up in every view. 5. Clear removes the highlights. Your design never changes.',
        diagram: 'howto-analysis',
        learnMore: LINKS.ssConnectivity,
      },
      {
        id: 'howto-query',
        title: 'Ask a question with inputs (Queries)',
        summary: 'A query asks for its inputs one by one: pick nodes or edges in any view, type numbers.',
        example: '1. Open Queries. 2. Shortest path. 3. Pick From: the Entrance. 4. Pick To: the Bath. 5. The route Entrance → Living → Bedroom → Bath (3 steps) lights up, although the Bath is right above the Entrance. Esc cancels picking.',
        diagram: 'howto-query',
        learnMore: LINKS.bfs,
      },
      {
        id: 'howto-transform-undo',
        title: 'Run a transform and undo it',
        summary: 'Open Transform, run it, check the preview, then Apply; one Undo puts everything back.',
        example: 'With the House toolkit: 1. Transform. 2. Grow to target area. 3. Run. 4. The preview lists every room, e.g. “Living 2: 9 → 36 m² (target 36) ✓”. 5. Apply (or Discard). 6. Changed your mind? Undo reverses the whole change in one step.',
        diagram: 'howto-transform',
        learnMore: LINKS.greedy,
      },
      {
        id: 'howto-upload-analysis',
        title: 'Upload your own analysis',
        summary: 'At the top of Analyse, press Upload your own (.ts); the app checks the file and lists it with the tag Yours.',
        example: '1. Upload your own (.ts). 2. Its ⓘ offers the AI kit and the template. 3. The analysis appears in Node, Edge, Network or Queries, depending on its inputs, and that section opens. A refused file gets a message saying why. Uploads are saved with your project.',
        diagram: 'howto-upload',
        learnMore: LINKS.typescript,
      },
      {
        id: 'howto-read-data-view',
        title: 'Read and edit the Data view',
        summary: 'Set a view to Data, then switch between JSON and Table; click a row to select that element everywhere.',
        example: '1. Choose Data in a view’s menu. 2. JSON or Table. 3. Click the Living row: it is selected in every view. 4. Locked columns are Identity and “Calculated, not saved”; click any other cell to edit it (one edit = one undo step).',
        diagram: 'howto-data',
        learnMore: LINKS.mdnJson,
      },
      {
        id: 'howto-save',
        title: 'Save, export and open',
        summary: 'Your last session is kept automatically; Save locally keeps a project in this browser and Export project gives you a file.',
        example: '1. Project (left rail). 2. Save locally. 3. Export project downloads one file with every scenario. 4. Open project reads it back as a separate copy.',
        diagram: 'howto-save',
        learnMore: LINKS.jsonOrg,
      },
    ],
  },
];

/** The Guide content, with the captured screenshots attached. */
export const GUIDE_CONTENT: readonly GuideTabContent[] = TEXT.map((t) => ({ ...t, blocks: t.blocks.map(withScreenshot) }));

export function guideTabContent(tab: GuideTabId, content: readonly GuideTabContent[] = GUIDE_CONTENT): GuideTabContent | undefined {
  return content.find((c) => c.tab === tab);
}

/** Tabs that have no content entry (a check for the real content, used by tests). */
export function tabsWithoutContent(content: readonly GuideTabContent[] = GUIDE_CONTENT): GuideTabId[] {
  return GUIDE_TAB_IDS.filter((t) => !content.some((c) => c.tab === t));
}
