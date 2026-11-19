# Student API (schema-v2 data, numeric ids)

How to write your own node types, designs and algorithms for Spatial Graph Lab. Your code lives in **one toolkit folder** and imports **only** `@student-api`.

> Status (Stage 3B): the app activates your toolkit, opens its default design, uses its node types in the inspector and its façades in the Architecture view, and runs its algorithms from the **Algorithms** panel. See [Workflow](#workflow) for the step-by-step version.

## Workflow

1. **Create a toolkit.** Make a folder `toolkits/my-toolkit/` (lowercase letters, digits, `-` and `_`, starting with a letter) with a `toolkit.ts` (see [Your toolkit folder](#1-your-toolkit-folder)). Once the reference toolkit `toolkits/house/` exists, you can copy it instead; don't edit it itself.
2. **Define a node type.** Edit or add a file in `types/` (see [Node types](#2-node-types)). The `id` is the `typeId` your designs use.
3. **Write an algorithm.** Add a file in `algorithms/`: `defineGraphAlgorithm` for an analysis that only reads the graph, or `defineSpatialAlgorithm` for a transformation that returns operations (see [Algorithms](#4-algorithms)).
4. **Check it.** `npm run check:toolkit -- -t my-toolkit` loads your toolkit exactly as the app does and fails with a readable message if a definition or design is invalid, or if an algorithm fails on your default design. `npm run typecheck` checks your TypeScript.
5. **Run the app.** `npm run dev`, then open the printed URL with `?toolkit=my-toolkit` (for example `http://localhost:5173/?toolkit=my-toolkit`), or choose your toolkit when you create a new project. The header shows a problem count; the **Project** section of the left rail lists every problem in your toolkit files and keeps it visible until you fix it (the page reloads when you save a file).
6. **Run an algorithm.** In the **Algorithms** section of the left rail, choose an algorithm, fill in any parameters (empty means "use the default") and press **Run**.
   - An *analysis* colours the rooms in Graph 2D, Graph 3D and Voxels and lists a value per room; click a room to select it. **Clear** removes the colours and values. It never changes the design.
   - A *transformation* shows a **preview**: the rooms, connections and attribute values it would add or change. Nothing changes until you press **Apply**. **Discard** throws the preview away. If you edit the design after running, the preview can no longer be applied: run it again.
   - Disabled algorithms (invalid definitions) are marked **disabled**; select one to see why.
7. **Edit attributes.** Select a room or relationship: **Properties** (right) lists every project field with its value and where it comes from (set here, the type's default, the field default). Add, rename or delete fields in the **Attributes** section (Nodes / Edges); values that are not project fields are listed separately and kept as they are.
8. **Export.** **Export JSON** downloads the current design. To make it a toolkit design, save it as `toolkits/my-toolkit/designs/<name>.json`; set `defaultDesign: '<name>'` to open it at startup. The header marks a design *modified* until it is exported, and the app asks before discarding unexported changes.

## 1. Your toolkit folder

```
toolkits/
  my-toolkit/             ← folder name = toolkit id (lowercase letters, digits, "-", "_"; starts with a letter)
    toolkit.ts            ← required
    types/                ← optional: one node type per file
    designs/              ← optional: design JSON files (schema v2)
    algorithms/           ← optional: one algorithm per file
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
  defaultDesign: 'my-design', // optional: designs/my-design.json is loaded at startup
  attributes: {               // optional: custom fields for every node and edge (see below)
    nodes: { capacity: { kind: 'number', min: 0, label: 'Capacity (people)' } },
    edges: { weight: { kind: 'number', default: 1 } },
  },
});
```

**Project-wide attributes.** Every node in every design of a project made with your toolkit has the same custom node fields, and every edge has the same custom edge fields. The fields come from `attributes` here plus every attribute your node types declare; a type's `default` becomes that type's default. You can also add, rename and delete fields in the app; the app saves them in the browser and can export them as a file. It never changes your TypeScript. Full contract: `docs/PROJECT-ATTRIBUTES.md`.

If `defaultDesign` is left out, the built-in example is loaded. If it's set but the file is missing or invalid, nothing is loaded and an error is shown.

## 2. Node types

```ts
// toolkits/my-toolkit/types/gallery.ts
import { defineNodeType } from '@student-api';

export default defineNodeType({
  id: 'gallery',                     // the typeId used in designs
  label: 'Gallery',
  facade: { windowFraction: 0.7 },   // optional; 0 = closed wall, 1 = fully glazed
  attributes: {
    daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
    public: { kind: 'boolean', default: true },
    occupancy: { kind: 'number', min: 0 },
    note: { kind: 'text' },
  },
});
```

Attribute kinds are `number` (with optional `min` and `max`), `text`, `boolean` and `enum` (`values`). Each attribute may have a `default`. Stored values are always JSON primitives.

If you leave out `facade`, the type keeps the app's existing façade. Every type uses the existing colour for its id; custom colours aren't supported yet.

### How the app treats your attributes

| Situation in a design | What happens |
|---|---|
| Declared attribute missing, or `null` | Fine. Algorithms read the default, or nothing. The design file is **not** changed. |
| Declared attribute with a wrong value (e.g. `daylight: "bright"`) | Warning. The value is kept. Algorithms read the default, or nothing. |
| Attribute your type doesn't declare | Information only. The value is kept exactly as it is. |
| Node whose `typeId` your toolkit doesn't define | Warning. It keeps the app's fallback colour and façade. |
| Your type definition is invalid, or two files use the same `id` | **Error.** That type is disabled. Its nodes are flagged, and algorithms can't use it. |

Loading a design is never blocked by these checks.

## 3. Designs

Designs are schema-v2 JSON files (`docs/CONTRACTS-V2.md` §1; the built-in example is `app/document/examples/house.json`). Rooms and relationships have whole-number ids (`"id": 3`, `"source": 3, "target": 7`); `nextNodeId` / `nextEdgeId` say which ids new items get (you may leave them out; the app fills them in). Each file's name (without `.json`) is its design id. An invalid design is listed with its errors and can't be loaded.

## 4. Algorithms

An algorithm never changes the design directly. It returns a result, and the app checks it.

### Generic graph analysis

A graph algorithm sees **only node ids and edges** (`graph.nodes: {id}[]`, `graph.edges: {id, source, target}[]`, `graph.policy`; ids are whole numbers), so it works on any graph. It returns one value per node (`nodeValues[node.id] = …`).

```ts
import { defineGraphAlgorithm, neighbours } from '@student-api';

export default defineGraphAlgorithm({
  id: 'degree',
  label: 'Number of connections',
  run({ graph }) {
    const nodeValues: Record<number, number> = {};
    for (const n of graph.nodes) nodeValues[n.id] = neighbours(graph, n.id).length;
    return { kind: 'analysis', summary: 'Connections per room', nodeValues };
  },
});
```

Graph algorithms can't change anything. Creating nodes in an arbitrary graph isn't possible, because the only document is the spatial one, where every node needs a grid cell.

### Spatial transformations

A spatial algorithm gets the design's own records and a few helpers:

| `ctx.…` | Meaning |
|---|---|
| `design.nodes` | `{ id, typeId, grid: [x, y, z], size: [sx, sy, sz], attributes }`. `id` is a whole number (also the room's label). A room is a box of whole cells: `grid` is its minimum corner, `size` its extent (`[1, 1, 1]` for one cell); z is the storey |
| `design.edges` | `{ id, source, target, kind, connectorStyle?, attributes }`; ids are numbers; kind is `access` or `open` |
| `nodeAt(cell)` | id of the room whose box contains that cell, or `undefined` if the cell is free |
| `touches(a, b)` | whether rooms `a` and `b` share a wall or floor, so a relationship between them is built directly |
| `canRelate(a, b)` | whether a relationship between rooms `a` and `b` may be created: both exist, are different and aren't related yet. **They don't need to touch** |
| `nodeAttributes(nodeId)` | the room's value for **every project node field**: the stored value, else its type's default, else the field default (the same values the app shows). `null` = explicitly "no value"; fields without any value are absent |
| `edgeAttributes(edgeId)` | the same for a relationship's project edge fields (Access and Open have the same fields) |
| `attributeFields` | `{ nodes, edges }`: the project's fields (`key`, `label`, `kind`, `values`, `min`, `max`, `default`) |
| `attributesOf(node, type)` | typed values of the attributes `type` declares (read through the project fields); `type` is imported from your `types/` folder |
| `metrics.list()` / `metrics.value(metricId, id)` | the app's **calculated values** (area, volume, façade length, …), read-only; see [Calculated values](#calculated-values) |
| `params` | your parameters, already checked, with defaults applied |

It returns a list of **operations**. You never choose ids: the app gives every new room and relationship the next free number, in operation order, and never reuses an id. To refer to something you add in the same run, give it a `ref` (any text, e.g. `"new-kitchen"`) and use that text where an id is expected (`ItemRef` = an existing id, or the `ref` of an EARLIER operation).

| Operation | Rules |
|---|---|
| `{ op: 'add-node', ref?, grid, size?, typeId, attributes? }` | An integer minimum corner, an optional `size` of positive integers (default `[1, 1, 1]`), a box that overlaps no other room, a valid type of your toolkit, and only project node fields with valid values. Gets the next node id |
| `{ op: 'add-edge', ref?, source, target, kind }` | `source` / `target` are `ItemRef`s of existing, different rooms not related yet. `kind` is `access` or `open`. The rooms **don't need to touch**. Gets the next edge id |
| `{ op: 'set-node-attribute', nodeId, key, value }` | `nodeId` is an `ItemRef`; `key` must be a project node field (any room may have any node field, whatever its type); the value must be valid, or `null` |
| `{ op: 'set-edge-attribute', edgeId, key, value }` | `edgeId` is an `ItemRef`; `key` must be a project edge field; the value must be valid, or `null` |
| `{ op: 'set-node-geometry', nodeId, grid?, size? }` | Moves and/or resizes a room (`nodeId` is an `ItemRef`); give `grid`, `size` or both, the rest stays. The size stays anchored at the minimum corner, so growing towards −x or −y means a smaller `grid` and a larger `size`. Whole numbers, sizes at least 1 and within the size limit; the new box must not overlap another room or take the cells of a generated connector |

The preview (and the applied design) shows the ids the app gave; `preview.assigned` maps your `ref`s to them.

**Relationships and space.** A relationship says what you want (`access` = people can pass, `open` = no separating element). Whether it can be built is worked out afterwards and is never an error:
- the rooms **touch**: a door or a removed wall, or an opening in the floor between stacked rooms;
- they are on the **same storey** and lined up, with nothing in between: a straight connector is generated (style `enclosed`, `covered` or `deck`);
- otherwise (different storeys, diagonal, or blocked): the relationship is kept but shown as **unresolved**.

If a new room would take the cells of a generated connector, the app asks before applying the change.

The operations are applied **in order** and **all together**: a later operation may use a node added by an earlier one. If any operation, or the final design, is invalid, nothing changes and the error names the operation.

A transformation is also rejected if it would create a new warning or error, for example an invalid attribute value. Existing problems in the design don't stop it.

Example: add a gallery in a free cell next to an existing gallery, and connect it with a door.

```ts
import { defineSpatialAlgorithm, FACE_DIRECTIONS, neighbourCell } from '@student-api';
import gallery from '../types/gallery';

export default defineSpatialAlgorithm({
  id: 'extend-gallery',
  label: 'Extend a gallery',
  run(ctx) {
    for (const room of ctx.design.nodes.filter((n) => n.typeId === gallery.id)) {
      for (const direction of FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z')) {
        const cell = neighbourCell(room.grid, direction);
        if (ctx.nodeAt(cell) !== undefined) continue;          // occupied
        return {
          kind: 'transformation',
          operations: [
            { op: 'add-node', ref: 'new-gallery', grid: cell, typeId: gallery.id, attributes: { daylight: 'medium' } },
            { op: 'add-edge', source: room.id, target: 'new-gallery', kind: 'access' },
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
| `area` | rooms | plan area in m²: cells along x × y × 3 m × 3 m (not summed over storeys) |
| `volume` | rooms | m³: cells along x × y × z × 27 m³ |
| `degree` | rooms | number of relationships of the room, built or not |
| `has-exterior-facade` | rooms | `true` if at least one wall faces an empty cell (roofs and floors don't count) |
| `exposed-facade-length` | rooms | m: exterior unit walls × 3 m, summed over the room's storeys. Walls shared with another room or touching a generated connector are not exterior |
| `exposed-facade-area` | rooms | m²: exterior unit walls × 9 m² |
| `unresolved-connections` | rooms | number of the room's relationships that can't be built (unresolved) |
| `resolution-status` | relationships | `"direct"`, `"routed"` or `"unresolved"` |
| `route-length` | relationships | m: generated connector cells × 3 m; `0` when the rooms touch; `null` when unresolved |

`Function` (the room's `typeId`) and `Level` (`grid[2]`) are not calculated values: read them from `ctx.design.nodes`.

Example: rate each gallery's daylight from its exposed façade.

```ts
import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import gallery from '../types/gallery';

export default defineSpatialAlgorithm({
  id: 'daylight-from-facade',
  label: 'Daylight from façade length',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    for (const room of ctx.design.nodes.filter((n) => n.typeId === gallery.id)) {
      const metres = ctx.metrics.value('exposed-facade-length', room.id) as number;
      const daylight = metres >= 24 ? 'high' : metres >= 12 ? 'medium' : 'low';
      operations.push({ op: 'set-node-attribute', nodeId: room.id, key: 'daylight', value: daylight });
    }
    return { kind: 'transformation', summary: `${operations.length} galleries rated`, operations };
  },
});
```

Graph algorithms see only ids and endpoints, so they have no `ctx.metrics`.

`ctx.metrics` is a **required** member of the spatial algorithm context (type `MetricReader` from `@student-api`). If you write your own test context for a spatial algorithm, it must provide `metrics` too; the Student API has no helper for this, so give it a small object with `list()` and `value(metricId, id)` that returns the values your test needs.

## 5. Parameters

Algorithms may declare `parameters` using the same kinds as attributes. For example, `parameters: { start: { kind: 'number', default: 1 } }` (a room id) is read as `ctx.params.start`. Values are checked before `run` is called.

## 6. Checks and limits

- TypeScript checks your code when you run `npm run typecheck`, but the app **also checks everything at runtime**, because the development server runs code without type checking.
- Your toolkit may import only `@student-api` and files in your own toolkit folder. Tests enforce this.
- This is not a security sandbox: an infinite loop in an algorithm freezes the browser tab.
- Use deterministic rules. If you need randomness, derive it from a parameter (a seed) so results can be reproduced.

## 7. Reference

Exports of `@student-api`:
- **Definitions:** `defineToolkit`, `defineNodeType`, `defineGraphAlgorithm`, `defineSpatialAlgorithm`
- **Graph helpers:** `neighbours`, `incidentEdges`, `edgesBetween`, `getNode`, `getEdge`, `opposite` (ids are numbers)
- **Grid helpers:** `FACE_DIRECTIONS`, `neighbourCell`, `roomCells` (every cell of a room's box)
- **Types:** `AttributeSpec`, `AttributeValue`, `AttributesOf`, `NodeTypeDefinition`, `ToolkitDefinition`, `ToolkitAttributes`, `ToolkitAttributeSpec`, `ToolkitAttributeSpecs`, `Graph`, `NodeRecord`, `EdgeRecord`, `GridCoord`, `RoomSize`, `SpatialNode`, `SpatialEdge`, `RelationshipKind`, `ConnectorStyle`, `SpatialOperation`, `ItemRef`, `AnalysisResult`, `TransformationResult`, `GraphAlgorithmContext`, `SpatialAlgorithmContext`, `MetricInfo`, `MetricReader` (`ctx.metrics`)

**Added in P4:** `set-node-geometry` (move or resize a room in a transformation).

**Changes in P4 (19 November 2026).** Schema v1 is gone: the old kinds (`door`, `atrium`, `vertical-access`), `canConnect` and `uniqueId` no longer exist. Ids are whole numbers, `displayId` is removed (the id is the label), and operations use `ref`s instead of chosen ids.
