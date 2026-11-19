# Gate F contracts (V3 additions) — frozen for the 2026-11 programme

Additive to `docs/CONTRACTS-V2.md`. The v2 design schema (`app/document/v2/schema.ts`) is **unchanged**: every v2 file written before Gate F reads identically and is written identically. Everything new lives beside it. Change these contracts only on root `main`, through the integration owner. Workstreams propose changes as a diff in their report.

## 1. Shell (`app/workspace/**`, `app/Workspace.tsx`, `app/App.tsx`)
- **Eight left destinations, in order (P4: Analyse and Transform replace Algorithms):** Project, Attributes, Building Designer, Analyse, Transform, Scenarios, Camera, Display (`SIDEBAR_SECTIONS`, `app/workspace/destinations.ts`). The id `designer` is kept for Building Designer. This supersedes the earlier "exactly four destinations" rule. There is no 9th destination. The right side shows Properties only.
- **Panel slots:** `DESTINATION_PANELS` (`app/workspace/panelSlots.ts`) maps `scenarios | camera | display` to components in the owning workstream folders. Those components read `useWorkspaceServices()`, which provides `design`, `selection`, `onSelect`, `viewports` and `cameraBus`. Workstreams replace component bodies, never the map. Services are extended additively at integration.
- **Panes:**
  - Left width defaults to 300 px, clamped to 240–560. It is a keyboard-operable separator, with a centred collapse chevron.
  - Width and a deliberate collapse persist in `localStorage` (`sgl:ui:*`, every access guarded).
  - Properties auto-opens on selection unless the user deliberately collapsed it.
- **Views:**
  - `VIEW_MODES = graph2d, graph3d, voxels, architecture, plan`. Plan (workstream C, merged at I1) draws one storey as SVG from the shared face layout (`buildPlan`); its drawing surface is `svg[data-view-surface="plan"]`.
  - The registry maps `plan` to `PlanWallView` (`app/views/three/wallInteraction/PlanWallView.tsx`, wave 2 D, accepted at I2). It wraps C's `PlanView` and adds the shared-wall panel through `PlanView`'s `onWallTarget` hook. It contains no Three.js, so the Plan stays in the main chunk.
  - `PlanViewProps.activeWall?: string | null` is optional and additive: the face id of the wall whose panel is open, drawn highlighted. Absent means none.
  - Graph 3D, Voxels and Building are `React.lazy` in the registry, under `<Suspense key={mode}>` in `Workspace` (workstream E).
  - Graph 3D stays read-only.
  - Viewports are `viewport-1…4`, with layout 1 | 2 | 4 (default 2) and default modes `[graph2d, architecture, graph3d, plan]`.
  - Maximise/Restore is offered per viewport. Viewports maximised away stay mounted (`hidden`); viewports outside the layout are unmounted.

## 2. Project file and storage (`app/project/**`)
- **`ProjectFileV2`** (`format: 'spatial-graph-lab/project'`, `version: 2`; version 1 files are still read and migrated on open, see below) contains:
  - identity: `projectId`, `name`, `description?`, `createdAt`, `updatedAt`;
  - `toolkit: {id} | null` (version 1: `definition: {projectId} | null`): the toolkit in `toolkits/<id>` the project was created from, which supplies types and algorithms. It is referenced, never embedded, so the file needs the same toolkit installed to resolve its types;
  - `attributes`: the project attribute record, validated by `readAttributeRecord`;
  - `activeScenarioId` and `scenarios[]`;
  - `settings.display`;
  - `settings.calculatedFields?` (optional, added at I1): the ids of the calculated values (metrics) the project shows in Properties and offers for colour-by. Metric ids only, never values. Absent = the built-in default selection; the key is written only when set, so older files stay byte-identical. The file keeps the ids as written (structure validated: at most 64 strings of 1–64 characters); the app reads them with `sanitizeEnabledMetrics` (unknown ids ignored, canonical order) and writes canonical lists. Project-level, not per scenario, not undoable;
  - `settings.functions?` and `settings.hiddenFunctions?` (optional, added 2026-11-17): project functions `{id, label}` (functions added in the browser; `id` is a node's `function`, unique, never changed by a rename) and the ids of toolkit functions removed from this project. Written only when set, so older files stay byte-identical. `withProjectFunctions` (`app/extensions/projectFunctions.ts`) merges them into `ActiveToolkit.nodeTypes` as valid types without façade or attributes (fallback colour and façade); a toolkit definition with the same id wins; hidden toolkit functions are left out. Not undoable; autosaved and exported. The UI refuses to remove a function that any node of any scenario uses;
  - `assets`: `{policy: 'none'}` (no imported façades; what every older file says, still written byte-identically) or, since 2026-11-17, `{policy: 'embedded-mesh-v1', items: FacadeAssetV1[]}` (1–32 items, unique ids). See "Imported façade assets" below.
- **Scenario** = `{id, name, design (DesignDocumentV2, read with readDesign), facePreferences, cameras: SavedCamera[], display: DisplayOverrides}`. A scenario is a complete design alternative.
- **Reading and writing:**
  - `readProjectFile` validates the whole file, and nothing replaces state on failure. Face preferences must name an existing **access** edge and one of that edge's two rooms (`unknown-preference-edge`, `invalid-preference`); an out-of-range offset is accepted and resolves as unresolved `preferred-face-unavailable`.
  - `serializeProjectFile` is canonical and always writes version 2.
  - **Version 1 → 2 migration (toolkit terminology, 2026-11-17):** `readProjectFile` accepts version 1 and migrates it before validation; only `definition: {projectId}` changes, to `toolkit: {id}` (`migrateProjectFileV1`, pure). Any other version is `unsupported-version`.
  - `projectFromLegacyDesign` turns a v1 or v2 design file into a project with one scenario.
  - `saveAsNewProject` makes a deep copy with a new project id and new scenario ids.
  - **Create project (2026-11-17):** `createProject` (`app/welcome/welcomeFlow.ts`) opens one scenario with an EMPTY graph (the user chooses the toolkit to start from; `blankDesign` of that toolkit's starting design: no rooms, Building settings kept), an attribute record with no custom attributes (`minimalProjectFile`, recorded against the toolkit baseline signature, so no "files changed" warning) and `settings.calculatedFields: []`. Only Function and Level remain. *Changed 2026-11-19 (owner):* the record holds the chosen toolkit's custom attributes (`StartingDesign.attributeSchema` = `attributeBaseline.schema`, with each Function's defaults); the graph is still empty, the toolkit's `defaultDesign` supplies only Building settings. It never seeds legacy browser attributes. Try example and opened files are unchanged.
- **Imported façade assets (owner decisions D1–D4, 2026-11-17; `app/assets`).** The project file embeds the validated, NORMALISED component mesh of each imported `.3dm`, never the `.3dm` itself, so the stored record (autosave), Save As, export and open all carry it; nothing needs rhino3dm to load, render or export a project.
  - `FacadeAssetV1` = `{id, kind: 'facade-mesh', name, source: {fileName, bytes, sha256, unit, unitAssumed, outward, reader}, size: [width, height, depth] (m), mesh: {vertices, triangles, index: 'u16' | 'u32', sha256, data (base64)}, groups: [{name, color, glass, open?: true, start, count}], warnings, bayMaterials?: {door?: [{color, glass, open?: true}], open?: [...]}}`. A material's finish is Open (`open: true`, written with `glass: false`; not drawn), Glass or Solid. `bayMaterials` (additive 2026-11-17) holds the materials used when the asset is a Door / Open bay module, one per group; an absent role uses the groups' own (façade) materials. Both fields are written only when set, so earlier assets are byte-identical. `data` = float32 positions (panel frame: a = rightward seen from outside, b = up, c = outward, metres, bounding box from 0) then u16/u32 triangle indices, little-endian. `id = 'facade-' + mesh.sha256[0..16]` (content-addressed: re-importing the same component adds nothing).
  - `readFacadeAsset` checks structure, id ↔ hash, exact byte length, SHA-256, every index, every coordinate against `size`, contiguous groups, and the bounds (≤ 100 000 triangles, ≤ 300 000 vertices, ≤ 32 groups, extent ≤ 50 m, depth ≤ 1 m). `readProjectFile` adds duplicate ids and a project total of ≤ 20 MB decoded binary (the Designer warns above 5 MB). Any failure rejects the WHOLE file (`invalid-asset`); binary geometry is never dropped silently. A browser quota error is the existing `blocked: quota` save result.
  - Assets are project-level (shared by every scenario), not undoable: `ProjectController.addFacadeAsset` / `removeFacadeAsset` (refused while any scenario's current design uses it) / `renameFacadeAsset` / `setFacadeAssetMaterials(assetId, materials, role = 'wall')` (colour and solid/glass/open per material group for one use; for `door` / `open`, `null` = same as the façade; the mesh and id are unchanged). The library is managed in Designer (per function) and in Project → Imported façades. Designs refer to them by id (CONTRACTS-V2 §1 `facade`); a reference to a missing asset draws nothing and is reported in the Building and the Designer.
- **`ProjectStore`** has three implementations:
  - `createMemoryProjectStore` (tests);
  - `createIndexedDbProjectStore` (`sgl-projects`, with stores `projects` and `quarantine`);
  - `list()` sorted by `updatedAt`.
- **Load and save results:**
  - A load returns `ok`, `missing`, `unreadable` (copied to quarantine) or `unavailable`.
  - A save returns `saved` or `blocked`, with reason `quota`, `unavailable`, `refused-unreadable` or `error`.
  - An unreadable record is never overwritten until `discardUnreadable(id)` is called explicitly.
- **History and save state:**
  - Each scenario has its own `DocumentSession<ScenarioContent>` history.
  - Cameras and display settings are not undoable; they are autosaved.
  - "Not exported" is not "unsaved". Local save state and the exported state are tracked separately.
  - **Export marks (additive, I1 audit repair):** `ExportMarks` (`get(projectId)`, `set(projectId, mark)`; `createLocalStorageExportMarks` under `localStorage` keys `sgl-exported:<projectId>`, `createMemoryExportMarks` for tests) remember, beside the stored record, a digest (`exportMarkOf`) of the content signature last exported or opened from a file. They are local bookkeeping only: never part of `ProjectFileV2`, the stored record or an exported file, and best effort (failures are ignored, never thrown). A restored project is "exported" exactly when its content signature matches the mark; any later edit makes it "not exported". The `ProjectStore` interface and the IndexedDB schema are unchanged.
- **Open project and autosave (workstream B, merged at I1):** `app/session/projectStore.ts` (pure open-project state) and `projectStoreController.ts` (UI-independent controller). The app starts with no project: Welcome is always shown and nothing reopens automatically. Save state is explicit (`pending | saving | saved | blocked` with a reason, including `conflict` for a two-tab write detected under a Web Lock); leaving a project with changes that could not be stored needs explicit confirmation.
  - **Last session vs saved locally (additive, 2026-11-17):** only the LAST session is kept without asking. `ProjectStore.remove(projectId)` (additive) deletes a readable record (never an unreadable one). `KeptMarks` (`createLocalStorageKeptMarks`: `localStorage` keys `sgl-kept:<projectId>` and `sgl-kept-reset-1`; `createMemoryKeptMarks` for tests) remember which projects the user saved locally, beside the records, never in a file. `controller.saveLocally()` marks the open project; Save As marks the copy; a restored project keeps its mark (`ControllerState.kept`). After every open, restore and Save As the controller removes every other readable stored project that is not marked (`pruneUnsaved`). A one-time reset per browser (`sgl-kept-reset-1` absent) clears every mark (and the legacy `sgl-kept-initialised`) and removes every readable stored project except the last session (the open project, otherwise the most recently saved); unreadable records are never touched, and nothing is ever removed when the marks cannot be used. `listRecent` reports the unmarked ids as `unsaved`. The shell asks before replacing an unsaved session that has changes. Open, restore, close and Save As are transitions: while one is in progress every change (`command`, scenario/project/settings setters, undo/redo) is refused with `BUSY_MESSAGE`, a second transition is refused (`restore` → status `busy`, additive), and Save As copies the state shown when it commits. Project settings that are not design content go through `setCameras`, `setScenarioDisplay`, `setDisplayDefaults`, `setCalculatedFields` and `setAttributeRecord`: autosaved and exported, never undo steps.
- **Camera and Display binding (I1):** `app/session/projectViewSettings.ts` backs E's `SavedCameraStore` with each scenario's `cameras` and E's `DisplayStore` with `settings.display` (defaults) and each scenario's `display` (overrides). The providers receive the ACTIVE scenario id; reads always follow the open project, so nothing leaks between projects. Cameras of view modes the app does not offer are kept in the file but not listed; `SavedCameraStore.usedIds?(scenarioId)` (additive, I1 audit) returns every camera id of the scenario so a new camera id never collides with a kept one, and `set` refuses a list that would take a kept camera's id (a kept camera is never dropped). The Camera panel's chosen target viewport is a per-browser UI choice (`localStorage` `sgl:ui:camera-target`), not project data.

## 3. Faces, wall runs, interaction (`app/building/**`)
- **Pipeline:** `resolveRelationships → resolveBuildingFaces → applyRoofPolicy → layoutFaces → buildArchitecture`. Plan will add `buildPlan`, which uses the same `FaceLayout` input.
- **`FaceLayout`** = `{faceId, face, frame {origin = face centre, u, v, normal, width, height}, solids, openings[{kind, rect, edgeId}]}`. Rects are in face-local metres, measured from the face centre. Opening kinds are `window | door | open | slab-void | slab-opening | access-marker`.
- **Golden fixtures** (`app/building/__golden__/`, `golden.test.ts`) pin `buildBuildingV2` and `buildArchitecture` output, text-identical to `88f408e`. They regenerate only with `SGL_UPDATE_GOLDEN=1`, as a reviewed change.
- **`groupWallRuns`:** maximal coplanar, contiguous exterior wall faces of one room on one storey. This is the unit for façade Stretch.
- **`wallAction(faceId, …)`:** one eligibility rule for Building and Plan. It returns:
  - `not-eligible` for `exterior`, `slab`, `route`, `interior` or `unknown-face`;
  - `add` (source, target, preference);
  - `existing` (the edge id), so a duplicate edge is never created.

## 4. Commands and the clicked-wall preference (`app/spatial/**`)
- **`remove-edges {edgeIds}`** is refused for an empty list, duplicates, unknown ids, or any edge that is not currently unresolved. It removes exactly the listed edges in one history step ("Remove N invalid connections"). It is never issued automatically.
- **`FacePreference`** is `{nodeId (an endpoint), offset (cell offset from that room's min corner), direction}`. It is stored per scenario in `facePreferences`, not in the design. It applies only to **access** edges:
  - It is refused on `open` edges.
  - Changing an edge to `open` drops its preference in the same step.
- **Preference rules:**
  - A pure move keeps the offset, so the face moves with the room.
  - A resize keeps the preferred face's absolute cell.
  - A preference that no longer lies on the two rooms' shared wall makes the edge `unresolved` with reason `preferred-face-unavailable`. The edge is kept, the door is never placed on another face, and the edge reserves no route.
  - `resolveWithPreferences(doc, {})` equals `resolveRelationships(doc)`.
- **`applyScenarioCommand(ScenarioContent, ScenarioCommand)`** accepts every `DesignCommand` plus `set-face-preference` and `add-edge-at-face`. `add-edge-at-face` adds the edge and its preference in one step. Removing edges or nodes prunes orphaned preferences in the same step. A move or resize never removes an edge.
- **`DesignPort.onScenarioCommand?(command: ScenarioCommand): DesignCommandOutcome`** (`app/spatial/port.ts`, wave 2 D, accepted at I2) is optional and additive.
  - App supplies it. It routes through the project controller's `command`, the same path as `onCommand`: runtime validation, refusal while an open/restore/Save As is in progress (busy guard), and exactly one history step of the active scenario on success. A refusal changes nothing.
  - App's `onCommand` delegates to it.
  - When it is absent, the host cannot store face preferences, and the views disable "door on this wall" actions.

### Wave 2 D wall ↔ graph UI semantics (accepted at I2)
- **Eligibility:** only a wall face that `wallAction` reports as `add` or `existing` is interactive, in both the Building and the Plan (one pure model, `wallPanelModel`). Hover highlights it. Exterior, slab, route and interior faces are never offered.
- **Click:** a click opens the wall panel and also sets the selection (`wallClickSelection`):
  - if the two rooms have a relationship, that edge is selected;
  - otherwise the face's owner room is selected, as wall clicks did before the panel. The room editor therefore stays available.
  - The open wall is view-local UI state, not a `Selection` kind. Any other pick or a background click closes it.
- **Free wall:** the panel offers "Add relationship…":
  - **Access** sends one `add-edge-at-face` with the clicked face as the preference.
  - **Open** sends one plain `add-edge`.
  - The new id comes from `nextFreeId('edge', …)`, and the new edge is selected.
- **Related wall:** the panel shows the kind, the status and where the opening is (this wall / another shared wall / nowhere), and offers:
  - "Put the door on this wall" (access only), one `set-face-preference`;
  - "Change to …", one `change-edge-kind`. Changing Open to Access uses the default face, and the door then moves with "Put the door on this wall", so it takes two steps;
  - "Remove relationship", one `remove-edge`. The owner room then becomes the selection, so the removed edge is not left selected.
  - It never offers Add, so the panel never creates a duplicate edge.
- **Moved geometry:** the edge is kept and becomes `unresolved` / `preferred-face-unavailable`; the door is never relocated.
- **Graph 2D "Remove invalid connections":**
  - The toolbar button appears only while unresolved edges exist. The canvas menu always offers the action and explains when there is nothing to remove.
  - The review list has every row checked by default and previews the checked edges with halos in the diagram.
  - Confirming sends one `remove-edges` for the checked rows, which is one undo step. The action is never automatic.

## 5. Camera, display, metrics
- **Camera:**
  - `CameraPose` and `SavedCamera` live in `core/viewer/three/camera.ts`: a Y-up Three.js world, `perspective | orthographic`. App narrowing is in `app/camera/savedCamera.ts`.
  - `CameraBus`: each 3D `SceneCanvas` registers under its viewport id.
  - `apply` returns `unavailable` for hidden or unmounted viewports, and the bus never retargets another viewport.
  - Orthographic poses are accepted as data. Rendering them is workstream E's job.
  - `spatialToThree` stays the only grid→Three mapping. `core/viewer/axes.ts` `zUpToYUp` is the only future Z-up (SpatialCore/3DM) adapter.
- **Display:**
  - `resolveDisplay(defaults → scenario overrides → per-view)` (`app/display/contracts.ts`), with fields `labels`, `legend`, `roofs`, `colourPreset`, `lighting`.
  - Display settings are appearance only. They are persisted in the project file and not undoable.
- **Metrics:**
  - Each `ComputedMetric` has an id, label, collection, value kind, unit, an optional `description` (added at I1, additive), a non-empty `dependsOn` (`topology | geometry | resolution | types | attributes | settings`) and `compute`. `createMetricEvaluator` memoises per document.
  - Metric values are derived on read and never written to designs or exports.
  - The built-in catalogue (workstream M, `app/metrics/catalogue.ts`; each entry carries a `definition`): node metrics `area` (m²), `volume` (m³), `degree`, `has-exterior-facade` (yes/no), `exposed-facade-length` (m), `exposed-facade-area` (m²), `unresolved-connections`; edge metrics `resolution-status` (text) and `route-length` (m). Façade metrics use the Building's own face resolution.
  - `Function` (`function`) and `Level` (`position[2]`) are system-backed fields (`app/metrics/system.ts`), not metrics; Properties shows Level once, with the room's identity.
  - **Enabled selection:** the project's `settings.calculatedFields` (§2), read with `sanitizeEnabledMetrics`, added to or removed from the unified Attributes list (removing only hides it: the metric stays registered and `ctx.metrics` still lists it), provided to views and Properties through `EnabledMetricsContext` (`app/views/three/enabledMetrics.ts`). Properties renders `metricRows` (shared `defaultMetricEvaluator`, `formatMetricValue`) read-only; the 3D views offer enabled node metrics in "Colour by" (`{kind: 'metric', metricId}`; a disabled metric falls back to the type colouring).
  - Metrics are computed on the design port's preference-aware resolution (`resolveWithPreferences`), the same one the views draw.
- **Student API:** additive only. Spatial algorithm contexts gained `ctx.metrics` (`list()` and `value(metricId, itemId)`, read-only, types `MetricInfo` and `MetricReader`; workstream M) with the new diagnostic code `unknown-metric`. The host passes the port's preference-aware resolution (`RunOptions.spatial`), so `ctx.metrics` equals what the views show. The frozen runtime surface is unchanged: `student-api/surface.test.ts` pins its runtime exports, and `check:toolkit` must stay green. Graph-algorithm contexts have no `ctx.metrics`.

## 6. Exclusive file ownership for the parallel waves
| Owner | Files |
|---|---|
| Root / integration only | `app/App.tsx`, `app/Workspace.tsx`, `app/workspace/**`, `app/views/contracts.ts`, `app/views/registry.ts`, `app/views/viewportCamera.ts`, view/destination vocabulary in `app/ui/labels.ts`, `app/document/**`, `app/spatial/**`, `app/project/projectFile.ts`, `app/project/storage.ts`, `app/display/contracts.ts`, `app/metrics/contracts.ts`, `core/viewer/three/camera.ts`, `core/viewer/axes.ts`, signatures in `app/building/faceLayout.ts` / `wallRuns.ts` / `faceInteraction.ts`, `app/boundary.test.ts`, `package*.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `docs/**`, `.claude/**`, `scripts/smoke/smoke.mjs` |
| A, UI | `app/ui/**` (except the root vocabulary above), `app/inspector/**`, `app/app.css`, `app/attributes/AttributesPanel.tsx` layout |
| B, project/scenarios | `app/scenarios/**`, `app/welcome/**`, `app/session/projectStore*`, new non-contract helpers in `app/project/` |
| C, building/plan | `app/building/**` bodies, `app/views/plan/**`, `core/geometry/**` |
| D, wall/graph (wave 2) | `app/views/architecture/**`, `app/views/graph2d/**`, `app/views/three/wallInteraction/**` |
| E, camera/display | `core/viewer/three/**` (except `camera.ts`), `app/camera/**`, `app/display/**` (except `contracts.ts`), `app/views/three/**` (except `editing/**`, `colorBy.ts`) |
| M, metrics | `app/metrics/**` (except `contracts.ts`), `app/views/three/colorBy.ts` |
| G, 3DM | `app/designer/**`, `app/assets/**` |
| X, education | `toolkits/**` (not `example-gallery`) |

A file outside a workstream's row is changed only by the integration owner. Each workstream reports the files it needs changed instead of editing them.
