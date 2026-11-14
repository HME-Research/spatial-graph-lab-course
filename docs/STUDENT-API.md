# Student API (v1)

How to write your own node types, designs and algorithms for Spatial Graph Lab. Your code lives in **one project folder** and imports **only** `@student-api`.

> Status (Stage 3A): projects are discovered, validated and executable, and fully tested. Showing the active project in the app — its default design, its façades, the algorithm controls and the transformation preview — arrives in Stage 3B. Until then, open a project design with **Open JSON…**.

## 1. Your project folder

```
projects/
  my-project/             ← folder name = project id (lowercase letters, digits, "-")
    project.ts            ← required
    types/                ← optional: one node type per file
    designs/              ← optional: design JSON files (schema v1)
    algorithms/           ← optional: one algorithm per file
```

Start by copying `projects/example-gallery/` to a new folder. Don't edit `example-gallery` itself: it's the reference project, and tests check that it stays the same.

**Choosing the active project.** One project is active at a time:
1. `?project=my-project` in the app URL;
2. otherwise `VITE_SGL_PROJECT=my-project` in a local `.env.local` file;
3. otherwise `example-gallery`.

If you ask for a project that doesn't exist, the app shows an error. It never quietly switches to another project.

```ts
// projects/my-project/project.ts
import { defineProject } from '@student-api';

export default defineProject({
  name: 'My project',
  defaultDesign: 'my-design', // optional: designs/my-design.json is loaded at startup
});
```

If `defaultDesign` is left out, the built-in example is loaded. If it's set but the file is missing or invalid, nothing is loaded and an error is shown.

## 2. Node types

```ts
// projects/my-project/types/gallery.ts
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

Attribute kinds are `number` (with optional `min` and `max`), `text`, `boolean` and `enum` (`values`). Each attribute may have a `default`. Stored values are always JSON primitives, exactly as in schema v1.

If you leave out `facade`, the type keeps the app's existing façade. Every type uses the existing colour for its id; custom colours aren't supported yet.

### How the app treats your attributes

| Situation in a design | What happens |
|---|---|
| Declared attribute missing, or `null` | Fine. Algorithms read the default, or nothing. The design file is **not** changed. |
| Declared attribute with a wrong value (e.g. `daylight: "bright"`) | Warning. The value is kept. Algorithms read the default, or nothing. |
| Attribute your type doesn't declare | Information only. The value is kept exactly as it is. |
| Node whose `typeId` your project doesn't define | Warning. It keeps the app's fallback colour and façade. |
| Your type definition is invalid, or two files use the same `id` | **Error.** That type is disabled. Its nodes are flagged, and algorithms can't use it. |

Loading a design is never blocked by these checks.

## 3. Designs

Designs are schema-v1 JSON files: see `docs/ARCHITECTURE.md` and `projects/example-gallery/designs/`. Each file's name (without `.json`) is its design id. An invalid design is listed with its errors and can't be loaded.

## 4. Algorithms

An algorithm never changes the design directly. It returns a result, and the app checks it.

### Generic graph analysis

A graph algorithm sees **only node ids and edges** (`graph.nodes: {id}[]`, `graph.edges: {id, source, target}[]`, `graph.policy`), so it works on any graph. It returns one value per node.

```ts
import { defineGraphAlgorithm, neighbours } from '@student-api';

export default defineGraphAlgorithm({
  id: 'degree',
  label: 'Number of connections',
  run({ graph }) {
    const nodeValues: Record<string, number> = {};
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
| `design.nodes` | `{ id, typeId, grid: [x, y, z], attributes }`; z is the storey |
| `design.edges` | `{ id, source, target, kind, attributes }`; kind is `door`, `open`, `atrium` or `vertical-access` |
| `nodeAt(cell)` | id of the node in that cell, or `undefined` if the cell is free |
| `canConnect(kind, a, b)` | whether that edge kind may join two cells (face adjacency) |
| `attributesOf(node, type)` | typed attribute values, with defaults applied; `type` is imported from your `types/` folder |
| `params` | your parameters, already checked, with defaults applied |

It returns a list of **operations**:

| Operation | Rules |
|---|---|
| `{ op: 'add-node', id, grid, typeId, attributes? }` | New unique id, an explicit free integer cell, a valid type of your project, and only declared attributes with valid values |
| `{ op: 'add-edge', id, source, target, kind }` | New unique id, existing nodes, an existing edge kind, the correct adjacency, and not already connected |
| `{ op: 'set-node-attribute', nodeId, key, value }` | The attribute must be declared by the node's (valid) type; the value must be valid, or `null` |

The operations are applied **in order** and **all together**: a later operation may use a node added by an earlier one. If any operation, or the final design, is invalid, nothing changes and the error names the operation.

A transformation is also rejected if it would create a new warning or error, for example an invalid attribute value. Existing problems in the design don't stop it.

Example: add a gallery in a free cell next to an existing gallery, and connect it with a door.

```ts
import { defineSpatialAlgorithm, FACE_DIRECTIONS, neighbourCell, uniqueId } from '@student-api';
import gallery from '../types/gallery';

export default defineSpatialAlgorithm({
  id: 'extend-gallery',
  label: 'Extend a gallery',
  run(ctx) {
    for (const room of ctx.design.nodes.filter((n) => n.typeId === gallery.id)) {
      for (const direction of FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z')) {
        const cell = neighbourCell(room.grid, direction);
        if (ctx.nodeAt(cell) !== undefined) continue;          // occupied
        const id = uniqueId(ctx.design, 'gallery');
        const doorId = uniqueId(ctx.design, 'door', [id]);
        return {
          kind: 'transformation',
          operations: [
            { op: 'add-node', id, grid: cell, typeId: gallery.id, attributes: { daylight: 'medium' } },
            { op: 'add-edge', id: doorId, source: room.id, target: id, kind: 'door' },
          ],
        };
      }
    }
    return { kind: 'transformation', summary: 'No free cell next to a gallery.', operations: [] };
  },
});
```

When you create several items in one run, pass the ids you've already chosen to `uniqueId(graph, prefix, taken)`.

## 5. Parameters

Algorithms may declare `parameters` using the same kinds as attributes. For example, `parameters: { start: { kind: 'text', default: 'entry-gallery' } }` is read as `ctx.params.start`. Values are checked before `run` is called.

## 6. Checks and limits

- TypeScript checks your code when you run `npm run typecheck`, but the app **also checks everything at runtime**, because the development server runs code without type checking.
- Your project may import only `@student-api` and files in your own project folder. Tests enforce this.
- This is not a security sandbox: an infinite loop in an algorithm freezes the browser tab.
- Use deterministic rules. If you need randomness, derive it from a parameter (a seed) so results can be reproduced.

## 7. Reference

Exports of `@student-api`:
- **Definitions:** `defineProject`, `defineNodeType`, `defineGraphAlgorithm`, `defineSpatialAlgorithm`
- **Graph helpers:** `neighbours`, `incidentEdges`, `edgesBetween`, `getNode`, `getEdge`, `opposite`, `uniqueId`
- **Grid helpers:** `FACE_DIRECTIONS`, `neighbourCell`
- **Types:** `AttributeSpec`, `AttributeValue`, `AttributesOf`, `NodeTypeDefinition`, `ProjectDefinition`, `Graph`, `NodeRecord`, `EdgeRecord`, `GridCoord`, `SpatialNode`, `SpatialEdge`, `SpatialEdgeKind`, `SpatialOperation`, `AnalysisResult`, `TransformationResult`, `GraphAlgorithmContext`, `SpatialAlgorithmContext`
