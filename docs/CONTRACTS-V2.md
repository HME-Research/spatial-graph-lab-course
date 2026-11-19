# Schema v2 contracts — Gate 0 (frozen for the parallel MVP wave)

Shared interfaces for the seven parallel MVP branches (`01-graph-ui` … `07-teaching-feedback`). They are fixed at the contract baseline commit. **Change only through the integration owner** (root `main`). This file records names and shapes. Behaviour is pinned by `app/document/v2.test.ts` and `app/spatial/spatial.test.ts`.

## 0. State (read first)

> **P4 (19 November 2026):** schema v2 is the ONLY document format. Schema v1, its reader, the v1→v2 migration, the v1-typed `ViewProps.doc`/`onCommand` and `app/session/legacyBridge.ts` are gone; the module is `@app/document` (the former `app/document/v2` was flattened into it). Node and edge ids are plain integers from never-reused counters (§1). Exported names keep their `V2` suffix (`DesignDocumentV2`, `validateDocumentV2`, `serializeDesignV2`): they name schema version 2.

## 1. Document v2 — `app/document/schema.ts`, `constants.ts`

```jsonc
{
  "schemaVersion": 2,
  "metadata": { "name": "…", "description": "…" },
  "nextNodeId": 3,
  "nextEdgeId": 2,
  "nodes": [{ "id": 1, "grid": [0,0,0], "size": [2,3,1], "typeId": "gallery", "attributes": {} }],
  "edges": [{ "id": 1, "source": 1, "target": 2, "kind": "access", "corridor": { "walls": "enclosed" }, "attributes": {} }],
  "diagram": { "positions": { "1": [0, 0] } },
  "settings": { "styleBy": "function", "styles": { "function": { "default": { "windowFraction": 0.3 }, "groups": [{ "value": "gallery", "look": { "roof": "pergola" } }] } } }
}
```

| Field | Rule |
|---|---|
| `id`, `source`, `target` | Plain whole numbers ≥ 0 (P4). The id is the permanent identity AND the label shown on rooms, in lists and messages (`nodeLabel(node)` = `String(id)`; `relationshipLabel` = `"3 → 7"`). Never derived from coordinates or order. There is no display id. |
| `nextNodeId` / `nextEdgeId` | The id the next new node / edge gets. `add-node` / `add-edge` (commands and algorithm operations) use the counter and advance it, so an id is **never reused after a delete** (older scenarios, undo history and notes keep pointing at the right item). Optional in a file: filled on read as largest id + 1 (1 when empty); always written, after `metadata`. Every id must be below its counter. |
| In memory | Ids are numbers end to end (selection, resolution, building, metrics, views, Student API). Text forms exist only where JSON or a library needs a key: `diagram.positions` and scenario `facePreferences` are objects keyed by the id as text (`"3"`), analysis `nodeValues` likewise, and React Flow ids are `String(id)` (converted in `Graph2DView`). Building style providers get the room id as text (style key). |
| `grid` | **Minimum corner** cell `[x,y,z]`, z up. Independent of `diagram.positions`. |
| `size` | `[sx,sy,sz]` integers 1…`MAX_ROOM_SIZE` (32); default `[1,1,1]` (filled on read, always written). Room = every cell `grid + [0..sx-1, 0..sy-1, 0..sz-1]`. |
| `kind` | `RelationshipKind = 'access' \| 'open'`; `DEFAULT_RELATIONSHIP_KIND = 'access'`. **No adjacency requirement.** |
| `corridor` | Optional `CorridorLook` = `{ walls?: 'enclosed' \| 'open', roof?: 'flat' \| 'pergola' \| 'none' }` (strict; written only when a field is set, key order `walls`, `roof`): this relationship's own corridor look (Properties). Read with `corridorLookOf(edge, doc.settings)`, per field: own value → `settings.corridors` → built-in (`walls: 'open'`, `roof: 'flat'`). Used only when the edge is routed. Replaced `connectorStyle` on 2026-11-19 (no migration: not yet distributed). |
| `settings.corridors` | Optional `CorridorLook` (2026-11-19, "Corridors as a look card"): the Corridors card in Building Designer → Looks, the walls and roof of every generated corridor; written only when a field is set. `designCorridorLook(settings)` resolves it against the built-in default (`DEFAULT_CORRIDOR_LOOK` = open + flat). Geometry: `enclosed` = a side wall on each side; `open` = open sides with posts only where there is a roof; roof `flat` slab, `pergola` slats (like a room pergola), `none` (open + none = floor only). |
| `settings.styleBy` / `settings.styles` | **Style rooms by** (owner 2026-11-18; replaced `typeAppearance`, old files are not read). `styleBy` = `'function'` (default) | `'level'` | `'attribute:<field id>'` | `'metric:<metric id>'`: the ONE attribute that decides each room's look. `styles[styleBy]` = that attribute's setup, remembered per attribute: `{ default?: Look, groups?: [{ value: string | number | boolean, look: Look }], dividers?: number[], bands?: Look[], mode?: 'values' | 'bands' }`. A number can keep both value cards and bands; `mode` says which is active (absent = bands when `dividers` are stored, else value cards; S3, 2026-11-19). Each room falls in exactly one card: with bands active, the band holding its number (band i = `[dividers[i-1], dividers[i])`, ends open); otherwise the value card it equals (text trimmed, case-insensitive); else **Default** (also without a value). Validation: card values unique, dividers strictly ascending, `bands.length = dividers.length + 1`, `mode: 'bands'` needs dividers. Resolved per room on read by `nodeLooks(doc, base, values?)`: each look field card → Default → `base(typeId)` (toolkit window coverage) → built-in. Function and Level are read from the document; custom and measured values are passed by the caller. Cards for values no room has are tolerated (no validation error). |
| `Look` | `{ windowFraction?: [0,1], windowLayout?: 'repeat' | 'stretch', walls?: 'enclosed' | 'open', roof?: 'flat' | 'pergola' | 'none', facade?: FacadeModule }`; absent = inherit. `stretch` = one window per façade (room side over all its bays and storeys, inset by an even frame, same glazed share); `walls: 'open'` leaves out the room's exterior walls and windows (shared walls stay); `pergola` = open slats. `facade` = optional imported module, or `'none'` on a card (no module even when Default has one; 2026-11-18) — module = `{ assetId, placement: 'repeat' | 'stretch', flip?: true, door?: { assetId, flip?: true }, open?: { assetId, flip?: true } }` (`flip` turns it round; `door` / `open` replace the façade bays where an open-air connector meets the room). Rooms with `walls: 'open'` never get a module. `assetId` names a PROJECT asset (CONTRACTS-V3 §2); an unknown id draws nothing (the Designer warns). |

Types: `DesignDocumentV2`, `RoomNode`, `RelationshipEdge`, `RoomSize`, `Look`, `StyleBy`, `StyleSetup`, `StyleGroup`, `DesignSettings`, `RelationshipKind`, `CorridorLook`, `EffectiveCorridorLook`, `WallStyle`, `RoofStyle`.

## 2. Validation — `validateDocumentV2(input, options?)`

Graph validity is **structural only**:
- ids: whole numbers ≥ 0, unique per collection, below `nextNodeId` / `nextEdgeId` (`id-counter`); endpoints, no self-edges, one relationship per unordered pair (`SPATIAL_GRAPH_POLICY`);
- footprints inside `±maxAbsCoordinate`;
- no **room overlap** (`room-overlap`);
- total cells ≤ `MAX_ROOM_CELLS` (`too-many-cells`);
- diagram positions keyed by existing node ids only (`"3"`).

A relationship between rooms that do not touch is **valid**. Spatial feasibility is a derived status (§4) and is never a validation issue. `validateDocumentV2` (and `readDesign`) refuse any `schemaVersion` other than 2 (`unsupported-schema-version`). Issue codes include `room-overlap`, `id-counter`, `too-many-cells`, `route-displacement`.

## 3. Reading and writing — `serialize.ts`

- `readDesign(raw)` / `readDesignJson(text)` return `Result<{ doc }>`; schema v2 only (P4: v1 is never read; no migration exists). Project files are read as format version 2 only.
- Export is `serializeDesignV2(doc)`: canonical key order (`schemaVersion`, `metadata`, `nextNodeId`, `nextEdgeId`, `nodes`, `edges`, `diagram`, `settings`), trailing newline, same doc → same text.
- Built-in example: `app/document/examples/house.json` (graph only: ids, Functions, geometry, edges; no toolkit, no custom attributes).

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
interface ConnectorRoute { edgeId; axis: 'x'|'y'; level; cells: GridCoord[]; from: RoomFace; to: RoomFace; look: EffectiveCorridorLook /* { walls, roof }, both resolved */ }
type UnresolvedReason = 'different-level' | 'not-aligned' | 'blocked-by-room' | 'blocked-by-route'
                      | 'endpoint-clearance' | 'routing-unavailable' /* Gate 0 stub only */;
type CellOccupant = { kind: 'room'; nodeId } | { kind: 'route'; edgeId };
interface Occupancy { cells: ReadonlyMap<gridKey, CellOccupant>; at(cell) }
```

The gate's `{ status, reason?, routeCells?, connectorStyle? }` is this union: `routeCells` = `route.cells`, `connectorStyle` = `route.look` (walls + roof).

**Semantics**
- **Direct** means the footprints share at least one unit face.
  - Horizontal: `access` = door, `open` = no wall.
  - Vertical: `access` = slab opening + symbolic access marker (never a certified stair), `open` = slab void.
- **Separated, no common storey:** `unresolved` / `different-level`.
- **Separated, common storey** (02 implements): try straight, axis-aligned connectors between facing faces through empty cells only. No diagonal or A* routing.
  - Edges are resolved in ascending (numeric) edge id; each route reserves its cells before the next.
  - Candidates are ordered by length, then axis x before y, then lowest storey, then lowest perpendicular coordinate; the first free candidate wins.
  - Otherwise the edge is `unresolved` with `not-aligned`, `blocked-by-room` or `blocked-by-route`.
  - `open` may also be routed; a route never removes or passes through rooms.
- **Footprint helpers** (`app/document/footprint.ts`): `footprintBox`, `footprintCells`, `footprintsOverlap`, `levelRange`, `sharedFaces(a, b)`, `roomContact(a, b)`.
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
  | { type: 'add-node'; node: { grid; size?; typeId; attributes? }; diagramPosition? } // id ← doc.nextNodeId (counter advances)
  | { type: 'remove-node'; nodeId }                         // also removes incident edges + diagram position
  | { type: 'set-node-geometry'; nodeId; grid?; size?; confirmRouteDisplacement? }
  | { type: 'set-node-type'; nodeId; typeId }
  | { type: 'set-node-attributes'; nodeId; attributes }
  | { type: 'set-diagram-position'; nodeId; position }      // never moves the room
  | { type: 'add-edge'; edge: { source; target; kind?; corridor?; attributes? } } // id ← doc.nextEdgeId; kind ← 'access'
  | { type: 'remove-edge'; edgeId }
  | { type: 'change-edge-kind'; edgeId; kind: 'access' | 'open' }
  | { type: 'set-edge-corridor'; edgeId; patch: { walls?: WallStyle | null; roof?: RoofStyle | null } } // null → the Corridors card; empty → `corridor` removed
  | { type: 'set-corridors'; patch: { walls?: WallStyle | null; roof?: RoofStyle | null } } // the Corridors card; null clears a field; empty → `corridors` removed
  | { type: 'set-style-by'; by: StyleBy; dividers?: number[] } // every setup stays remembered; dividers = starting bands, stored only when `by` has none
  | { type: 'set-style-mode'; by; mode: 'values' | 'bands'; dividers?: number[] } // both kinds remembered; switching to bands without stored bands creates them from dividers
  | { type: 'set-look'; by; group: {kind:'default'} | {kind:'value', value} | {kind:'band', index}; patch: LookPatch } // null → inherit; a value card is created when missing and kept when empty; Default is removed when empty
  | { type: 'remove-style-group'; by; value }               // its rooms use Default again
  | { type: 'set-band-dividers'; by; dividers: number[] | null } // moved: bands keep looks; added: copies the split band; removed: keeps the lower band; null drops bands (and the mode)
  | { type: 'set-edge-attributes'; edgeId; attributes };   // additive (project attributes, docs/PROJECT-ATTRIBUTES.md)
```

One successful command that changes content = **one** history step (existing Stage 4B history; integration wires it). A gizmo drag or a Properties field sends exactly one command, on release, Enter or blur.

Callers never choose ids: the new item's id is the document's counter value before the command (Graph 2D, Properties and the wall panel read `doc.nextNodeId` / `doc.nextEdgeId` to select it).

**Port** — `app/spatial/port.ts` defines `DesignPort`, the **required** `ViewProps.design` (P4: views have no other document or command handler):

```ts
interface DesignPort {
  doc: DesignDocumentV2;                                  // read-only
  spatial: SpatialResolution;                             // derived once per document by the host
  onCommand(command: DesignCommand): DesignCommandOutcome; // { ok: true } | { ok: false; issues }
  proposeEdit(request: SpatialEditRequest): SpatialEditProposal;
}
```

- Only the integration owner constructs it. Feature branches test against fakes built with `validateDocumentV2`, `resolveRelationships` and `applyDesignCommand`.

## 7. Ownership during the wave

| Path | Owner |
|---|---|
| `app/document/constants.ts`, `schema.ts`; `app/spatial/contracts.ts`, `port.ts`; the `DesignCommand` / `NewRoom` / `NewRelationship` / `TypeAppearancePatch` types in `app/spatial/commands.ts`; `app/views/contracts.ts`; `app/document/errors.ts` | **Frozen** — integration owner only. Propose changes as a diff and stop. |
| Function bodies in `app/document/*` and `app/spatial/*` (`resolve.ts` routing, `occupancy.ts`, `edit.ts`, `applyDesignCommand`), new files in `app/spatial/`; `student-api/` and `app/extensions/` v2 adaptation | **02-spatial-engine** (signatures fixed) |
| `app/building/**` (may import `@app/spatial`, `@app/document`) | 03-building |
| `core/viewer/three/` new gizmo files, `app/views/three/editing/**` | 04-3d-gizmo |
| `app/views/graph2d/**` | 01-graph-ui |
| `app/inspector/**`, `app/ui/**` | 05-app-ui |
| `app/designer/**` (uses `effectiveLook`, `set-look`, `remove-style-group`) | 06-designer |
| `app/views/presentation/**`, `app/ui/help/**`, `scripts/smoke/**` | 07-teaching-feedback |
| `App.tsx`, `Workspace.tsx`, `app/views/registry.ts`, `VoxelView.tsx`, `ArchitectureView.tsx`, `Graph3DView.tsx`, `app/session/history*`, `documentSession.ts`, toolkit activation | **Integration only** |

Layering (`app/boundary.test.ts`): `document` → `spatial` → `building` → `extensions` → `views` → shell. `app/spatial` is pure and imports only `@app/document*`, `@core/graph` and `@core/spatial`.

**Student API (P4).** Ids are numbers. `SpatialEdgeKind`, `canConnect`, the legacy `add-edge` kinds and `uniqueId` are removed. Operations never choose ids: `add-node` / `add-edge` take an optional local `ref`; `add-edge`, `set-node-attribute` and `set-edge-attribute` take an `ItemRef` (an existing id, or the `ref` of an earlier operation of the same run). The app assigns ids in operation order from the counters and reports them in `TransformationPreviewV2.assigned`. Additive: `{ op: 'set-node-geometry', nodeId: ItemRef, grid?, size? }` moves and/or resizes a room (minimum-corner anchored, like the `set-node-geometry` command); it is refused when the box is invalid, beyond the limits, overlaps another room, or takes cells of a connector generated for the document the run started from (a transformation cannot ask for confirmation); the preview lists moved/resized rooms. See docs/STUDENT-API.md.
