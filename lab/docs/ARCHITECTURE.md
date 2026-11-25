# Application architecture and contracts (implementation target)

## Flow
`DesignDocument (graph + view layout)` → validation → pure selectors/resolvers → Graph2D | Graph3D | Voxels3D | Architectural3D.
Student algorithms (`toolkits/<id>/algorithms/`, Stage 3) receive a **copy** of the DesignDocument and return data: an analysis, or spatial operations that `app/extensions` validates and applies atomically to a private draft, producing a preview that the user applies (or discards) explicitly in the algorithm panel; applying is one state replacement and one undo step, and is refused if the document changed since the run (including any undo or redo). Never have each viewer keep its own graph copy.

## Modules
`core/` holds reusable capabilities; `app/` holds this application; `student-api/` is the stable contract for student code; `toolkits/` holds independent student toolkits. `core/`, `app/` and `student-api/` are owner-maintained. Imports across modules use the `@core/*`, `@app/*` and `@student-api` aliases (defined once in `tsconfig.json`, read by Vite and Vitest); imports within a module stay relative. Aliases and boundary tests are architectural checks, not access control.

### Reusable core (`core/`) — never imports `app/`, `student-api/` or `toolkits/` (`core/boundary.test.ts`)
- `core/graph`: **generic** graph core — nodes/edges with stable IDs and arbitrary payloads, directed or undirected, configurable self-loop/parallel-edge policy, pure immutable operations, queries and structural validation. Imports nothing outside `core/graph` (no spatial, architecture, app, viewer, student code or packages); enforced by `core/graph/boundary.test.ts`.
- `core/spatial`: reusable integer-grid mathematics — `GridCoord` (z up), `gridKey`, horizontal/vertical face adjacency, the six cardinal `FACE_DIRECTIONS` and `neighbourCell`. Independent of any graph model or document; imports nothing outside `core/spatial` (`core/spatial/boundary.test.ts`).
- `core/viewer`: reusable viewing infrastructure with no document dependency — `coordinates.ts` (the one grid → Three.js mapping), `selection.ts` (single selection, reconciliation, highlight emphasis), `appearance.ts` (fallback type palette, selection colour). `core/viewer/three/`: `SceneCanvas` (R3F canvas used by all three 3D views: perspective camera, orbit controls, a camera rig that fits on mount and on request, refits on resize only while still automatically fitted, and can restore a remembered pose; `SceneLabel`), `viewport.ts` (`Bounds`, `Framing`, `CameraFit`, `CameraState`, `CameraMemory`, `GroundGrid`, and the aspect-aware `fitCameraToBounds`, which respects both the vertical and the horizontal field of view), `interaction.ts` (click-vs-drag), `picking.ts` (pointer handlers), `ViewControls` (overlay containers).

### Application (`app/`) — layered `document` → `building` → `extensions` → `views` → shell (`app/boundary.test.ts`)
- `app/document`: the design document, schema v2 (the only format since P4; v1 and its migration were removed and `app/document/v2` was flattened into `app/document`) — Zod schema with whole-number node/edge ids and never-reused id counters, validation, reading/writing, footprints, labels and style settings, plus the shared primitives (Function ids, positions, custom attribute values, diagram, metadata), issues and limits. Built-in example: `app/document/examples/house.json` (graph only, no toolkit). Pure: no React/Three.js; uses only `core/graph` and `core/spatial`. Frozen shapes: `docs/CONTRACTS-V2.md`.
- `app/spatial`: the pure spatial engine between `document` and `building` (relationship resolution, occupancy, spatial edits, design commands, the `DesignPort`).
- `app/building`: pure face-condition resolution separate from geometry construction; geometry built once per shared face; provisional façade specs. No React/Three.js; may use `app/document` and the pure `core/viewer` coordinates and selection helpers.
- `app/assets` (2026-11-17): imported 3DM façade modules — the pure adapter (units, `zUpToYUp`, panel frame, Repeat/Stretch placement), the embedded asset format (`FacadeAssetV1`, SHA-256, validation), module placement on building faces, and the 3DM reader (adapted from SpatialCore) behind a lazily imported browser entry (`rhino/browser.ts`, rhino3dm + WASM). No React/Three.js; layered between `building`/`metrics` and `extensions`/`project`. Decisions D1–D9 in `docs/DECISIONS.md`.
- `app/extensions`: the runtime behind the Student API — toolkit discovery (`toolkitGlobs.ts` is the only file that refers to `toolkits/`), selection and activation, runtime (Zod) validation of toolkit, function and algorithm definitions, document conformance to toolkit functions (stable diagnostic identities), type appearance, and validated algorithm execution with atomic transformations. Pure: no React/Three.js; the only app module that imports `@student-api`. See `docs/STUDENT-API.md`.
- `app/views`: the four views (Graph 2D with React Flow; Graph 3D, Voxels and Architecture with React Three Fiber/Three.js), the view contract (`ViewProps`, view modes), registry and panel memory (`panelMemory.ts`: view-local camera/viewport kept by the hosting panel across remounts). `app/views/three/` holds grid/document-specific 3D scene logic shared by the 3D views: node/edge items, storey levels, cell bounds, what the camera frames (`framingFor`), ground grid, colour-by, edge styles and their controls/legend.
- `app/` shell: shared document state, editing commands, selection, the full-viewport layout (programme phase 04: one compact header row with project/design identity, modified state, a problem badge, Undo/Redo and file actions; a LEFT rail with eight destinations (Gate F, docs/CONTRACTS-V3.md: Project, Attributes, Building Designer, Analyse, Transform, Scenarios, Camera, Display) whose content collapses back to the rail and starts collapsed below 1600 px; one or two view panels with mode selectors and the single/split toggle; a RIGHT panel with Properties only, collapsible to its rail), load/save UI and the document history (`App`, `Workspace`, `main`; `app/session/history.ts` and `documentSession.ts`: pure snapshot undo/redo of the document only, content-signature clean state, document revisions that algorithm results are bound to), the type-aware inspector (`app/inspector`) and the toolkit session (`app/session`: toolkit activation and switching (`toolkitSession.ts`), the toolkit status and its persistent diagnostics (Project → Advanced), unsaved-change protection, and the Transform panel with transformation preview/Apply/Discard). `app/analysis` (P4): the Analyse tab — built-in analyses (pure, on the generic measures of `core/graph/measures.ts`), the panel model (sections, "+" catalogue, source filter, input picking through the shared selection), explainers and `AnalysePanel`; results are highlighted in every view through the analysis overlay (`app/views/analysisOverlay.ts`). `app/views/project.ts` derives what views need from the active toolkit (façade provider, type status, conformance), passed as the optional `ViewProps.project`.
### Student API (`student-api/`) and toolkits (`toolkits/`)
- `student-api/`: compile-time contracts (typed attributes, toolkit and function definitions, algorithm contexts and results), identity `define…` helpers and a few pure graph/grid helpers. No validation; imports only `core/graph` and `core/spatial` (`student-api/boundary.test.ts`).
- `toolkits/<id>/`: one toolkit per folder with `toolkit.ts` and optional `functions/`, `designs/` (JSON; each one is offered by Open example…), `algorithms/` and `assets/` (façade `.3dm` files a design names by asset id; fetched only when such a design is opened, imported through the normal façade pipeline; 2026-11-20). Toolkit code imports only `@student-api` and its own files (`app/extensions/toolkitBoundary.test.ts`). One toolkit is active at a time, or none (P4: no toolkit is the default; a project without a toolkit keeps its own Functions and attributes). The owner's reference toolkit will be `toolkits/house/`; the repository may ship no toolkit at all.

## Spatial graph model — JSON document (schema v2)
```json
{
  "schemaVersion": 2,
  "metadata": {"name": "Three rooms"},
  "nextNodeId": 4,
  "nextEdgeId": 3,
  "nodes": [
    {"id": 1, "function": "living", "position": [0, 0, 0], "size": [1, 1, 1], "custom": {}},
    {"id": 2, "function": "kitchen", "position": [1, 0, 0], "size": [1, 1, 1], "custom": {}},
    {"id": 3, "function": "bedroom", "position": [0, 0, 1], "size": [1, 1, 1], "custom": {}}
  ],
  "edges": [
    {"id": 1, "source": 1, "target": 2, "relationship": "open", "custom": {}},
    {"id": 2, "source": 1, "target": 3, "relationship": "access", "custom": {}}
  ],
  "diagram": {"positions": {"1": [20,80], "2": [180,80], "3": [100,0]}},
  "settings": {"styleBy": "function", "styles": {}}
}
```
`id` is a whole number (P4), a stable identifier **not derived from coordinates**, and the label shown everywhere; new ids come from `nextNodeId` / `nextEdgeId` and are never reused. `position` is the room's minimum-corner cell and `size` its extent in cells, distinct from diagram.positions in 2D diagram units. Custom attribute values (`custom`) are JSON primitives. One vocabulary everywhere (2026-11-19): `function`, `position`, `size`, `custom`, `relationship` (`docs/DECISIONS.md`). Full contract: `docs/CONTRACTS-V2.md`.

## Graph rules
1. Every node has a unique ID and a unique integer triplet `[x,y,z]`. No inactive nodes; deleting a node removes its incident edges and diagram position.
2. Every edge references two different existing nodes; no duplicate relationship for the same unordered pair. Edges are undirected.
3. Relationship kinds are `access` and `open`. Rooms that share a face get a door / no wall (side by side) or a slab opening with an access marker / a slab void (stacked); a vertical relationship is conceptual, never a validated staircase.
4. Rooms that do not touch may still be related: spatial feasibility (direct / routed / unresolved) is derived, never a validation error (CONTRACTS-V2 §2, CONTRACTS-V3 §4).
5. Adjacent **without** a relationship: an internal partition, never a doorway.
6. Ids are whole numbers below the document's counters and are never reused.
7. Self-edges and invalid function ids must be rejected with readable errors; unresolved edges are removed only explicitly.
8. Use an explicit schema version; schema v2 is the only format read (P4: no v1 reader, no backward compatibility before distribution).

## Architectural boundary resolution
- Inspect the six cardinal neighbour slots for every node. A missing neighbour is `exterior` (exposed), including above/below if applicable.
- For a horizontal boundary between two occupied cells: `access`→door-wall; `open`→opening/no partition; no edge→solid internal wall (face conditions are named by `connectionCondition` in `app/building`).
- For an exposed horizontal face: choose façade configuration of the **occupying node's type** (gallery can glaze, storage can be closed); do not add exterior graph edges to empty cells.
- For vertical contact: no edge→solid separation; `open`→slab void (`atrium` condition); `access`→slab opening (`vertical-access` condition).
- Generate each pair's shared face once using deterministic ownership (the room with the lower id), not one wall per node.
- Exterior faces are authored once by their owning cell; perimeter entrance/door is a deferred separate feature.
- For multi-floor cases, slab ownership and geometry must be verified separately; initial architectural phase may be single level.

## Boundary shifts (2026-11-24)
- An edge's optional `boundaryShift` (`none` | `toward-source` | `toward-target`) REQUESTS that its rooms' shared wall moves 1.5 m into the source / target room. The graph, positions, sizes, occupancy and voxels stay nominal; only the architecture and the actual area follow APPLIED shifts. Source/target is an orientation convention only (edges stay undirected); a door swings into its edge's target (Plan).
- `resolveBoundaryShifts(doc, spatial)` (`app/building/boundaryShift.ts`, memoised as `boundaryShiftsOf`) resolves requests in STORED EDGE ORDER: no request → `no-request`; stacked → `stacked-rooms`; different storey extents → `storey-mismatch`; not a direct horizontal contact → `not-touching`; the shared wall must be the shrinking room's whole side (all storeys, whole 3 m cells) → else `partial-wall`; a room already in an applied shift → `room-already-adjusted`; a corridor end on a side wall of the strip, or a floor/ceiling opening in it → `opening-conflict`; a face split along two axes → `overlapping-adjustment`. Otherwise applied, and both rooms are reserved; refused requests reserve nothing and stay stored.
- Faces: `buildingFacesV2` = `resolveBuildingFaces` → `applyBoundaryShifts` → roof policy, shared by Building and Plan. The moved shared wall keeps its id with `planeOffset` ±1.5 m; every face of the strip across the shift (side walls, floor, roof) becomes two half faces `<id>#0` / `<id>#1` (`split`); a half given to the growing room gets the condition of its new pair (internal wall, the enclosed room's façade beside an open-walled room, or open for a directly built Open relationship; slabs plain). A door on a shortened wall stays on its relationship's half, centred. Half faces get a Repeat-style window and are left out of Stretch windows, wall runs and imported façade modules. Realised plan footprints: `realisedFootprint` (one or two rectangles); `PlanRoom.rect` stays the nominal box (editing), `footprint` is drawn.
- Derived values (metrics): `actual-area`, `boundary-adjusted` (nodes), `boundary-shift-applied`, `boundary-shift-status` (edges); `area` keeps its id and is labelled Nominal area. Other metrics stay nominal.

## Student function definition (Stage 3; renamed 2026-11-19)
In `toolkits/<id>/functions/<file>.ts`, `export default defineFunction({ id, label, colour?, facade?, custom? })` — typed declarations, not renderer code. Definitions are validated at runtime on activation; an invalid or duplicated definition is disabled with a conspicuous error (no silent fallback), while a node `function` with no definition keeps the existing fallback colour and façade. Function colours (2026-11-20) resolve project colour (Functions dialog) → the definition's `colour` → automatic `typeColor`, through one resolver (`functionColourResolver`, provided to views by `FunctionColourContext`). Procedural style functions and GLB assets are **later phases**. Full contract: `docs/STUDENT-API.md`.

## User interface v1
- Compact main toolbar: Undo/Redo (also Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y outside text fields), load example, import/export. Single/split is in the first view panel's header.
- Each viewport: dropdown `Graph 2D`, `Graph 3D`, `Voxels`, `Building`, `Plan` (Gate F); 1, 2 or 4 viewports with maximise. In Graph 2D edit; in 3D select/highlight only.
- Graph 2D uses readable arbitrary 2D diagram positions for **all levels**. Visual edge encoding distinguishes horizontal and vertical types with legend/icons. No floor filtering by default.
- (Superseded by programme phase 04: left rail Project / Attributes / Designer / Algorithms, right Properties only.) Originally: right-side sidebar with Inspector and Algorithms tabs; the inspector shows the selected node (type, physical grid coordinates, attributes) or selected edge (kind). Edits validate before applying.
- Preserve graph positions when changing layout. For physical relocation use inspector with collision and edge-validity diagnostics, never diagram drag.
- Split view defaults to Graph 2D + Architecture when architecture available; early phases default to Graph 2D + Voxels. Independent 3D camera controls; selection synchronised.
- Voxel view: colour based on selected categorical/numeric attribute; type ID is default; handle absent attributes and legends. Semitransparent cubes.
- Architecture view: procedural boxes/slabs with simple door/window openings, not complicated CSG. Show open-top initially to inspect interior; a later toggle can enable roof/slab/cutaway.
- 3D picking must be linked to node IDs; no direct 3D graph topology editing in prototype.

## Performance and validation
Sparse nodes; don't instantiate an infinite grid. Configurable node count and coordinate range limits, with explanatory UI. Debounce/recompute derived geometry sensibly. Avoid redundant expensive scene re-creation on selection changes. Pure graph/face tests do not require WebGL.

## Tests / acceptance examples
A. Graph round-trip retains ID, position/diagram coords, functions and edge relationships.
B. Dragging graph diagram node changes diagram only, not 3D cell.
C. Two neighbouring occupied cells with no edge produce **one** shared solid wall.
D. Adding door changes only that shared wall to a door-wall; changing to open removes it.
E. Removing one neighbouring node converts the surviving cell boundary to a type-specific exterior façade.
F. Two disconnected clusters remain separate; a physical touch without access is not a connected access component.
G. Vertical relation A(0,0,0) to C(0,0,1) is built directly; a relation to (1,0,1) is valid but unresolved (different storey, not touching).
H. Selecting an ID highlights matching representation in both views; camera positions stay independently set.
I. Invalid JSON does not replace the current valid document, and errors show where the data failed.
J. Same document, same resolver yields same face output; no reliance on rendering order.
