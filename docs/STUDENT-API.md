# Student API (schema-v2 data, numeric ids)

How to write your own functions, designs and algorithms for Spatial Graph Lab. Your code lives in **one toolkit folder** and imports **only** `@student-api`.

> Status (Stage 3B): the app activates your toolkit, opens its default design, uses its functions in the inspector and its façades in the Architecture view, and runs its algorithms from the **Algorithms** panel. See [Workflow](#workflow) for the step-by-step version.

## Workflow

1. **Create a toolkit.** Make a folder `toolkits/my-toolkit/` (lowercase letters, digits, `-` and `_`, starting with a letter) with a `toolkit.ts` (see [Your toolkit folder](#1-your-toolkit-folder)). Once the reference toolkit `toolkits/house/` exists, you can copy it instead; don't edit it itself.
2. **Define a function.** Edit or add a file in `functions/` (see [Functions](#2-functions)). The `id` is the `function` your designs use.
3. **Write an algorithm.** Add a file in `algorithms/`: `defineGraphAlgorithm` for an analysis that only reads the graph, `defineDesignAnalysis` for an analysis that also reads the rooms themselves, or `defineSpatialAlgorithm` for a transformation that returns operations (see [Algorithms](#4-algorithms)).
4. **Check it.** `npm run check:toolkit -- -t my-toolkit` loads your toolkit exactly as the app does and fails with a readable message if a definition or design is invalid, if a design uses a façade file that is not in `assets/`, or if an algorithm fails on your default design. `npm run typecheck` checks your TypeScript.
5. **Run the app.** `npm run dev`, then open the printed URL with `?toolkit=my-toolkit` (for example `http://localhost:5173/?toolkit=my-toolkit`), or choose your toolkit when you create a new project. The header shows a problem count; the **Project** section of the left rail lists every problem in your toolkit files and keeps it visible until you fix it (the page reloads when you save a file).
6. **Run an algorithm.** Analyses are in **Analyse**, transformations in **Transform** (left rail).
   - An *analysis* appears in the Analyse section its inputs decide (tagged `Toolkit: <name>`): **Node** and **Edge** analyses run on the selected node or edge; a **Queries** analysis asks you to pick each input in any view (Esc cancels). The answer is shown big, with its nodes and edges highlighted in every view. **Clear** removes it. It never changes the design.
   - A *transformation* (Transform) shows a **preview**: the rooms, connections and attribute values it would add or change. Nothing changes until you press **Apply**. **Discard** throws the preview away. If you edit the design after running, the preview can no longer be applied: run it again.
   - Disabled algorithms (invalid definitions) are marked **disabled**; select one to see why.
7. **Edit attributes.** Select a room or relationship: **Properties** (right) lists every project field with its value and where it comes from (set here, the function's default, the field default). Add, rename or delete fields in the **Attributes** section (Nodes / Edges); values that are not project fields are listed separately and kept as they are.
8. **Export.** **Export JSON** downloads the current design. To make it a toolkit design, save it as `toolkits/my-toolkit/designs/<name>.json`; set `defaultDesign: '<name>'` to make it your toolkit's default design (see below); open it again with **Open file…**. The header marks a design *modified* until it is exported, and the app asks before discarding unexported changes.

## 1. Your toolkit folder

```
toolkits/
  my-toolkit/             ← folder name = toolkit id (lowercase letters, digits, "-", "_"; starts with a letter)
    toolkit.ts            ← required
    functions/            ← optional: one function (room programme) per file
    designs/              ← optional: design JSON files (schema v2); each is listed in Open example…
    algorithms/           ← optional: one algorithm per file
    assets/               ← optional: façade files (.3dm) your designs use (see Designs)
```

Start with the `toolkit.ts` below, or, once it exists, copy the reference toolkit `toolkits/house/` to a new folder. Don't edit the reference toolkit itself: tests check that it keeps working.

**Choosing the active toolkit.** One toolkit is active at a time:
1. `?toolkit=my-toolkit` in the app URL;
2. otherwise `VITE_SGL_TOOLKIT=my-toolkit` in a local `.env.local` file;
3. otherwise no toolkit: the project uses only its own Functions and attributes (the built-in example is such a project).

If you ask for a toolkit that doesn't exist, the app shows an error. It never quietly switches to another toolkit.

```ts
// toolkits/my-toolkit/toolkit.ts
import { defineToolkit } from '@student-api';

export default defineToolkit({
  name: 'My toolkit',
  defaultDesign: 'my-design', // optional: designs/my-design.json (Building settings of new projects; check:toolkit runs on it)
  custom: {                   // optional: custom attributes of every node and edge (see below)
    nodes: { capacity: { kind: 'number', min: 0, label: 'Capacity (people)' } },
    edges: { weight: { kind: 'number', default: 1 } },
  },
});
```

**Project-wide attributes.** Every node in every design of a project made with your toolkit has the same custom node fields, and every edge has the same custom edge fields. The fields come from `custom` here plus every custom attribute your functions declare; a function's `default` becomes that function's default. You can also add, rename and delete fields in the app; the app saves them in the browser and can export them as a file. It never changes your TypeScript. Full contract: `docs/PROJECT-ATTRIBUTES.md`.

**Create project with your toolkit** starts with an **empty graph** that already has your toolkit's custom attributes (the fields above, with each function's defaults), tagged `Toolkit: <name>`. Its Building settings come from `defaultDesign`; its rooms are not copied (open a design with **Open file…**). If `defaultDesign` is left out, the built-in example's settings are used. If it's set but the file is missing or invalid, the project is not created and an error is shown.

## 2. Functions

```ts
// toolkits/my-toolkit/functions/gallery.ts
import { defineFunction } from '@student-api';

export default defineFunction({
  id: 'gallery',                     // the node's "function" in designs
  label: 'Gallery',
  colour: '#e8a33d',                 // optional; the rooms' colour in every view, hex "#rrggbb"
  facade: { windowFraction: 0.7 },   // optional; 0 = closed wall, 1 = fully glazed
  custom: {                          // optional: custom attributes of rooms with this function
    daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
    public: { kind: 'boolean', default: true },
    occupancy: { kind: 'number', min: 0 },
    note: { kind: 'text' },
  },
});
```

Attribute kinds are `number` (with optional `min` and `max`), `text`, `boolean` and `enum` (`values`). Each attribute may have a `default`. Stored values are always JSON primitives.

If you leave out `facade`, the function keeps the app's existing façade. `colour` is the default colour of rooms with this function in every view (Graph 2D, the 3D views, Building, Plan, legends and swatches), written `#rrggbb` (e.g. `'#e8a33d'`); any other form disables the function with an error. Without it the app picks an automatic colour from the id. A project can change any function's colour in the **Functions** dialog (the colour swatch; "Reset to default" returns to yours); that choice is saved in the project, not in your toolkit.

### How the app treats your custom attributes

| Situation in a design | What happens |
|---|---|
| Declared attribute missing, or `null` | Fine. Algorithms read the default, or nothing. The design file is **not** changed. |
| Declared attribute with a wrong value (e.g. `daylight: "bright"`) | Warning. The value is kept. Algorithms read the default, or nothing. |
| Attribute your function doesn't declare | Information only. The value is kept exactly as it is. |
| Node whose `function` your toolkit doesn't define | Warning. It keeps the app's fallback colour and façade. |
| Your function definition is invalid, or two files use the same `id` | **Error.** That function is disabled. Its nodes are flagged, and algorithms can't use it. |

Loading a design is never blocked by these checks.

## 3. Designs

Designs are schema-v2 JSON files (`docs/CONTRACTS-V2.md` §1; the built-in example is `app/document/examples/house.json`). Rooms and relationships have whole-number ids (`"id": 3`, `"source": 3, "target": 7`); `nextNodeId` / `nextEdgeId` say which ids new items get (you may leave them out; the app fills them in). Each file's name (without `.json`) is its design id. An invalid design is listed with its errors and can't be loaded.

Everything on a node or edge is an **attribute**: the built-in ones sit at the top level, your custom ones are grouped under `custom`. The same names are used in the JSON, the Data view, Properties and this API. A node and an edge, as saved:

```json
{
  "id": 3,
  "function": "kitchen",
  "position": [1, 0, 0],
  "size": [1, 1, 1],
  "custom": {
    "targetArea": 18
  }
}
```

```json
{
  "id": 2,
  "source": 2,
  "target": 3,
  "relationship": "open",
  "custom": {}
}
```

`position` is the room's minimum corner cell `[x, y, z]` (z is the Level), `size` its extent in cells `[x, y, z]` (z is the number of Floors). An edge may also have `"corridor": { "walls": …, "roof": …, "width": … }` after `relationship`. The app keeps this key order and writes every array of numbers on one line.

**Open example…** (Welcome and Project) lists every design of every toolkit, with the design's `metadata.name` and `metadata.description` and a `Toolkit: <name>` tag. Choosing one opens it as a **new project** with your toolkit and its custom attributes (as Create project does), the design's rooms and relationships, and its Building Designer settings (looks by function, the Corridors card). So give each design a short `description`.

### Façade files in a design (`assets/`)

A design's looks can use an imported façade module (Building Designer → a function card → Façade → **Import**). In the design JSON the module is named by its **asset id**, `"facade": { "assetId": "facade-ea64a8beca91ce66", "placement": "repeat" }`: the id the app's own import gives the file (`facade-` + 16 hex digits of the imported mesh's SHA-256, so the same file always gets the same id). The design does not contain the geometry. To ship the file with your toolkit:

1. Import the `.3dm` in the Designer of a project with your toolkit and use it on a function card. The design's JSON (Data view → JSON, or the scenario's `design` in an exported project file) now names its asset id.
2. Copy the `.3dm` to `toolkits/my-toolkit/assets/` (any file name, extension `.3dm`, at most 20 MB, drawn in Rhino's Front view with a unit).
3. Save the design in `designs/` and run `npm run check:toolkit -- -t my-toolkit`: it imports every file in `assets/` exactly as the app does and fails if a design uses an asset id that no file gives (the message lists the id each file gives).

When the design is opened with Open example…, the app fetches the files in `assets/` (only then: they are never part of the app's code) and imports them through the normal façade import into the new project, which then carries them like any imported façade. Materials come from the file's own layer and object colours; change them in the project with **Materials…**.

## 4. Algorithms

An algorithm never changes the design directly. It returns a result, and the app checks it.

### Generic graph analysis

A graph algorithm (an *analysis*, shown in **Analyse**) sees **only node ids and edges** (`graph.nodes: {id}[]`, `graph.edges: {id, source, target}[]`, `graph.policy`; ids are whole numbers), so it works on any graph.

**Inputs (required).** List what the student picks, in order. Each input is `{ kind: 'node' | 'edge' | 'number', label }` (a number may also have `min`, `max`, `default`). The list decides where the analysis appears:

| `inputs` | Analyse section | How the student gives them |
|---|---|---|
| `[]` | Network | nothing: the whole graph |
| one node | Node | the selected node |
| one edge | Edge | the selected edge |
| anything else | Queries | picked one at a time in any view; numbers typed |

`ctx.inputs` holds the picked values in the same order (node ids, edge ids, numbers). The app checks them before `run`.

**Result.** Return `{ kind: 'analysis', … }` with at least one of: `value` (a number, shown big), `text` (one short line), `highlightNodes` / `highlightEdges` (ids, highlighted in every view) and `nodeValues` (one value per node id, shown as colours). Unknown ids or wrong types are refused with a message.

A node analysis (runs on the selected node):

```ts
import { defineGraphAlgorithm, neighbours } from '@student-api';

export default defineGraphAlgorithm({
  id: 'count-neighbours',
  label: 'Count neighbours',
  inputs: [{ kind: 'node', label: 'Node' }],
  run({ graph, inputs }) {
    const node = inputs[0]!; // one value per input, in order: never missing
    const around = neighbours(graph, node);
    return { kind: 'analysis', value: around.length, highlightNodes: around };
  },
});
```

A two-node query (the student picks From, then To):

```ts
import { defineGraphAlgorithm, edgesBetween } from '@student-api';

export default defineGraphAlgorithm({
  id: 'directly-connected',
  label: 'Directly connected?',
  inputs: [
    { kind: 'node', label: 'From' },
    { kind: 'node', label: 'To' },
  ],
  run({ graph, inputs }) {
    const from = inputs[0]!;
    const to = inputs[1]!;
    const edges = edgesBetween(graph, from, to);
    return {
      kind: 'analysis',
      text: edges.length > 0 ? 'Yes, they share an edge' : 'No direct edge',
      highlightNodes: [from, to],
      highlightEdges: edges.map((e) => e.id),
    };
  },
});
```

Graph algorithms can't change anything. Creating nodes in an arbitrary graph isn't possible, because the only document is the spatial one, where every node needs a `position`.

An analysis may also have a `description` (optional, one or two plain sentences, at most 300 characters): its ⓘ in Analyse shows it.

### Design analysis

A design analysis (`defineDesignAnalysis`, also shown in **Analyse**) works like a graph analysis (same `inputs`, same sections, same result, never changes the design) but it also reads **the rooms themselves**:

| `ctx.…` | Meaning |
|---|---|
| `design.nodes` | every room: `id`, `function`, `position`, `size`, and `custom` with **only** the fields listed in `uses` (function and field defaults applied) |
| `design.edges` | every relationship: `id`, `source`, `target`, `relationship` (`access` / `open`), `corridor`, `boundaryShift` (the requested shift; absent = `none`), `custom` (only the listed fields) |
| `inputs` | the picked values, as for a graph analysis |
| `functions` | the project's Functions (`id`, `label`) |
| `customFields` | the listed fields (`key`, `label`, `kind`, limits) |
| `nodeAt(cell)`, `touches(a, b)` | the room at a cell; whether two rooms share a face |
| `metrics` | the app's calculated values, e.g. `ctx.metrics.value('area', room.id)` |

**`uses` (optional): what it needs from the project.** Everything above except the custom fields exists in every project. Using only that (Functions as labels, positions, sizes, relationship kinds, calculated values), leave `uses` out: the analysis works in **any project** and Analyse tags it **Any project**. When the code names a Function id (`'bedroom'`) or reads a custom field, list it:

```ts
uses: { functions: ['bedroom'], nodeFields: ['targetArea'], edgeFields: [] },
```

Analyse then tags it **This project**. Where the open project lacks one of them, it is listed disabled with the reason, e.g. "Needs the room field “targetArea”, which this project does not have." A field that is not listed is simply not in `custom`. The House toolkit's *Below target area* (`toolkits/house/algorithms/below-target-area.ts`) is a complete example.

### Uploading an analysis (no toolkit needed)

The same file also works without a toolkit: in **Analyse**, choose **Upload your own (.ts)** at the top of the tab. The analysis appears in the section its `inputs` give (that section opens), tagged **Yours**, and runs, picks and highlights exactly like a built-in. ↻ replaces it with a new version of the file (it keeps its place); ✕ removes it from the project. Start from a template (`docs/templates/graph-analysis-template.ts`, `docs/templates/design-analysis-template.ts`) or give an AI kit to an AI assistant. The ⓘ beside the upload button (and **Guide › Toolkits & JSON › Write your own analysis**) offers them in three tabs: **Any project** (with *Include room basics* on: the design kit, `docs/ai-kit/design/`; off: the graph kit, `docs/ai-kit/graph/`), **This project** (the design kit plus a generated `PROJECT.md` listing the project's Functions and custom fields, never the design) and **Template**. Each kit tab shows how to write the prompt (idea, input, answer), with a starting text to copy. The app builds the zips when you download them.

Rules and limits for uploads:
- One `.ts` (or `.js`) file, at most 100 KB, at most 20 uploads per project. Types are removed when it is loaded; nothing is type-checked, the app checks everything at runtime.
- It may import only `@student-api`, and from it only `defineGraphAlgorithm`, `defineDesignAnalysis`, the graph helpers (`neighbours`, `incidentEdges`, `edgesBetween`, `getNode`, `getEdge`, `opposite`) and the grid helpers (`roomCells`, `neighbourCell`, `FACE_DIRECTIONS`). Any other import is refused with its name; helper functions go in the same file.
- Only analyses: `defineSpatialAlgorithm` is refused ("Uploaded files can only analyse (defineGraphAlgorithm or defineDesignAnalysis); transforms must live in a toolkit folder.").
- It runs in a separate background worker. A graph analysis receives only node ids, edges and the picked inputs; a design analysis also receives the rooms (with only the custom fields it lists in `uses`) and the calculated values, prepared by the app. Never the page or your storage. A run that takes longer than 3 seconds is stopped: "Stopped after 3 s — does it loop forever?".
- The definition and every result are checked exactly as for a toolkit analysis. Syntax errors and exceptions are shown with the line number.
- The project file keeps the file's **source text** (`settings.uploadedAnalyses`), so it travels with Save, Export and Open. If a stored upload no longer loads, it is listed disabled with the reason; the project still opens.

### Spatial transformations

A spatial algorithm gets the design's own records and a few helpers:

| `ctx.…` | Meaning |
|---|---|
| `design.nodes` | `{ id, function, position: [x, y, z], size: [sx, sy, sz], custom }`. `id` is a whole number (also the room's label). A room is a box of whole cells: `position` is its minimum corner, `size` its extent (`[1, 1, 1]` for one cell); z is the storey |
| `design.edges` | `{ id, source, target, relationship, corridor?, boundaryShift?, custom }`; `boundaryShift` (read only here) is the requested [boundary shift](#boundary-shifts) (absent = `'none'`); ids are numbers; `relationship` is `access` or `open`; `corridor` (read only) is the relationship's own corridor look `{ walls?: 'enclosed' \| 'open', roof?: 'flat' \| 'pergola' \| 'none', width?: number }` (`width` in metres, more than 0 and at most one cell, 3 m; omitted fields use the design's Corridors card; built-in default open walls, flat roof, 1.5 m) |
| `nodeAt(cell)` | id of the room whose box contains that cell, or `undefined` if the cell is free |
| `touches(a, b)` | whether rooms `a` and `b` share a wall or floor, so a relationship between them is built directly |
| `canRelate(a, b)` | whether a relationship between rooms `a` and `b` may be created: both exist, are different and aren't related yet. **They don't need to touch** |
| `nodeCustom(nodeId)` | the room's value for **every custom node attribute** of the project: the stored value, else its function's default, else the field default (the same values the app shows). `null` = explicitly "no value"; fields without any value are absent |
| `edgeCustom(edgeId)` | the same for a relationship's custom edge attributes (Access and Open have the same fields) |
| `customFields` | `{ nodes, edges }`: the project's custom attributes (`key`, `label`, `kind`, `values`, `min`, `max`, `default`) |
| `customOf(node, fn)` | typed values of the custom attributes the function `fn` declares (read through the project fields); `fn` is imported from your `functions/` folder |
| `metrics.list()` / `metrics.value(metricId, id)` | the app's **calculated values** (area, volume, façade length, …), read-only; see [Calculated values](#calculated-values) |
| `params` | your parameters, already checked, with defaults applied |

It returns a list of **operations**. You never choose ids: the app gives every new room and relationship the next free number, in operation order, and never reuses an id. To refer to something you add in the same run, give it a `ref` (any text, e.g. `"new-kitchen"`) and use that text where an id is expected (`ItemRef` = an existing id, or the `ref` of an EARLIER operation).

| Operation | Rules |
|---|---|
| `{ op: 'add-node', ref?, position, size?, function, custom? }` | An integer minimum corner `position`, an optional `size` of positive integers (default `[1, 1, 1]`), a box that overlaps no other room, a valid function of your toolkit, and only custom node attributes of the project with valid values. Gets the next node id |
| `{ op: 'add-edge', ref?, source, target, relationship, corridor?, boundaryShift? }` | `source` / `target` are `ItemRef`s of existing, different rooms not related yet. `relationship` is `access` or `open`; `corridor` (optional) is its own corridor look `{ walls?, roof?, width? }` (width in metres, more than 0 and at most 3 m); `boundaryShift` (optional) a [boundary-shift](#boundary-shifts) request. The rooms **don't need to touch**. Gets the next edge id |
| `{ op: 'set-node-custom-attribute', nodeId, key, value }` | Sets one custom attribute. `nodeId` is an `ItemRef`; `key` must be a custom node attribute of the project (any room may have any of them, whatever its function); the value must be valid, or `null`. Built-in values (function, position, size) are not custom attributes: move or resize a room with `set-node-geometry` |
| `{ op: 'set-edge-custom-attribute', edgeId, key, value }` | Sets one custom attribute. `edgeId` is an `ItemRef`; `key` must be a custom edge attribute of the project; the value must be valid, or `null`. The relationship and corridor are built-in, not custom |
| `{ op: 'set-edge-boundary-shift', edgeId, boundaryShift }` | Stores the requested [boundary shift](#boundary-shifts) of an edge (`edgeId` is an `ItemRef`): `'none'`, `'toward-source'` or `'toward-target'`. Never refused because of the geometry: a request that cannot be applied is kept, and `boundary-shift-status` says why |
| `{ op: 'set-node-geometry', nodeId, position?, size? }` | Moves and/or resizes a room (`nodeId` is an `ItemRef`); give `position`, `size` or both, the rest stays. The size stays anchored at the minimum corner, so growing towards −x or −y means a smaller `position` and a larger `size`. Whole numbers, sizes at least 1 and within the size limit; the new box must not overlap another room or take the cells of a generated connector |

The preview (and the applied design) shows the ids the app gave; `preview.assigned` maps your `ref`s to them.

**Relationships and space.** A relationship says what you want (`access` = people can pass, `open` = no separating element). Whether it can be built is worked out afterwards and is never an error:
- the rooms **touch**: a door or a removed wall, or an opening in the floor between stacked rooms;
- they are on the **same storey** and lined up, with nothing in between: a straight connector is generated (style `enclosed`, `covered` or `deck`);
- otherwise (different storeys, diagonal, or blocked): the relationship is kept but shown as **unresolved**.

If a new room would take the cells of a generated connector, the app asks before applying the change.

The operations are applied **in order** and **all together**: a later operation may use a node added by an earlier one. If any operation, or the final design, is invalid, nothing changes and the error names the operation.

A transformation is also rejected if it would create a new warning or error, for example an invalid custom attribute value. Existing problems in the design don't stop it.

Example: add a gallery in a free cell next to an existing gallery, and connect it with a door.

```ts
import { defineSpatialAlgorithm, FACE_DIRECTIONS, neighbourCell } from '@student-api';
import gallery from '../functions/gallery';

export default defineSpatialAlgorithm({
  id: 'extend-gallery',
  label: 'Extend a gallery',
  run(ctx) {
    for (const room of ctx.design.nodes.filter((n) => n.function === gallery.id)) {
      for (const direction of FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z')) {
        const cell = neighbourCell(room.position, direction);
        if (ctx.nodeAt(cell) !== undefined) continue;          // occupied
        return {
          kind: 'transformation',
          operations: [
            { op: 'add-node', ref: 'new-gallery', position: cell, function: gallery.id, custom: { daylight: 'medium' } },
            { op: 'add-edge', source: room.id, target: 'new-gallery', relationship: 'access' },
          ],
        };
      }
    }
    return { kind: 'transformation', summary: 'No free cell next to a gallery.', operations: [] };
  },
});
```

When you create several items in one run, give each a different `ref`.

### Calculated values

`ctx.metrics` gives spatial algorithms the same calculated values the app shows in Properties and in *Colour by*. They are worked out from the design when you ask; you can't set them, and they are never saved in the design or the project file.

- `ctx.metrics.list()`: every value on offer, as `{ id, label, collection, valueKind, unit?, definition }` (`collection` is `nodes` for rooms or `edges` for relationships).
- `ctx.metrics.value(metricId, id)`: the value for one room or relationship: a number, `true`/`false`, a text, or `null` when there is no value. An unknown metric id, or an id that is not a room (or relationship, for edge values), stops the run with an error.
- Values describe the design **as it was when the run started**. Your operations don't change them during the run.

| `metricId` | For | Value |
|---|---|---|
| `area` | rooms | **nominal** plan area in m² (label *Nominal area*): cells along x × y × 3 m × 3 m (not summed over storeys). Boundary shifts never change it |
| `actual-area` | rooms | plan area in m² **as built**, after applied boundary shifts (±1.5 m × the shared wall); equal to `area` otherwise |
| `boundary-adjusted` | rooms | `true` if the room takes part in an **applied** boundary shift (gains or loses area) |
| `volume` | rooms | m³: cells along x × y × z × 27 m³ |
| `degree` | rooms | number of relationships of the room, built or not |
| `has-exterior-facade` | rooms | `true` if at least one wall faces an empty cell (roofs and floors don't count) |
| `exposed-facade-length` | rooms | m: exterior unit walls × 3 m, summed over the room's storeys. Walls shared with another room or touching a generated connector are not exterior |
| `exposed-facade-area` | rooms | m²: exterior unit walls × 9 m² |
| `unresolved-connections` | rooms | number of the room's relationships that can't be built (unresolved) |
| `resolution-status` | relationships | `"direct"`, `"routed"` or `"unresolved"` |
| `route-length` | relationships | m: generated connector cells × 3 m; `0` when the rooms touch; `null` when unresolved |
| `boundary-shift-applied` | relationships | `true` only if the edge requests a boundary shift **and** it is applied |
| `boundary-shift-status` | relationships | `"applied"`, `"no-request"`, or why the request is not applied: `"stacked-rooms"`, `"storey-mismatch"`, `"not-touching"`, `"partial-wall"`, `"room-already-adjusted"`, `"opening-conflict"`, `"overlapping-adjustment"` |

`Function` (the room's `function`) and `Level` (`position[2]`) are not calculated values: read them from `ctx.design.nodes`.

Example: rate each gallery's daylight from its exposed façade.

```ts
import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import gallery from '../functions/gallery';

export default defineSpatialAlgorithm({
  id: 'daylight-from-facade',
  label: 'Daylight from façade length',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    for (const room of ctx.design.nodes.filter((n) => n.function === gallery.id)) {
      const metres = ctx.metrics.value('exposed-facade-length', room.id) as number;
      const daylight = metres >= 24 ? 'high' : metres >= 12 ? 'medium' : 'low';
      operations.push({ op: 'set-node-custom-attribute', nodeId: room.id, key: 'daylight', value: daylight });
    }
    return { kind: 'transformation', summary: `${operations.length} galleries rated`, operations };
  },
});
```

Graph algorithms see only ids and endpoints, so they have no `ctx.metrics`.

### Boundary shifts

An edge between two rooms that share a wall can **request** that the wall moves 1.5 m (half a cell) into one of them. Its `boundaryShift` is `'none'` (the default, also when it is absent), `'toward-source'` (the wall moves into the **source** room: the source loses area, the target gains it) or `'toward-target'` (the other way). Source and target are only an orientation here: relationships stay two-way for every graph query, and a door swings into its edge's target.

- **Only a request.** Set it with `set-edge-boundary-shift` (or on `add-edge`); read it from `ctx.design.edges`. Whether the building applies it is a calculated value: `ctx.metrics.value('boundary-shift-applied', edge.id)`, and `'boundary-shift-status'` for why not. A request that cannot apply is kept, never reset to `'none'`; it may apply after a later change of the design.
- **What applies.** Both rooms touch side by side (not stacked) and span the same storeys; the shared wall runs the whole side of the room that would shrink, in whole 3 m segments (a 1 × 1 bathroom against a 2 × 2 bedroom: yes toward the bathroom, no toward the bedroom); no corridor end or floor opening lies in the part that moves; and neither room already takes part in an **applied** shift. Requests are tried in the order the edges are stored; the first one that applies wins its two rooms.
- **What changes.** Only the architecture (Building and Plan) and `actual-area`. Positions, sizes, the grid, `nodeAt`, `touches` and every other calculated value stay **nominal** (whole cells): `area` is the nominal area, `exposed-facade-length` / `-area` and `has-exterior-facade` count whole cell faces. A door on a wall the shift shortens moves into the part of the wall that still joins its two rooms.
- `ctx.metrics.value('boundary-adjusted', room.id)` is `true` for both rooms of an applied shift. Example: a bedroom of 9 m² gaining from a 9 m² bathroom has `actual-area` 13.5 m², the bathroom 4.5 m².

```ts
// Ask every bathroom to give 1.5 m to the bedroom it shares a wall with.
for (const e of ctx.design.edges) {
  const fn = (id: number) => ctx.design.nodes.find((n) => n.id === id)!.function;
  if (fn(e.source) === 'bedroom' && fn(e.target) === 'bathroom' && ctx.touches(e.source, e.target)) {
    operations.push({ op: 'set-edge-boundary-shift', edgeId: e.id, boundaryShift: 'toward-target' });
  }
}
```

`ctx.metrics` is a **required** member of the spatial algorithm context (type `MetricReader` from `@student-api`). If you write your own test context for a spatial algorithm, it must provide `metrics` too; the Student API has no helper for this, so give it a small object with `list()` and `value(metricId, id)` that returns the values your test needs.

## 5. Parameters

Transformations (`defineSpatialAlgorithm`) may declare `parameters` using the same kinds as custom attributes. For example, `parameters: { count: { kind: 'number', default: 1 } }` is read as `ctx.params.count`. Values are checked before `run` is called. Analyses take no parameters: a number they need is a `{ kind: 'number' }` input.

Each parameter may also have a `label` (at most 100 characters) and a `description` (at most 500), both optional. Transform shows the label instead of the key, and the description under the field; without a label it shows the key. They change only what Transform shows, not the value (`ParameterSpec` in `@student-api`):

```ts
parameters: {
  count: { kind: 'number', min: 1, default: 1, label: 'Copies', description: 'How many copies to make.' },
},
```

## 6. Checks and limits

- TypeScript checks your code when you run `npm run typecheck`, but the app **also checks everything at runtime**, because the development server runs code without type checking.
- Your toolkit may import only `@student-api` and files in your own toolkit folder. Tests enforce this.
- Toolkit code is not sandboxed: an infinite loop in a toolkit algorithm freezes the browser tab. Uploaded analyses run in a worker and are stopped after 3 seconds (isolation, not a security guarantee: upload only code you trust).
- Use deterministic rules. If you need randomness, derive it from a parameter (a seed) so results can be reproduced.

## 7. Reference

Exports of `@student-api`:
- **Definitions:** `defineToolkit`, `defineFunction`, `defineGraphAlgorithm`, `defineDesignAnalysis`, `defineSpatialAlgorithm`
- **Graph helpers:** `neighbours`, `incidentEdges`, `edgesBetween`, `getNode`, `getEdge`, `opposite` (ids are numbers)
- **Grid helpers:** `FACE_DIRECTIONS`, `neighbourCell`, `roomCells` (every cell of a room's box)
- **Types:** `AttributeSpec`, `AttributeValue`, `AttributesOf`, `FunctionDefinition`, `FacadeParameters`, `CustomFieldInfo`, `ToolkitDefinition`, `ToolkitAttributes`, `ToolkitAttributeSpec`, `ToolkitAttributeSpecs`, `Graph`, `NodeRecord`, `EdgeRecord`, `GridCoord`, `RoomSize`, `SpatialNode`, `SpatialEdge`, `RelationshipKind`, `CorridorLook`, `CorridorWalls`, `CorridorRoof`, `SpatialOperation`, `ItemRef`, `AnalysisInput`, `AnalysisResult`, `TransformationResult`, `GraphAlgorithmContext`, `DesignAnalysisContext`, `DesignAnalysisDefinition`, `AnalysisUses`, `FunctionInfo`, `SpatialAlgorithmContext`, `MetricInfo`, `MetricReader` (`ctx.metrics`)

**Added in P4:** `set-node-geometry` (move or resize a room in a transformation); optional `description` of a graph analysis; uploaded analyses (see "Uploading an analysis"). **Added 20 November 2026:** design analyses (`defineDesignAnalysis`, see "Design analysis"), also as uploads.

**Changes in P4 (19 November 2026).** Schema v1 is gone: the old kinds (`door`, `atrium`, `vertical-access`), `canConnect` and `uniqueId` no longer exist. Ids are whole numbers, `displayId` is removed (the id is the label), and operations use `ref`s instead of chosen ids.

**Changes on 19 November 2026 (one vocabulary).** The JSON, the Data view, Properties, this API and your toolkit folder use the same names. Old names are no longer accepted:

| Before | Now |
|---|---|
| node `typeId`, `grid`, `attributes` | `function`, `position`, `custom` (key order: `id`, `function`, `position`, `size`, `custom`) |
| edge `kind`, `attributes` | `relationship`, `custom` (key order: `id`, `source`, `target`, `relationship`, `corridor`, `custom`) |
| the node-type definer and its definition type, folder `types/` | `defineFunction`, `FunctionDefinition`, folder `functions/` |
| `attributes` in the node-type definer / `defineToolkit` | `custom` |
| `ctx.attributesOf(node, type)`, `ctx.nodeAttributes(id)`, `ctx.edgeAttributes(id)`, `ctx.attributeFields`, `AttributeFieldInfo` | `ctx.customOf(node, fn)`, `ctx.nodeCustom(id)`, `ctx.edgeCustom(id)`, `ctx.customFields`, `CustomFieldInfo` |
| operations `add-node { grid, typeId, attributes }`, `add-edge { kind }`, `set-node-geometry { grid }` | `add-node { position, function, custom }`, `add-edge { relationship, corridor? }`, `set-node-geometry { position }` |

**Naming follow-ups (19 November 2026).** The operations that set ONE custom attribute are now `set-node-custom-attribute` and `set-edge-custom-attribute` (the names without `custom-` are no longer accepted). In the project-attributes record (browser-stored and in exported project files), per-Function defaults are under `functionDefaults`.
