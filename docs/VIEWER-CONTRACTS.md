# Viewer integration contracts (v1)

Shared interfaces that let three worktrees build their views in parallel. Paths below reflect the Stage 2 layout (`core/` reusable, `app/` application; see `docs/ARCHITECTURE.md`); the contracts themselves are unchanged.

| Workstream | Builds | Owns (may edit) |
|---|---|---|
| **A** 2D graph editing | Graph 2D editor + inspector | `app/views/graph2d/**`, `app/inspector/**` |
| **B** 3D graph + voxels | Graph 3D view, voxel view | `app/views/graph3d/**`, `app/views/voxels/**`, document-specific 3D scene logic in `app/views/three/**`; generic R3F viewport helpers in `core/viewer/three/**` through the owner |
| **C** Architecture | Face resolver, geometry, architecture view | `app/building/**` (except `contracts.ts`), `app/views/architecture/**` |

**Frozen during parallel work** (change only through the owner): `core/**` (including `core/graph`, `core/spatial`, `core/viewer/selection.ts`, `coordinates.ts`, `appearance.ts`), `app/document/**`, `app/views/contracts.ts`, `app/views/registry.ts`, `app/building/contracts.ts`, `app/App.tsx`, `app/Workspace.tsx`, root config, `docs/`. The document schema (v1) is unchanged.

Each workstream **replaces the body of its placeholder file**, keeping the export name and props. Because the registry and host already import those names, no workstream needs to edit `App.tsx`, and every view can be seen in the running app (`npm run dev`) straight away.

## 1. Data flow

```
App (owns DesignDocument + Selection)
 ├─ Workspace → ViewPanel ×1–2 (each picks a ViewMode) → VIEW_COMPONENTS[mode](ViewProps)
 └─ Inspector(ViewProps)
Views ──onSelect(Selection)──▶ App
Views ──onCommand(GraphCommand)──▶ App: applyGraphCommand(doc, cmd) → validated doc or issues
```

- The graph is the single source of truth. Views receive `doc` as read-only input and **never mutate it, copy it into state, or keep their own graph**. Derive everything with `useMemo` from `doc`.
- All edits go through `onCommand`. The app validates them, replaces the document only on success, and will own undo/redo later (commands are serialisable for that reason).

## 2. Shared props — `app/views/contracts.ts`

```ts
interface ViewProps {
  readonly doc: DesignDocument;
  readonly selection: Selection;
  readonly onSelect: (selection: Selection) => void;
  readonly onCommand: (command: GraphCommand) => CommandOutcome;
}
type CommandOutcome = { ok: true } | { ok: false; issues: readonly GraphIssue[] };
type InspectorProps = ViewProps;
type ViewMode = 'graph2d' | 'graph3d' | 'voxels' | 'architecture';
```

`onCommand` is **synchronous**: the outcome reflects validation against the latest document. On `ok: false`, show the issues (use `formatIssuePath(issue.path)` + `issue.message`); the document is unchanged. 3D views are read-only and must not call `onCommand`.

View sizing: the view is rendered inside `.view-body` (`position: relative`, min-height 440 px). Fill it (`width/height: 100%`). Each panel is its own component instance, so view-local UI state (camera, colour-by choice, zoom) lives inside the view and survives document/selection changes.

## 3. Graph commands — `app/document/apply.ts`

```ts
type GraphCommand =
  | { type: 'add-node'; node: NewNode; diagramPosition?: DiagramPosition }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'move-node'; nodeId: string; grid: GridCoord }          // physical relocation (inspector)
  | { type: 'set-node-type'; nodeId: string; typeId: string }
  | { type: 'set-node-attributes'; nodeId: string; attributes: Attributes } // replaces the record
  | { type: 'set-diagram-position'; nodeId: string; position: DiagramPosition }
  | { type: 'add-edge'; edge: NewEdge }
  | { type: 'remove-edge'; edgeId: string }
  | { type: 'change-edge-kind'; edgeId: string; kind: EdgeKind };
applyGraphCommand(doc, command, options?): Result<DesignDocument>
```

These map one-to-one onto the Phase 1 pure commands in `app/document/commands.ts` (which delegate topology changes to the generic `core/graph`). `setNodeType` and `setNodeAttributes` were added for the inspector. No command creates edges implicitly.

## 4. Selection — `core/viewer/selection.ts`

```ts
type Selection = { kind: 'none' } | { kind: 'node'; id: string } | { kind: 'edge'; id: string };
NO_SELECTION, selectNode(id), selectEdge(id), isNodeSelected(sel, id), isEdgeSelected(sel, id),
sameSelection(a, b), reconcileSelection(sel, doc)
```

Conventions for every view:
- Single selection in v1. Clicking a node → `onSelect(selectNode(id))`; an edge → `onSelect(selectEdge(id))`; empty background → `onSelect(NO_SELECTION)`.
- In 3D, an orbit or pan drag must **not** change the selection (only a click with negligible pointer movement does).
- Highlight the selected item with `SELECTION_COLOR`. When an edge is selected, views may also emphasise its two endpoint nodes. Selection changes must not rebuild scene geometry or reset cameras: apply highlights as material/style changes.
- The app reconciles the selection after every document change. A deleted node or edge is deselected automatically, and loading a new file clears the selection.

## 5. Coordinates — `core/viewer/coordinates.ts` (the only grid→Three.js mapping)

```ts
interface CellSize { horizontal: number; vertical: number }   // DEFAULT_CELL_SIZE = { 3, 3 } metres
type WorldPoint = readonly [x: number, y: number, z: number];
spatialToThree(grid: readonly [number, number, number], cell = DEFAULT_CELL_SIZE): WorldPoint
```

| Grid (document, **z up**) | Three.js (**Y up**, right-handed) |
|---|---|
| `x` | `X = x · horizontal` |
| `z` (storey) | `Y = (z + 0.5) · vertical` — ground storey stands on Y = 0 |
| `y` | `Z = −y · horizontal` |

- An integer grid coordinate is the **cell centre**. A cell's box size in Three.js is `[horizontal, vertical, horizontal]`.
- Fractional inputs give derived points: the shared face of `[0,0,0]`/`[1,0,0]` is at grid `[0.5,0,0]`, and the floor of storey `z` is at grid `z − 0.5`.
- No Three.js import, so it can be used in pure code and tests. Never hand-roll another axis swap.
- Diagram positions (2D) are unrelated to this mapping. Graph 2D must never call it, and 3D views must never read `doc.diagram`.

## 6. Appearance — `core/viewer/appearance.ts`

`typeColor(typeId)` gives the deterministic fallback colour per node type, used identically in 2D and 3D. Stage 3 project node types keep this colour (custom colours are deferred); `typeAppearance` in `app/extensions` adds project façades, wired into the views in Stage 3B. `SELECTION_COLOR` is the shared highlight colour.

## A. Graph 2D editing — implement `Graph2DView` and `Inspector`

- `app/views/graph2d/Graph2DView.tsx` exports `Graph2DView(props: ViewProps)`. `app/inspector/Inspector.tsx` exports `Inspector(props: InspectorProps)`.
- Graph 2D is one abstract diagram of all storeys, positioned only from `doc.diagram.positions`. A node without a position gets a **deterministic fallback position** for display, and the document is not written until the user drags it.
- Dragging emits `set-diagram-position` **once, on drag stop**. Intermediate positions may be view-local. Dragging never emits `move-node`.
- Creating an edge requires an explicit kind choice (`door`/`open` horizontal, `atrium`/`vertical-access` vertical). Pre-check with `isEdgeGeometryValid` to guide the user, but the `onCommand` outcome is authoritative: show its issues on rejection. Edge styling and a legend must distinguish horizontal from vertical kinds (`isVerticalKind`).
- New IDs must be unique, must match the ID pattern in `app/document/schema.ts`, and must not be derived from coordinates (for example `node-7`, `edge-3`).
- Inspector: edit type (`set-node-type`), physical cell (`move-node`, showing collision/edge-validity issues), attributes (`set-node-attributes`) and edge kind (`change-edge-kind`). Removal uses `remove-node`/`remove-edge`.
- Dependency: React Flow (`@xyflow/react`) per DECISIONS.md, pending owner approval of the version.

## B. 3D graph and voxels — implement `Graph3DView` and `VoxelView`

- `app/views/graph3d/Graph3DView.tsx` exports `Graph3DView(props: ViewProps)`. `app/views/voxels/VoxelView.tsx` exports `VoxelView(props: ViewProps)`.
- Each view renders its **own** R3F `<Canvas>` with its own camera and orbit controls, so two 3D panels have independent cameras. Do not lift camera state into the app.
- Positions come only from `spatialToThree(node.grid)`. Graph 3D: a node marker at each cell centre, and edge lines between the endpoints' centres (edges are relationships, not stairs or corridors). Voxels: semi-transparent boxes of size `[horizontal, vertical, horizontal]`.
- Voxel colour-by is view-local UI: `typeId` (default, `typeColor`) or a chosen attribute key, with a legend and a visible fallback for missing values.
- Picking reports node IDs (and edge IDs in Graph 3D) via `onSelect`, following §4.
- Dependencies: `three`, `@react-three/fiber`, `@types/three`. Any controls helper (for example `@react-three/drei`) needs owner approval.

## C. Architectural faces and geometry — implement against `app/building/contracts.ts`

```ts
FACE_DIRECTIONS = ['+x','-x','+y','-y','+z','-z'];  FACE_DIRECTION_OFFSETS: Record<FaceDirection, GridCoord>
type FaceCondition = 'exterior' | 'solid' | EdgeKind;
interface ResolvedFace {
  id: string;               // `${ownerNodeId}:${direction}`
  ownerNodeId: string; ownerTypeId: string; cell: GridCoord;
  direction: FaceDirection; orientation: 'wall' | 'slab';
  neighbourNodeId: string | null; edgeId: string | null; condition: FaceCondition;
}
type FaceResolver = (doc: DesignDocument) => readonly ResolvedFace[];
interface FacadeSpec { windowFraction: number }      // provisional until Phase 6
type FacadeProvider = (typeId: string) => FacadeSpec;
```

- Implement `export const resolveFaces: FaceResolver` (suggested file `app/building/resolve.ts`). It is pure, with no React or Three.js, and works in grid space.
- Rules: no neighbour → `exterior`. Occupied neighbour without an edge → `solid`. With an edge → the edge's kind. Each shared face is emitted **once**, owned by the node whose ID sorts first (`a < b`). Output is sorted by `ownerNodeId`, then `FACE_DIRECTIONS` order, and does not depend on array order (acceptance C, D, E, J).
- Geometry: a separate pure step from `ResolvedFace[]` to plain box descriptors in world space built with `spatialToThree`. A face centre is `cell + offset/2` in grid space. Use simple boxes and slab segments (no CSG). Exterior walls use `FacadeProvider(ownerTypeId)`. The view is open-top initially. Atrium and vertical-access faces are openings or symbolic markers, never staircases.
- `app/views/architecture/ArchitectureView.tsx` exports `ArchitectureView(props: ViewProps)`: its own `<Canvas>` and camera, as in B. Picking: faces with an `edgeId` select that edge; other faces select `ownerNodeId`.
- Dependencies: same as B. C should deliver the resolver and geometry with tests first (no dependencies needed). If the view is built before B merges, use **exactly** B's versions so the lockfile can be regenerated cleanly at merge.

## Merge notes

- `package.json` and `package-lock.json` will conflict when A and B (and possibly C) add dependencies. Resolve this by merging `package.json` by hand and then running `npm install` to regenerate the lockfile.
- Before merging, each workstream runs `npm run typecheck`, `npm test -- --run` and `npm run build`. Pure logic needs unit tests (Vitest, node environment, `core/**/*.test.ts` and `app/**/*.test.ts`); rendering is checked manually in the browser.
- On Windows, run the npm scripts from PowerShell or cmd. Under Git Bash, Vitest was observed to fail every suite with `Cannot read properties of undefined (reading 'config')`, including unchanged Phase 1 tests.
