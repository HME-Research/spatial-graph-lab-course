import { GUIDE_TAB_IDS, type Explainer, type GuideTabId } from '../guideContracts';
import { LINKS } from './links';
import { withScreenshot } from './screenshots';

/** One Guide tab: its blocks (each block is an Explainer; `id` is the section anchor). */
export interface GuideTabContent {
  readonly tab: GuideTabId;
  readonly blocks: readonly Explainer[];
}


/**
 * The Guide text (Programme P4, item H; owner 2026-11-20: generic, two cases). Plain language,
 * answer first, one tiny example, one checked link. Explanations NEVER use the built-in example
 * house: they use small purpose-made examples (rooms A, B, C…, or a generic room word where a
 * Function is the point), and each concept shows two contrasting diagrams side by side
 * (`diagrams`, captioned) from `diagrams.tsx`. Panels and How-to entries are walkthroughs of the
 * real UI: they keep one numbered mock or step strip (`diagram`) that matches the numbered markers
 * of their screenshot (captured by `lab/scripts/guide-shots.mjs` into `lab/public/guide/` +
 * `screenshots.json`, attached by `withScreenshot`), plus a contrasting pair where the panel
 * sets a value with two clearly different results.
 */
const TEXT: readonly GuideTabContent[] = [
  {
    tab: 'graphs',
    blocks: [
      {
        id: 'what-is-a-graph',
        title: 'What is a graph?',
        summary: 'A graph is a set of elements (nodes) and the edges between them.',
        example: 'Four nodes A, B, C and D on their own are only a list. Add four edges, A–B, B–C, B–D and C–D, and they form a graph: it says which nodes are related, and nothing yet about walls or sizes (that comes from the geometry).',
        diagrams: [
          { diagram: 'graph-none', caption: '0 edges: four nodes, nothing related' },
          { diagram: 'graph-some', caption: '4 edges: a graph of who is related to whom' },
        ],
        learnMore: LINKS.ssGraph,
      },
      {
        id: 'nodes',
        title: 'Nodes',
        summary: 'A node is one element of the graph: in this app, each node becomes one room in the building, however big it is.',
        example: 'Node 1 stays one node whether its room fills one cell or four. Its number is its id: it never changes and is never reused, even if the node is moved, resized or deleted.',
        diagrams: [
          { diagram: 'node-one-cell', caption: 'One cell: node 1' },
          { diagram: 'node-four-cells', caption: 'Four cells: still one node, still 1' },
        ],
        learnMore: LINKS.brilliantGraph,
      },
      {
        id: 'edges',
        title: 'Edges',
        summary: 'An edge joins two nodes and says how they are related: in this app, its Relationship is Access or Open.',
        example: 'A–B with Access: a door between two separate rooms. A–B with Open: no wall, the two rooms are one space. Edges have no direction; “1 → 2” only shows which end is stored first.',
        diagrams: [
          { diagram: 'edge-access', caption: 'Access: a door (thin line)' },
          { diagram: 'edge-open', caption: 'Open: no wall (heavy line)' },
        ],
        learnMore: LINKS.ssAdjacent,
      },
      {
        id: 'attributes',
        title: 'Attributes',
        summary: 'Attributes are named values stored on a node or an edge, such as a room’s Function or its target area.',
        example: 'A node: function = bedroom, targetArea = 18 (m²). An edge: relationship = access. Every node has the same set of attributes, and so does every edge; only the values differ.',
        diagrams: [
          { diagram: 'attr-node', caption: 'On a node: its Function and other values' },
          { diagram: 'attr-edge', caption: 'On an edge: its Relationship and other values' },
        ],
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'same-graph-many-forms',
        title: 'A graph is data, not a drawing',
        summary: 'The same graph can be shown as a diagram, written as JSON text or listed in a table: it is still one graph.',
        example: 'Edge 1 is a line in Graph 2D, a record { "id": 1, "source": 1, "target": 2, "relationship": "access" } in the JSON, and a row in the Data view’s table. Select it in one and it is selected in all.',
        diagrams: [
          { diagram: 'form-diagram', caption: 'As a drawing: edge 1 is a line' },
          { diagram: 'form-data', caption: 'As data: a JSON record and a table row' },
        ],
        learnMore: LINKS.jsonOrg,
      },
      {
        id: 'graph-vs-space',
        title: 'An edge is not a corridor',
        summary: 'An edge says two rooms should be connected; the building grid decides whether and how that can be built.',
        example: 'A–B with Access. If A and B touch, there is a door in their shared wall. Move B one cell away and the app builds a corridor through the free cell; if no straight corridor fits, the edge is kept and marked Unresolved. An edge between two storeys is not a staircase.',
        diagrams: [
          { diagram: 'space-touching', caption: 'Touching: a door in the shared wall' },
          { diagram: 'space-apart', caption: 'One cell apart: a generated corridor' },
        ],
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
        example: 'A node shows its ID (Identity), its Function (Required), its Position and Size (Geometry), values such as Target area (Custom) and its Area (Calculated). An edge uses the same order: its ID and its two nodes, its Relationship, its Corridor, its own custom values. Properties, Attributes and the Data view all use these sections.',
        diagrams: [
          { diagram: 'sections-node', caption: 'A node: the five sections' },
          { diagram: 'sections-edge', caption: 'An edge: the same order' },
        ],
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-identity',
        title: 'Identity',
        summary: 'What makes an element itself: a whole-number id given by the app and, for an edge, the two nodes it joins. Locked.',
        example: 'Nodes 1, 2 and 3. Delete node 3 and add a new node: the new node becomes 4, not 3. Ids are never reused, so undo, other scenarios and your notes never point at the wrong node.',
        diagrams: [
          { diagram: 'ids-before', caption: 'Nodes 1, 2, 3' },
          { diagram: 'ids-after', caption: 'Delete 3, add one: it is 4' },
        ],
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-required',
        title: 'Required by the app',
        summary: 'What the app needs on every element: a Function for each node and a Relationship (Access or Open) for each edge.',
        example: 'The same node as a Bedroom or as a Kitchen: the Function sets its colour in every view and its look in the Building. An edge’s Relationship is Access (a door, or a floor opening between storeys) or Open (no wall). The toolkit supplies the list of Functions; add your own, or change a Function’s colour in every view, with Edit functions.',
        diagrams: [
          { diagram: 'fn-bedroom', caption: 'Function Bedroom: blue' },
          { diagram: 'fn-kitchen', caption: 'Function Kitchen: terracotta' },
        ],
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-geometry',
        title: 'Geometry',
        summary: 'Where a node is and how big it is, in grid cells of 3 × 3 m: Position x | y | z (Level) and Size x | y | z (Floors). For an edge: the look of its corridor.',
        example: 'Size 1 | 1 | 1 is one cell, 9 m²; Size 2 | 1 | 1 is two cells side by side, 18 m². In the JSON: "position": [2, 0, 0], "size": [2, 1, 1]. Every change is checked, so rooms never overlap. An edge’s Corridor (walls | roof | width) only matters when the app builds a corridor for it.',
        diagrams: [
          { diagram: 'geo-1cell', caption: 'Size 1 | 1 | 1: 9 m²' },
          { diagram: 'geo-2cell', caption: 'Size 2 | 1 | 1: 18 m²' },
        ],
        learnMore: LINKS.voxels,
      },
      {
        id: 'section-custom',
        title: 'Custom',
        summary: 'Attributes added by the toolkit or by you; every node (or every edge) has the same set. Saved in the JSON under "custom".',
        example: 'The House toolkit adds Target area and Priority, tagged Toolkit: House; they cannot be deleted, and a node shows its Function’s default (faded) until you type its own value. Add Daylight yourself and it is tagged Yours; you can delete it.',
        diagrams: [
          { diagram: 'custom-toolkit', caption: 'From the toolkit: defaults shown faded' },
          { diagram: 'custom-yours', caption: 'Yours: you added it, you can delete it' },
        ],
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'section-calculated',
        title: 'Calculated',
        summary: 'Values the app works out from the graph and the geometry: never typed, always up to date, and not saved in the JSON. Locked.',
        example: 'A node of one cell has an Area of 9 m²; make it 2 × 2 cells and its Area changes to 36 m² by itself. Only Area is shown at the start; add others, such as Degree or Exposed façade area, with + Add attribute › Calculated attribute.',
        diagrams: [
          { diagram: 'calc-1cell', caption: '1 cell: Area 9 m²' },
          { diagram: 'calc-4cells', caption: '2 × 2 cells: Area 36 m²' },
        ],
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
        example: 'Drag node B to tidy the diagram: room B stays where it is in the building. Positions in this diagram are only for drawing. An Open edge is drawn heavier than an Access edge.',
        diagrams: [
          { diagram: 'g2d-before', caption: 'Before the drag' },
          { diagram: 'g2d-after', caption: 'After: the diagram moved, the room did not' },
        ],
        learnMore: LINKS.ssConvexGraph,
      },
      {
        id: 'view-graph3d',
        title: 'Graph 3D',
        summary: 'The same graph placed in 3D: each node sits where its room is, so you see the edges between storeys.',
        example: 'In a one-storey design every node sits on level 0. Put node C on level 1 above B and the edge B–C stands upright between the two levels. Select here; move rooms in Voxels, Building, Plan or Properties. The levels icon shows one level only, or a level with the ones above taken off.',
        diagrams: [
          { diagram: 'g3d-one', caption: 'One storey: all on level 0' },
          { diagram: 'g3d-two', caption: 'Two storeys: a vertical edge' },
        ],
        learnMore: LINKS.spatialNetworks,
      },
      {
        id: 'view-voxels',
        title: 'Voxels',
        summary: 'Rooms as see-through cubes, one cube per grid cell, coloured by an attribute you choose.',
        example: 'Colour by Function to see the programme: one colour per Function. Colour by a number, such as Target area, to compare rooms: light for small values, dark for large. The levels icon shows one level only, or a level with the ones above taken off; a room on several levels is shown whole. With a node selected, the arrow keys move it one cell, PageUp/PageDown one storey, Shift+arrow resizes.',
        diagrams: [
          { diagram: 'vox-function', caption: 'By Function: one colour each' },
          { diagram: 'vox-number', caption: 'By a number: light to dark' },
        ],
        learnMore: LINKS.voxels,
      },
      {
        id: 'view-building',
        title: 'Building',
        summary: 'A 3D building made from the graph and the geometry: walls, doors, openings, windows and roofs.',
        example: 'Two touching rooms A and B. With Access between them: a door in the shared wall (a floor opening between storeys). Open: no wall. No edge: a solid wall or floor. A wall facing outside → a façade styled by the room’s Function; so is a wall between a closed room and an open one (a terrace or garden). Choose Level 0 only and turn Roofs off to look into that floor from above.',
        diagrams: [
          { diagram: 'bld-access', caption: 'Access: a door' },
          { diagram: 'bld-none', caption: 'No edge: a solid wall' },
        ],
        learnMore: LINKS.envelope,
      },
      {
        id: 'view-plan',
        title: 'Plan',
        summary: 'A floor plan of one storey, drawn from the same walls and openings as the Building view.',
        example: 'Level 0 of a small design: a door between A and B (Access), no wall between B and C (Open), and a dashed outline where room D stands on the level above. Choose Level 1 to see D. Turn on Edit rooms and drag a selected room, or its edges and corners, to move or resize it by whole cells, or use the arrow keys (Shift+arrow grows, Shift+Alt+arrow shrinks).',
        diagrams: [
          { diagram: 'plan-l0', caption: 'Level 0: dashed = what is above' },
          { diagram: 'plan-l1', caption: 'Level 1: the room upstairs' },
        ],
        learnMore: LINKS.floorPlan,
      },
      {
        id: 'view-data',
        title: 'Data',
        summary: 'The design as data: switch between the JSON text and a table. Selection is shared with every other view.',
        example: 'JSON shows the design as text, exactly as it is saved (read-only here). The table shows one row per node or edge: click a row and that element lights up in every view; click a cell to edit it. Faded values come from the Function’s default; locked columns are “Calculated, not saved”.',
        diagrams: [
          { diagram: 'data-json', caption: 'JSON: the saved text' },
          { diagram: 'data-table', caption: 'Table: rows to select and edit' },
        ],
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
        summary: 'The right-hand panel: every attribute of the selected node or edge, ready to edit.',
        example: 'Select a node: (1) its title, the Function with the node’s id, (2) its Function, (3) Position and Size, (4) Target area and Priority from the House toolkit. Select an edge to choose Access or Open.',
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
        summary: 'How the building looks: rooms are styled by one attribute, and each group gets a look card (façade, windows, roof). Generated corridors have their own section.',
        example: '(1) Style rooms by Function, (2) the Default card for every room without its own card, (3) + Style another function to give, say, kitchens their own look, (4) the Corridors section, for every generated corridor whatever the rooms are styled by: Walls Enclosed (its own side walls) or Open (a covered path), Roof Flat, Pergola or None, and Width in metres, centred in the corridor’s cells (default Open + Flat, 1.5 m).',
        diagrams: [
          { diagram: 'corr-enclosed', caption: 'Walls Enclosed: side walls' },
          { diagram: 'corr-open', caption: 'Walls Open: posts only' },
        ],
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
        summary: 'Transforms propose changes to your design (add nodes or edges, move or resize rooms, set values): you see a preview first, and only Apply changes the design, as one undo step.',
        example: '(1) Grow to target area, from the House toolkit, (2) its Houses parameter, (3) Run, (4) the preview, one line per node, (5) Apply or Discard. Before: every room one cell; after Apply: each room grown towards its target. At the top, Upload your own (.ts) adds your own transform under Yours, with or without a toolkit; its ⓘ offers AI kits and a template. If the design changes after Run, the preview is out of date: run it again.',
        diagrams: [
          { diagram: 'grow-before', caption: 'Before: every room 9 m²' },
          { diagram: 'grow-after', caption: 'After Apply: grown to the targets' },
        ],
        diagram: 'panel-transform',
      },
      {
        id: 'panel-scenarios',
        title: 'Scenarios',
        summary: 'Alternative versions of the design inside one project; each has its own graph and its own undo history.',
        example: '(1) Scenario 1, the one you work on, (2) a second scenario, e.g. a duplicate where you add a node, (3) + New scenario. Changing one scenario never changes another. Attributes and looks are shared by every scenario.',
        diagrams: [
          { diagram: 'scen-1', caption: 'Scenario 1: three nodes' },
          { diagram: 'scen-2', caption: 'Scenario 2: a node added; 1 unchanged' },
        ],
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
        example: '(1) Pick the view, e.g. Building, (2) turn Labels, Legend or Roofs on or off: with Roofs off you look into the rooms from above, (3) colour by Function or by another attribute. Which rooms get a roof is set in the Building Designer.',
        diagrams: [
          { diagram: 'roofs-on', caption: 'Roofs on: closed' },
          { diagram: 'roofs-off', caption: 'Roofs off: look in from above' },
        ],
        diagram: 'panel-display',
        learnMore: LINKS.projections,
      },
      {
        id: 'panel-project',
        title: 'Project',
        summary: 'Save, export and open projects; a project holds all its scenarios, attributes and looks.',
        example: '(1) Save locally keeps it in this browser, (2) Export project downloads one file to keep or hand in, (3) Open project reads such a file (or a single design JSON) back, (4) New project asks which toolkit to start from (No toolkit unless you choose one, e.g. House), (5) Open example… opens a built-in or toolkit example as a new project.',
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
        example: 'Without a toolkit a project is a plain graph: you add Functions and attributes yourself, and Transform lists only the transforms you upload. With a toolkit such as toolkits/house/ you start with its Functions in functions/ (each made with defineFunction), its custom attributes, its transforms in algorithms/ (Grow to target area), its example designs in designs/ and the façade files they use in assets/.',
        diagrams: [
          { diagram: 'tk-none', caption: 'No toolkit: you add everything' },
          { diagram: 'tk-house', caption: 'A toolkit: Functions, attributes, algorithms, designs' },
        ],
        learnMore: LINKS.typescript,
      },
      {
        id: 'house-toolkit',
        title: 'The House toolkit: Grow to target area',
        summary: 'Grows each room, one row or column of cells at a time, towards its target area, in priority order.',
        example: 'Targets: Entrance 9, Circulation 9, Living 36, Kitchen 18, Bedroom 18, Bath 9 m²; one cell = 3 × 3 m = 9 m². A Living room, a Bedroom and a Bath of one cell each: Living grows first, to 4 cells (36 m²), then Bedroom to 2 cells (18 m²); Bath is already 9 m². Nodes joined by edges form one house, and houses never touch: set Houses to 2 and the house is copied before everything grows.',
        diagrams: [
          { diagram: 'grow-before', caption: 'Before: one cell each' },
          { diagram: 'grow-after', caption: 'After: 36, 18 and 9 m²' },
        ],
        learnMore: LINKS.greedy,
      },
      {
        id: 'design-json',
        title: 'The design file (JSON)',
        summary: 'A design is saved as JSON text: a list of nodes and a list of edges, each with its values.',
        example: 'Node: "id", "function", "position": [x, y, z] (z = Level), "size": [x, y, z] (z = Floors), "custom": { your values }. Edge: "id", "source", "target", "relationship" ("access" or "open"), an optional "corridor" and "custom". Calculated values are not saved.',
        diagrams: [
          { diagram: 'json-node', caption: 'A node record' },
          { diagram: 'json-edge', caption: 'An edge record' },
        ],
        learnMore: LINKS.mdnJson,
      },
      {
        id: 'analysis-vs-transformation',
        title: 'Analyse vs Transform',
        summary: 'An analysis reads the graph and shows a result; a transform proposes a change you preview, Apply, and can undo.',
        example: 'Degree (an analysis) tells you a node has 3 edges; nothing changes. Grow to target area (a transform) shows the bigger rooms first; only Apply changes the design, and one Undo reverses it.',
        diagrams: [
          { diagram: 'avt-analyse', caption: 'Analyse: reads, nothing changes' },
          { diagram: 'avt-transform', caption: 'Transform: preview, Apply, Undo' },
        ],
        learnMore: LINKS.ocwAlgorithms,
      },
      {
        id: 'ask-ai-for-analysis',
        title: 'Write your own analysis (with an AI assistant)',
        summary: 'Describe an analysis in words; an AI assistant writes it as a .ts file using the Student API; upload it in Analyse.',
        example: 'Pick a tab below. Any project: a kit for an analysis that works everywhere (with node basics: Function, size, position, area; without: the graph only). This project: a kit that also lists your toolkit’s and your own fields. Attach the zip to an AI assistant and write your prompt, e.g. “The largest room on each level”. Or start from a template. Either way the file may import only @student-api and lists its inputs (which decide its section).',
        diagrams: [
          { diagram: 'route-ai', caption: 'With an AI kit: describe it' },
          { diagram: 'route-template', caption: 'From the template: write it yourself' },
        ],
        learnMore: LINKS.typescript,
        aiKits: true,
      },
      {
        id: 'ask-ai-for-transform',
        title: 'Write your own transform (with an AI assistant)',
        summary: 'Describe a transform in words; an AI assistant writes it as a .ts file using the Student API; upload it in Transform.',
        example: 'Pick a tab below. Any project: a kit for a transform that works everywhere (it reads Functions, sizes, positions and areas, and may add nodes and edges, move or resize rooms). This project: a kit that also lists your toolkit’s and your own fields. Attach the zip to an AI assistant and write your prompt, e.g. “Connect every two nodes that touch but have no edge yet”. Or start from the template. Either way the file may import only @student-api and ends with export default defineSpatialAlgorithm(…).',
        diagrams: [
          { diagram: 'route-ai-transform', caption: 'With an AI kit: describe it' },
          { diagram: 'route-template-transform', caption: 'From the template: write it yourself' },
        ],
        learnMore: LINKS.typescript,
        aiKits: 'transform',
      },
      {
        id: 'make-a-toolkit',
        title: 'Make your own toolkit (with an AI assistant)',
        summary: 'A toolkit is one folder, toolkits/<toolkit-id>/: an AI assistant can write it with you, in the repository or in a chat, and you push it on your own branch.',
        example: 'Pick a tab below. Coding agent: the agent works in your copy of the repository (for example Claude Code in VS Code), writes toolkits/<toolkit-id>/ and runs the checks. Chat assistant: download the toolkit kit, attach it to a chat, put the folder it gives you in toolkits/, run the checks, then commit only that folder and push the branch toolkit/<toolkit-id>, never main. The full guide is lab/docs/TOOLKITS.md.',
        diagrams: [
          { diagram: 'route-agent', caption: 'Coding agent: it works in the repository' },
          { diagram: 'route-chat', caption: 'Chat assistant: you put the folder in place' },
        ],
        learnMore: LINKS.typescript,
        windowSize: { width: 600, height: 640 },
        toolkitKit: true,
      },
    ],
  },
  {
    tab: 'how-to',
    blocks: [
      {
        id: 'howto-start',
        title: 'Start: a new project, a file or an example',
        summary: 'The Welcome screen creates an empty project, opens a file, or opens an example.',
        example: '1. Create project starts an empty graph; with a toolkit chosen beside it (e.g. House) its custom attributes are ready. 2. Open project reads a project or design file. 3. Open example… lists House – graph only (no toolkit) and every toolkit design. 4. Recent projects are listed below.',
        diagram: 'howto-start',
        learnMore: LINKS.jsonOrg,
      },
      {
        id: 'howto-open-example',
        title: 'Open an example',
        summary: 'Open example… opens a built-in or toolkit example as a new project, ready to explore; the project you had open is not changed.',
        example: '1. Open example… on Welcome or in Project. 2. Pick one: House – graph only (No toolkit), or a design under Toolkit: House: Simple house or Garden house. 3. It opens with its toolkit and custom attributes, its looks by Function, its corridors and any imported façade. 4. Set a view to Building to see it.',
        diagram: 'howto-open-example',
        learnMore: LINKS.envelope,
      },
      {
        id: 'howto-select-inspect',
        title: 'Select and inspect',
        summary: 'Click a node or edge in any view to select it; read and edit its values in Properties.',
        example: '1. Click a node in Graph 2D. 2. It is highlighted in every open view. 3. Properties (right) shows its five sections.',
        diagram: 'howto-select',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'howto-add-room',
        title: 'Add a node',
        summary: 'In Graph 2D press + Add node; the new node takes a free cell. Then set its Function, Position and Size. To copy a node, right-click it › Duplicate (or Ctrl+D wherever a node is selected): same Function, Size and values, in the closest free place, without edges.',
        example: '1. + Add node: a new node appears with the next free id. 2. In Properties choose its Function, e.g. Circulation. 3. Set Position and Size (cells of 3 × 3 m); a place that overlaps another room is refused with a reason.',
        diagram: 'howto-add-room',
        learnMore: LINKS.voxels,
      },
      {
        id: 'howto-connect',
        title: 'Connect two nodes (Access or Open)',
        summary: 'Select a node, choose Add edge…, click the second node, then choose Access or Open in Properties.',
        example: '1. Select node A. 2. Add edge… 3. Click node B. 4. Choose Access (a door, or a floor opening between storeys: the rooms stay separate) or Open (no wall: one open space). Rooms that touch with no edge get a solid wall; rooms joined by an edge that don’t touch get a corridor.',
        diagrams: [
          { diagram: 'edge-access', caption: 'Access: a door, two rooms' },
          { diagram: 'edge-open', caption: 'Open: no wall, one space' },
        ],
        diagram: 'howto-connect',
        learnMore: LINKS.openPlan,
      },
      {
        id: 'howto-add-attribute',
        title: 'Add an attribute',
        summary: 'Open Attributes in the left rail and press + Add attribute; every node (or edge) gets it.',
        example: '1. Attributes (left rail). 2. + Add attribute. 3. Custom attribute: name it “Daylight”, kind Choice, values high / low; it is tagged Yours. 4. Select a node and set its value in Properties.',
        diagram: 'howto-attribute',
        learnMore: LINKS.neo4jConcepts,
      },
      {
        id: 'howto-run-analysis',
        title: 'Run an analysis',
        summary: 'Select what it is about, open Analyse and press the measure; the answer appears and is highlighted in every view.',
        example: '1. Select a node. 2. Analyse. 3. Degree. 4. It shows how many edges the node has, and they light up in every view. 5. Clear removes the highlights. Your design never changes.',
        diagram: 'howto-analysis',
        learnMore: LINKS.ssConnectivity,
      },
      {
        id: 'howto-query',
        title: 'Ask a question with inputs (Queries)',
        summary: 'A query asks for its inputs one by one: pick nodes or edges in any view, type numbers.',
        example: '1. Open Queries. 2. Shortest path. 3. Pick From: a node. 4. Pick To: another node. 5. The route lights up and its steps are listed, e.g. 1 → 2 → 4 (2 steps). Esc cancels picking.',
        diagram: 'howto-query',
        learnMore: LINKS.bfs,
      },
      {
        id: 'howto-transform-undo',
        title: 'Run a transform and undo it',
        summary: 'Open Transform, run it, check the preview, then Apply; one Undo puts everything back.',
        example: 'With the House toolkit: 1. Transform. 2. Grow to target area. 3. Run. 4. The preview lists every node, e.g. “Living 2: 9 → 36 m² (target 36) ✓”. 5. Apply (or Discard). 6. Changed your mind? Undo reverses the whole change in one step.',
        diagram: 'howto-transform',
        learnMore: LINKS.greedy,
      },
      {
        id: 'howto-upload-analysis',
        title: 'Upload your own analysis',
        summary: 'At the top of Analyse, press Upload your own (.ts); the app checks the file and lists it with the tag Yours.',
        example: '1. Upload your own (.ts). 2. Its ⓘ offers the AI kits (Any project, This project) and the templates. 3. The analysis appears in Node, Edge, Network or Queries, depending on its inputs, and that section opens. A refused file gets a message saying why. Uploads are saved with your project.',
        diagram: 'howto-upload',
        learnMore: LINKS.typescript,
      },
      {
        id: 'howto-upload-transform',
        title: 'Upload your own transform',
        summary: 'At the top of Transform, press Upload your own (.ts); the app checks the file and lists it under Yours.',
        example: '1. Upload your own (.ts) in Transform. 2. Its ⓘ offers the transform kits (Any project, This project) and a template. 3. Choose it under Yours, set its parameters and Run. 4. Read the preview, then Apply (one Undo reverses it) or Discard. A refused file gets a message saying why; an analysis belongs in Analyse. Uploads are saved with your project.',
        diagram: 'howto-upload-transform',
        learnMore: LINKS.typescript,
      },
      {
        id: 'howto-read-data-view',
        title: 'Read and edit the Data view',
        summary: 'Set a view to Data, then switch between JSON and Table; click a row to select that element everywhere.',
        example: '1. Choose Data in a view’s menu. 2. JSON or Table. 3. Click a room’s row: it is selected in every view. 4. Locked columns are Identity and “Calculated, not saved”; click any other cell to edit it (one edit = one undo step).',
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
