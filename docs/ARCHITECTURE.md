# Application architecture and contracts (implementation target)

## Flow
`DesignDocument (graph + view layout)` → validation → pure selectors/resolvers → Graph2D | Graph3D | Voxels3D | Architectural3D.
Student algorithms (`projects/<id>/algorithms/`, Stage 3) receive a **copy** of the DesignDocument and return data: an analysis, or spatial operations that `app/extensions` validates and applies atomically to a private draft, producing a preview that the user applies (or discards) explicitly in the algorithm panel; applying is one state replacement and one undo step, and is refused if the document changed since the run (including any undo or redo). Never have each viewer keep its own graph copy.

## Modules
`core/` holds reusable capabilities; `app/` holds this application; `student-api/` is the stable contract for student code; `projects/` holds independent student projects. `core/`, `app/` and `student-api/` are owner-maintained. Imports across modules use the `@core/*`, `@app/*` and `@student-api` aliases (defined once in `tsconfig.json`, read by Vite and Vitest); imports within a module stay relative. Aliases and boundary tests are architectural checks, not access control.

### Reusable core (`core/`) — never imports `app/`, `student-api/` or `projects/` (`core/boundary.test.ts`)
- `core/graph`: **generic** graph core — nodes/edges with stable IDs and arbitrary payloads, directed or undirected, configurable self-loop/parallel-edge policy, pure immutable operations, queries and structural validation. Imports nothing outside `core/graph` (no spatial, architecture, app, viewer, student code or packages); enforced by `core/graph/boundary.test.ts`.
- `core/spatial`: reusable integer-grid mathematics — `GridCoord` (z up), `gridKey`, horizontal/vertical face adjacency, the six cardinal `FACE_DIRECTIONS` and `neighbourCell`. Independent of any graph model or document; imports nothing outside `core/spatial` (`core/spatial/boundary.test.ts`).
- `core/viewer`: reusable viewing infrastructure with no document dependency — `coordinates.ts` (the one grid → Three.js mapping), `selection.ts` (single selection, reconciliation, highlight emphasis), `appearance.ts` (fallback type palette, selection colour). `core/viewer/three/`: `SceneCanvas` (R3F canvas used by all three 3D views: perspective camera, orbit controls, a camera rig that fits on mount and on request, refits on resize only while still automatically fitted, and can restore a remembered pose; `SceneLabel`), `viewport.ts` (`Bounds`, `Framing`, `CameraFit`, `CameraState`, `CameraMemory`, `GroundGrid`, and the aspect-aware `fitCameraToBounds`, which respects both the vertical and the horizontal field of view), `interaction.ts` (click-vs-drag), `picking.ts` (pointer handlers), `ViewControls` (overlay containers).

### Application (`app/`) — layered `document` → `building` → `extensions` → `views` → shell (`app/boundary.test.ts`)
- `app/document`: the v1 spatial design document built on `core/graph` and `core/spatial` — Zod schema, edge kinds and their face-adjacency rules, document validation, graph commands and JSON serialization. The canonical built-in example design is `app/document/examples/two-storey-example.json`. `designGraph(doc)` is the zero-copy adapter to the generic core (policy: undirected, no self-loops, no parallel edges). Pure: no React/Three.js; uses only `core/graph` and `core/spatial`.
- `app/building`: pure face-condition resolution separate from geometry construction; geometry built once per shared face; provisional façade specs. No React/Three.js; may use `app/document` and the pure `core/viewer` coordinates and selection helpers.
- `app/extensions`: the runtime behind the Student API — project discovery (`projectGlobs.ts` is the only file that refers to `projects/`), selection and activation, runtime (Zod) validation of project, node type and algorithm definitions, document conformance to project types (stable diagnostic identities), type appearance, and validated algorithm execution with atomic transformations. Pure: no React/Three.js; the only app module that imports `@student-api`. See `docs/STUDENT-API.md`.
- `app/views`: the four views (Graph 2D with React Flow; Graph 3D, Voxels and Architecture with React Three Fiber/Three.js), the view contract (`ViewProps`, view modes), registry and panel memory (`panelMemory.ts`: view-local camera/viewport kept by the hosting panel across remounts). `app/views/three/` holds grid/document-specific 3D scene logic shared by the 3D views: node/edge items, storey levels, cell bounds, what the camera frames (`framingFor`), ground grid, colour-by, edge styles and their controls/legend.
- `app/` shell: shared document state, editing commands, selection, the full-viewport layout (compact header, project bar, one or two view panels with mode selectors and the single/split toggle in their headers, and a collapsible sidebar with Inspector and Algorithms tabs that scrolls independently), load/save UI and the document history (`App`, `Workspace`, `main`; `app/session/history.ts` and `documentSession.ts`: pure snapshot undo/redo of the document only, content-signature clean state, document revisions that algorithm results are bound to), the type-aware inspector (`app/inspector`) and the project session (`app/session`: project activation and switching, the project bar with persistent diagnostics, unsaved-change protection, and the algorithm panel with analysis results and transformation preview/Apply/Discard). `app/views/project.ts` derives what views need from the active project (façade provider, type status, conformance), passed as the optional `ViewProps.project`.
### Student API (`student-api/`) and projects (`projects/`)
- `student-api/`: compile-time contracts (typed attributes, project and node type definitions, algorithm contexts and results), identity `define…` helpers and a few pure graph/grid helpers. No validation; imports only `core/graph` and `core/spatial` (`student-api/boundary.test.ts`).
- `projects/<id>/`: one project per folder with `project.ts` and optional `types/`, `designs/` (JSON) and `algorithms/`. Project code imports only `@student-api` and its own files (`app/extensions/projectBoundary.test.ts`). One project is active at a time. `projects/example-gallery/` is the owner's reference project.

## Spatial graph model — JSON document v1
```json
{
  "schemaVersion": 1,
  "metadata": {"name": "Three rooms"},
  "nodes": [
    {"id":"a","grid":[0,0,0],"typeId":"gallery","attributes":{}},
    {"id":"b","grid":[1,0,0],"typeId":"studio","attributes":{}},
    {"id":"c","grid":[0,0,1],"typeId":"gallery","attributes":{}}
  ],
  "edges": [
    {"id":"ab","source":"a","target":"b","kind":"door","attributes":{}},
    {"id":"ac","source":"a","target":"c","kind":"atrium","attributes":{}}
  ],
  "diagram": {"positions":{"a":[20,80],"b":[180,80],"c":[100,0]}}
}
```
`id` is a stable identifier **not derived from coordinates**, so relocation does not change identity. `grid` coordinates are integer spatial addresses, distinct from diagram.positions in 2D pixel/diagram units. Attribute values should initially be JSON primitives (number, string, boolean, null) rather than arbitrary JavaScript objects. Node type definitions are resolved separately.

## Graph rules
1. Every node has a unique ID and a unique integer triplet `[x,y,z]`. No inactive nodes; deleting a node removes its incident edges and diagram position.
2. Every edge references two different existing nodes; no duplicate architectural relationship for the same unordered pair. Edges are undirected in v1.
3. Horizontal `door` / `open`: Manhattan distance exactly 1 in x/y and zero in z.
4. Vertical `atrium` / `vertical-access`: same x/y, adjacent z. A vertical edge is conceptual: it may produce an opening or symbolic marker, not a validated staircase.
5. Adjacent **without** an access edge: an internal partition, never a doorway.
6. Non-face-adjacent graph relationships are deliberately unsupported in v1; add a different edge namespace/category if needed later.
7. Self-edges, invalid node type IDs and geometry-invalid edges must be rejected with readable errors.
8. Use explicit schema version and migration plan before breaking JSON format.

## Architectural boundary resolution
- Inspect the six cardinal neighbour slots for every node. A missing neighbour is `exterior` (exposed), including above/below if applicable.
- For a horizontal boundary between two occupied cells: `door`→door-wall; `open`→opening/no partition; no edge→solid internal wall.
- For an exposed horizontal face: choose façade configuration of the **occupying node's type** (gallery can glaze, storage can be closed); do not add exterior graph edges to empty cells.
- For vertical contact: no edge→solid separation; atrium→slab opening; vertical-access→opening + generic symbolic circulation marker **only once implemented**.
- Generate each pair's shared face once using deterministic ownership (compare stable node IDs), not one wall per node.
- Exterior faces are authored once by their owning cell; perimeter entrance/door is a deferred separate feature.
- For multi-floor cases, slab ownership and geometry must be verified separately; initial architectural phase may be single level.

## Student node type definition (Stage 3)
In `projects/<id>/types/<file>.ts`, `export default defineNodeType({ id, label, facade?, attributes? })` — typed declarations, not renderer code. Definitions are validated at runtime on activation; an invalid or duplicated definition is disabled with a conspicuous error (no silent fallback), while a `typeId` with no definition keeps the existing fallback colour and façade. Custom colours, procedural style functions and GLB assets are **later phases**. Full contract: `docs/STUDENT-API.md`.

## User interface v1
- Compact main toolbar: Undo/Redo (also Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y outside text fields), load example, import/export. Single/split is in the first view panel's header.
- Each viewport: dropdown `Graph 2D`, `Graph 3D`, `Voxels`, `Architecture`. In Graph 2D edit; in 3D select/highlight only.
- Graph 2D uses readable arbitrary 2D diagram positions for **all levels**. Visual edge encoding distinguishes horizontal and vertical types with legend/icons. No floor filtering by default.
- Right-side sidebar with Inspector and Algorithms tabs; the inspector shows the selected node (type, physical grid coordinates, attributes) or selected edge (kind). Edits validate before applying.
- Preserve graph positions when changing layout. For physical relocation use inspector with collision and edge-validity diagnostics, never diagram drag.
- Split view defaults to Graph 2D + Architecture when architecture available; early phases default to Graph 2D + Voxels. Independent 3D camera controls; selection synchronised.
- Voxel view: colour based on selected categorical/numeric attribute; type ID is default; handle absent attributes and legends. Semitransparent cubes.
- Architecture view: procedural boxes/slabs with simple door/window openings, not complicated CSG. Show open-top initially to inspect interior; a later toggle can enable roof/slab/cutaway.
- 3D picking must be linked to node IDs; no direct 3D graph topology editing in prototype.

## Performance and validation
Sparse nodes; don't instantiate an infinite grid. Configurable node count and coordinate range limits, with explanatory UI. Debounce/recompute derived geometry sensibly. Avoid redundant expensive scene re-creation on selection changes. Pure graph/face tests do not require WebGL.

## Tests / acceptance examples
A. Graph round-trip retains ID, physical/diagram coords, node types and typed edges.
B. Dragging graph diagram node changes diagram only, not 3D cell.
C. Two neighbouring occupied cells with no edge produce **one** shared solid wall.
D. Adding door changes only that shared wall to a door-wall; changing to open removes it.
E. Removing one neighbouring node converts the surviving cell boundary to a type-specific exterior façade.
F. Two disconnected clusters remain separate; a physical touch without access is not a connected access component.
G. Vertical relation A(0,0,0) to C(0,0,1) is valid; vertical relation to (1,0,1) is rejected for architectural edges.
H. Selecting an ID highlights matching representation in both views; camera positions stay independently set.
I. Invalid JSON does not replace the current valid document, and errors show where the data failed.
J. Same document, same resolver yields same face output; no reliance on rendering order.
