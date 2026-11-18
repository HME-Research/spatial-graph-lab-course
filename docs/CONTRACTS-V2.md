# Schema v2 contracts — Gate 0 (frozen for the parallel MVP wave)

Shared interfaces for the seven parallel MVP branches (`01-graph-ui` … `07-teaching-feedback`). They are fixed at the contract baseline commit. **Change only through the integration owner** (root `main`). This file records names and shapes. Behaviour is pinned by `app/document/v2/v2.test.ts` and `app/spatial/spatial.test.ts`.

## 0. State at the baseline (read first)

> **Gate 1 (integrated on main):** the app now stores, edits, undoes and exports **v2** only (v1 files are read and migrated; export is `serializeDesignV2`). Straight-connector routing is implemented (02); `routing-unavailable` and `endpoint-clearance` are never emitted. The Student API and `app/extensions` run on v2 (`runAlgorithmV2`, `validateDocumentV2`); toolkit designs are read with `readDesignJson`. One live `DesignPort` is passed to every view, Properties and the Designer. The frozen v1 `ViewProps.doc`/`onCommand` receive a read-only projection and a v1→v2 command translation (`app/session/legacyBridge.ts`). The bullets below describe the Gate 0 baseline.

- **Additive.** The running app still stores and edits a **v1** `DesignDocument` (`@app/document`, unchanged; golden tests unchanged). Schema v2 lives beside it in `@app/document/v2` and `@app/spatial`. Integration (Gate 1) switches `App`/history/load/export to v2.
- **Stubbed:** only straight-connector routing in `app/spatial/resolve.ts`. A separated pair on a shared storey returns `unresolved` with reason `routing-unavailable`. Every other function below is implemented and tested.
- **Not yet adapted:** the Student API and `app/extensions` (still v1). See §7.

## 1. Document v2 — `app/document/v2/schema.ts`, `constants.ts`

```jsonc
{
  "schemaVersion": 2,
  "metadata": { "name": "…", "description": "…" },
  "nodes": [{ "id": "a", "displayId": "01", "grid": [0,0,0], "size": [2,3,1], "typeId": "gallery", "attributes": {} }],
  "edges": [{ "id": "ab", "source": "a", "target": "b", "kind": "access", "connectorStyle": "covered", "attributes": {} }],
  "diagram": { "positions": { "a": [0, 0] } },
  "settings": { "styleBy": "function", "styles": { "function": { "default": { "windowFraction": 0.3 }, "groups": [{ "value": "gallery", "look": { "roof": "pergola" } }] } } }
}
```

| Field | Rule |
|---|---|
| `id` | Permanent identity (v1 pattern). Never derived from coordinates or order. |
| `displayId` | Optional short label, 1–12 chars, unique when present. Stored; never recomputed from array or render order. `nodeLabel(node)` = `displayId ?? id`; `nextDisplayId(doc)` for new nodes. |
| `grid` | **Minimum corner** cell `[x,y,z]`, z up. Independent of `diagram.positions`. |
| `size` | `[sx,sy,sz]` integers 1…`MAX_ROOM_SIZE` (32); default `[1,1,1]` (filled on read, always written). Room = every cell `grid + [0..sx-1, 0..sy-1, 0..sz-1]`. |
| `kind` | `RelationshipKind = 'access' \| 'open'`; `DEFAULT_RELATIONSHIP_KIND = 'access'`. **No adjacency requirement.** |
| `connectorStyle` | Optional `'enclosed' \| 'covered' \| 'deck'`; read with `connectorStyleOf(edge)` (default `deck` since 2026-11-17; was `enclosed`). Used only when the edge is routed. |
| `settings.styleBy` / `settings.styles` | **Style rooms by** (owner 2026-11-18; replaced `typeAppearance`, old files are not read). `styleBy` = `'function'` (default) | `'level'` | `'attribute:<field id>'` | `'metric:<metric id>'`: the ONE attribute that decides each room's look. `styles[styleBy]` = that attribute's setup, remembered per attribute: `{ default?: Look, groups?: [{ value: string | number | boolean, look: Look }], dividers?: number[], bands?: Look[] }`. Each room falls in exactly one card: the band holding its number (band i = `[dividers[i-1], dividers[i])`, ends open), else the value card it equals (text trimmed, case-insensitive), else **Default** (also without a value). Validation: card values unique, dividers strictly ascending, `bands.length = dividers.length + 1`. Resolved per room on read by `nodeLooks(doc, base, values?)`: each look field card → Default → `base(typeId)` (toolkit window coverage) → built-in. Function and Level are read from the document; custom and measured values are passed by the caller. Cards for values no room has are tolerated (no validation error). |
| `Look` | `{ windowFraction?: [0,1], windowLayout?: 'repeat' | 'stretch', walls?: 'enclosed' | 'open', roof?: 'flat' | 'pergola' | 'none', facade?: FacadeModule }`; absent = inherit. `stretch` = one window per façade (room side over all its bays and storeys, inset by an even frame, same glazed share); `walls: 'open'` leaves out the room's exterior walls and windows (shared walls stay); `pergola` = open slats. `facade` = optional imported module `{ assetId, placement: 'repeat' | 'stretch', flip?: true, door?: { assetId, flip?: true }, open?: { assetId, flip?: true } }` (`flip` turns it round; `door` / `open` replace the façade bays where an open-air connector meets the room). Rooms with `walls: 'open'` never get a module. `assetId` names a PROJECT asset (CONTRACTS-V3 §2); an unknown id draws nothing (the Designer warns). |

Types: `DesignDocumentV2`, `RoomNode`, `RelationshipEdge`, `RoomSize`, `Look`, `StyleBy`, `StyleSetup`, `StyleGroup`, `DesignSettings`, `RelationshipKind`, `ConnectorStyle`, `RoofStyle`.

## 2. Validation — `validateDocumentV2(input, options?)`

Graph validity is **structural only**:
- the v1 id/endpoint/self-edge/one-relationship-per-pair policy (`SPATIAL_GRAPH_POLICY`);
- footprints inside `±maxAbsCoordinate`;
- no **room overlap** (`room-overlap`);
- unique display ids (`duplicate-display-id`);
- total cells ≤ `MAX_ROOM_CELLS` (`too-many-cells`);
- diagram positions of existing nodes only.

A relationship between rooms that do not touch is **valid**. Spatial feasibility is a derived status (§4) and is never a validation issue. `validateDocumentV2` rejects v1 input; use `readDesign`. New issue codes are added to the shared `IssueCode`: `room-overlap`, `duplicate-display-id`, `too-many-cells`, `route-displacement`. The v1 validator never emits them.

## 3. Compatibility — `migrate.ts`, `serialize.ts`

- **Read both, write v2.** `readDesign(raw)` and `readDesignJson(text)` return `Result<{ doc: DesignDocumentV2; sourceVersion: 1 | 2 }>`:
  - v1 input is checked by the unchanged v1 validator (same issues), then migrated;
  - versions other than 1 or 2 give `unsupported-schema-version`.
- Export is `serializeDesignV2(doc)` only: canonical key order, trailing newline, same doc → same text. There is no v2→v1 export. A v1 file is never written with v2 properties, and the app never overwrites source files.
- v1 `parseDesignJson` and `serializeDesign` keep exact v1 behaviour until integration replaces their call sites in the shell.
- `migrateV1toV2(v1Doc)` is pure and deterministic:
  - ids, cells, types, attributes, metadata and diagram positions are kept; `size [1,1,1]`;
  - `displayId` = `"01"`, `"02"`, … in v1 node order;
  - edge kinds: `door`→`access`, `vertical-access`→`access`, `open`→`open`, `atrium`→`open`;
  - no `connectorStyle`; empty `settings`.
- **Lossless.** Every valid v1 edge joins face-adjacent cells, so `v1KindFor(kind, roomContact(a, b))` recovers the original kind (tested on the shipped example). Building code can keep the v1 face conditions for direct edges: door wall, no wall, slab void, slab opening + access marker.
- The only intended visual difference after migration is the default **flat roof** on exposed tops.

## 4. Resolution and occupancy — `app/spatial/contracts.ts`

`resolveRelationships(doc): SpatialResolution` (type `RelationshipResolver`) is pure and deterministic. It returns:
- `edges` (document order);
- `byEdge: Map<edgeId, EdgeResolution>`;
- `occupancy`.

```ts
type EdgeResolution =
  | { edgeId; kind; status: 'direct'; contact: 'horizontal' | 'vertical'; faces: SharedFace[] } // faces seen from SOURCE
  | { edgeId; kind; status: 'routed'; route: ConnectorRoute }
  | { edgeId; kind; status: 'unresolved'; reason: UnresolvedReason; message: string };
interface ConnectorRoute { edgeId; axis: 'x'|'y'; level; cells: GridCoord[]; from: RoomFace; to: RoomFace; style: ConnectorStyle }
type UnresolvedReason = 'different-level' | 'not-aligned' | 'blocked-by-room' | 'blocked-by-route'
                      | 'endpoint-clearance' | 'routing-unavailable' /* Gate 0 stub only */;
type CellOccupant = { kind: 'room'; nodeId } | { kind: 'route'; edgeId };
interface Occupancy { cells: ReadonlyMap<gridKey, CellOccupant>; at(cell) }
```

The gate's `{ status, reason?, routeCells?, connectorStyle? }` is this union: `routeCells` = `route.cells`, `connectorStyle` = `route.style`.

**Semantics**
- **Direct** means the footprints share at least one unit face.
  - Horizontal: `access` = door, `open` = no wall.
  - Vertical: `access` = slab opening + symbolic access marker (never a certified stair), `open` = slab void.
- **Separated, no common storey:** `unresolved` / `different-level`.
- **Separated, common storey** (02 implements): try straight, axis-aligned connectors between facing faces through empty cells only. No diagonal or A* routing.
  - Edges are resolved in ascending edge id; each route reserves its cells before the next.
  - Candidates are ordered by length, then axis x before y, then lowest storey, then lowest perpendicular coordinate; the first free candidate wins.
  - Otherwise the edge is `unresolved` with `not-aligned`, `blocked-by-room` or `blocked-by-route`.
  - `open` may also be routed; a route never removes or passes through rooms.
- **Footprint helpers** (`app/document/v2/footprint.ts`): `footprintBox`, `footprintCells`, `footprintsOverlap`, `levelRange`, `sharedFaces(a, b)`, `roomContact(a, b)`.
- **`buildOccupancy(doc, resolutions)`** is the single occupancy API for room cells plus route reservations.

## 5. Spatial edits — `app/spatial/edit.ts`

- **`proposeSpatialEdit(doc, { nodeId, grid?, size? }, { resolve? })`** returns one of:
  - `rejected`: issues, plus `collidingRooms` for a room overlap. A room overlap is **always** refused.
  - `ok`: `next`, plus `impacted` edges `{ edgeId, before, after }`.
  - `needs-confirmation`: `next`, `displacedRoutes`, `impacted`. The room would take connector cells.
  - **Policy (programme phase 07, A11).** Taking cells of ANOTHER room's relationship connector always needs confirmation. Taking cells of the moved room's OWN connector (moving or growing along its own corridor) needs confirmation only if one of its own relationships would become unresolved; otherwise it is `ok` and the corridor is recalculated. `add-node` follows the same rule: a new room has no relationships, so taking any connector cells needs `confirmRouteDisplacement` (it is refused without it, never silent). A room overlap is always refused.
- **Resize** is anchored at the **minimum corner**: `size` alone never changes `grid`. Whole cells only; callers snap world drags to integers. Use `spatialToThree` / `DEFAULT_CELL_SIZE` (3 m) for world scale.
- **`commitSpatialEdit(proposal, { confirmRouteDisplacement })`** returns `Result<DesignDocumentV2>`. `needs-confirmation` fails with `route-displacement` unless confirmed.
- **UI flow:** **Cancel** sends nothing. **Move anyway and recalculate** sends `set-node-geometry` with `confirmRouteDisplacement: true`. Relationships are kept, routes are recalculated, and edges may become unresolved. No silent reroute.

## 6. Commands and the cross-layer port

**Commands** — `app/spatial/commands.ts`, `applyDesignCommand(doc, command, options?)`. Pure; every result is validated.

```ts
type DesignCommand =
  | { type: 'add-node'; node: { id; displayId?; grid; size?; typeId; attributes? }; diagramPosition? } // displayId ← nextDisplayId
  | { type: 'remove-node'; nodeId }                         // also removes incident edges + diagram position
  | { type: 'set-node-geometry'; nodeId; grid?; size?; confirmRouteDisplacement? }
  | { type: 'set-node-type'; nodeId; typeId }
  | { type: 'set-node-attributes'; nodeId; attributes }
  | { type: 'set-display-id'; nodeId; displayId: string | null }
  | { type: 'set-diagram-position'; nodeId; position }      // never moves the room
  | { type: 'add-edge'; edge: { id; source; target; kind?; connectorStyle?; attributes? } } // kind ← 'access'
  | { type: 'remove-edge'; edgeId }
  | { type: 'change-edge-kind'; edgeId; kind: 'access' | 'open' }
  | { type: 'set-connector-style'; edgeId; style: ConnectorStyle | null }   // null → default
  | { type: 'set-style-by'; by: StyleBy }                    // every setup stays remembered
  | { type: 'set-look'; by; group: {kind:'default'} | {kind:'value', value} | {kind:'band', index}; patch: LookPatch } // null → inherit; a value card is created when missing and kept when empty; Default is removed when empty
  | { type: 'remove-style-group'; by; value }               // its rooms use Default again
  | { type: 'set-band-dividers'; by; dividers: number[] | null } // moved: bands keep looks; added: copies the split band; removed: keeps the lower band; null drops bands
  | { type: 'set-edge-attributes'; edgeId; attributes };   // additive (project attributes, docs/PROJECT-ATTRIBUTES.md)
```

One successful command that changes content = **one** history step (existing Stage 4B history; integration wires it). A gizmo drag or a Properties field sends exactly one command, on release, Enter or blur.

**Port** — `app/spatial/port.ts` defines `DesignPort`, offered to views as the **optional** `ViewProps.design`. This is the only change to `app/views/contracts.ts`:

```ts
interface DesignPort {
  doc: DesignDocumentV2;                                  // read-only
  spatial: SpatialResolution;                             // derived once per document by the host
  onCommand(command: DesignCommand): DesignCommandOutcome; // { ok: true } | { ok: false; issues }
  proposeEdit(request: SpatialEditRequest): SpatialEditProposal;
}
```

- **Absent** (today): every view keeps its v1 behaviour and hides v2-only features (feature gate = `props.design !== undefined`).
- Only the integration owner constructs it. Feature branches test against fakes built with `validateDocumentV2`, `resolveRelationships` and `applyDesignCommand`.

## 7. Ownership during the wave

| Path | Owner |
|---|---|
| `app/document/v2/constants.ts`, `schema.ts`; `app/spatial/contracts.ts`, `port.ts`; the `DesignCommand` / `NewRoom` / `NewRelationship` / `TypeAppearancePatch` types in `app/spatial/commands.ts`; `app/views/contracts.ts`; `app/document/errors.ts` | **Frozen** — integration owner only. Propose changes as a diff and stop. |
| Function bodies in `app/document/v2/*` and `app/spatial/*` (`resolve.ts` routing, `occupancy.ts`, `edit.ts`, `applyDesignCommand`), new files in `app/spatial/`; `student-api/` and `app/extensions/` v2 adaptation | **02-spatial-engine** (signatures fixed) |
| `app/building/**` (may import `@app/spatial`, `@app/document/v2`) | 03-building |
| `core/viewer/three/` new gizmo files, `app/views/three/editing/**` | 04-3d-gizmo |
| `app/views/graph2d/**` | 01-graph-ui |
| `app/inspector/**`, `app/ui/**` | 05-app-ui |
| `app/designer/**` (uses `effectiveLook`, `set-look`, `remove-style-group`) | 06-designer |
| `app/views/presentation/**`, `app/ui/help/**`, `scripts/smoke/**` | 07-teaching-feedback |
| `App.tsx`, `Workspace.tsx`, `app/views/registry.ts`, `VoxelView.tsx`, `ArchitectureView.tsx`, `Graph3DView.tsx`, `app/session/history*`, `documentSession.ts`, toolkit activation | **Integration only** |

Layering (`app/boundary.test.ts`): `document` → `spatial` → `building` → `extensions` → `views` → shell. `app/spatial` is pure and imports only `@app/document*`, `@core/graph` and `@core/spatial`.

**Student API — decisions for 02** (not done at Gate 0; existing toolkits keep compiling and running on v1 until then):

- **Kinds.** Add `RelationshipKind = 'access' | 'open'`. `SpatialEdge.kind` becomes `RelationshipKind`. `SpatialNode` gains `size` and optional `displayId`.
- **Legacy kinds in operations.** The `add-edge` operation also accepts the legacy kinds `door | open | atrium | vertical-access`, mapped with `V1_KIND_TO_RELATIONSHIP`. This keeps `connect-storage-to-galleries` and `connect-neighbours` working unchanged; add a test.
- **`canConnect(kind, a, b)`** keeps its v1 meaning (cells face-adjacent for that legacy kind) and is documented as deprecated.
- **New queries** under different names:
  - `touches(aNodeId, bNodeId)`: footprints share a face, i.e. a direct relationship is possible.
  - `canRelate(aNodeId, bNodeId)`: a relationship may be created (distinct existing nodes, no existing pair).
- **`nodeAt(cell)`** returns the room whose footprint contains the cell.
- **Validation.** `app/extensions` validates transformation results with `validateDocumentV2`. Update `docs/STUDENT-API.md`.
