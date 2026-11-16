# Gate F contracts (V3 additions) — frozen for the 2026-11 programme

Additive to `docs/CONTRACTS-V2.md`. The v2 design schema (`app/document/v2/schema.ts`) is **unchanged**: every v2 file written before Gate F reads identically and is written identically. Everything new lives beside it. Change these contracts only on root `main`, through the integration owner. Workstreams propose changes as a diff in their report.

## 1. Shell (`app/workspace/**`, `app/Workspace.tsx`, `app/App.tsx`)
- **Seven left destinations, in order:** Project, Attributes, Building Designer, Algorithms, Scenarios, Camera, Display (`SIDEBAR_SECTIONS`, `app/workspace/destinations.ts`). The id `designer` is kept for Building Designer. This supersedes the earlier "exactly four destinations" rule. There is no 8th destination. The right side shows Properties only.
- **Panel slots:** `DESTINATION_PANELS` (`app/workspace/panelSlots.ts`) maps `scenarios | camera | display` to components in the owning workstream folders. Those components read `useWorkspaceServices()`, which provides `design`, `selection`, `onSelect`, `viewports` and `cameraBus`. Workstreams replace component bodies, never the map. Services are extended additively at integration.
- **Panes:**
  - Left width defaults to 300 px, clamped to 240–560. It is a keyboard-operable separator, with a centred collapse chevron.
  - Width and a deliberate collapse persist in `localStorage` (`sgl:ui:*`, every access guarded).
  - Properties auto-opens on selection unless the user deliberately collapsed it.
- **Views:**
  - `VIEW_MODES = graph2d, graph3d, voxels, architecture, plan`. Plan (workstream C, merged at I1) draws one storey as SVG from the shared face layout (`buildPlan`); its drawing surface is `svg[data-view-surface="plan"]`.
  - Graph 3D, Voxels and Building are `React.lazy` in the registry, under `<Suspense key={mode}>` in `Workspace` (workstream E).
  - Graph 3D stays read-only.
  - Viewports are `viewport-1…4`, with layout 1 | 2 | 4 (default 2) and default modes `[graph2d, architecture, graph3d, plan]`.
  - Maximise/Restore is offered per viewport. Viewports maximised away stay mounted (`hidden`); viewports outside the layout are unmounted.

## 2. Project file and storage (`app/project/**`)
- **`ProjectFileV1`** (`format: 'spatial-graph-lab/project'`, `version: 1`) contains:
  - identity: `projectId`, `name`, `description?`, `createdAt`, `updatedAt`;
  - `definition: {projectId} | null`: the code project in `projects/<id>` that supplies types and algorithms. It is referenced, never embedded, so the file needs the same project installed to resolve its types;
  - `attributes`: the project attribute record, validated by `readAttributeRecord`;
  - `activeScenarioId` and `scenarios[]`;
  - `settings.display`;
  - `settings.calculatedFields?` (optional, added at I1): the ids of the calculated values (metrics) the project shows in Properties and offers for colour-by. Metric ids only, never values. Absent = the built-in default selection; the key is written only when set, so older files stay byte-identical. The file keeps the ids as written (structure validated: at most 64 strings of 1–64 characters); the app reads them with `sanitizeEnabledMetrics` (unknown ids ignored, canonical order) and writes canonical lists. Project-level, not per scenario, not undoable;
  - `assets: {policy: 'none'}`.
- **Scenario** = `{id, name, design (DesignDocumentV2, read with readDesign), facePreferences, cameras: SavedCamera[], display: DisplayOverrides}`. A scenario is a complete design alternative.
- **Reading and writing:**
  - `readProjectFile` validates the whole file, and nothing replaces state on failure.
  - `serializeProjectFile` is canonical.
  - `projectFromLegacyDesign` turns a v1 or v2 design file into a project with one scenario.
  - `saveAsNewProject` makes a deep copy with a new project id and new scenario ids.
- **Binary assets are not part of the file.** Project JSON portability covers scenarios, the schema and settings only. 3DM asset packaging is an open decision (backlog BD02/CO04).
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
- **Open project and autosave (workstream B, merged at I1):** `app/session/projectStore.ts` (pure open-project state) and `projectStoreController.ts` (UI-independent controller). The app starts with no project: Welcome is always shown and nothing reopens automatically. Save state is explicit (`pending | saving | saved | blocked` with a reason, including `conflict` for a two-tab write detected under a Web Lock); leaving a project with changes that could not be stored needs explicit confirmation. Project settings that are not design content go through `setCameras`, `setScenarioDisplay`, `setDisplayDefaults`, `setCalculatedFields` and `setAttributeRecord`: autosaved and exported, never undo steps.
- **Camera and Display binding (I1):** `app/session/projectViewSettings.ts` backs E's `SavedCameraStore` with each scenario's `cameras` and E's `DisplayStore` with `settings.display` (defaults) and each scenario's `display` (overrides). The providers receive the ACTIVE scenario id; reads always follow the open project, so nothing leaks between projects. Cameras of view modes the app does not offer are kept in the file but not listed. The Camera panel's chosen target viewport is a per-browser UI choice (`localStorage` `sgl:ui:camera-target`), not project data.

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
  - `Function` (`typeId`) and `Level` (`grid[2]`) are system-backed fields (`app/metrics/system.ts`), not metrics; Properties shows Level once, with the room's identity.
  - **Enabled selection:** the project's `settings.calculatedFields` (§2), read with `sanitizeEnabledMetrics`, toggled in the Attributes "Calculated" catalogue, provided to views and Properties through `EnabledMetricsContext` (`app/views/three/enabledMetrics.ts`). Properties renders `metricRows` (shared `defaultMetricEvaluator`, `formatMetricValue`) read-only; the 3D views offer enabled node metrics in "Colour by" (`{kind: 'metric', metricId}`; a disabled metric falls back to the type colouring).
  - Metrics are computed on the design port's preference-aware resolution (`resolveWithPreferences`), the same one the views draw.
- **Student API:** additive only. Spatial algorithm contexts gained `ctx.metrics` (`list()` and `value(metricId, itemId)`, read-only, types `MetricInfo` and `MetricReader`; workstream M) with the new diagnostic code `unknown-metric`. The host passes the port's preference-aware resolution (`RunOptions.spatial`), so `ctx.metrics` equals what the views show. The frozen runtime surface is unchanged: `student-api/surface.test.ts` pins its runtime exports, and `check:project` must stay green. Graph-algorithm contexts have no `ctx.metrics`.

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
| X, education | `projects/**` (not `example-gallery`) |

A file outside a workstream's row is changed only by the integration owner. Each workstream reports the files it needs changed instead of editing them.
