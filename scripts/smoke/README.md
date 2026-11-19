# Browser smoke harness

This is a reproducible browser check for Spatial Graph Lab. It needs only **Node ≥ 22** and an installed **Microsoft Edge or Chrome/Chromium**. It adds no npm dependencies. It talks to the browser through the DevTools protocol, using Node's built-in `fetch` and `WebSocket`.

## Safety

- It **never starts or stops Node/Vite**. Start the app yourself, on your own port.
- It launches one private headless browser with a temporary profile, and only ever closes that process.
- It never writes into the repository. Screenshots, `report.md`, `report.json` and downloads go to `--out`. The default is `%TEMP%\spatial-graph-lab-smoke\<timestamp>` on Windows, or the OS temp dir elsewhere.
- Imports use a temporary invalid file and the read-only `app/document/examples/house.json`. Confirm dialogs ("discard changes?") are accepted inside the private browser only.

## Run

```powershell
# terminal 1 (leave running)
npm run dev -- --port 5180 --strictPort
# terminal 2
node scripts/smoke/smoke.mjs --url http://localhost:5180/
# production build
npm run build; npm run preview -- --port 5180 --strictPort
node scripts/smoke/smoke.mjs --url http://localhost:5180/
```

The output is one `PASS` / `FAIL` / `SKIP` line per check, followed by a summary table. Exit codes:
- `0`: no failures.
- `1`: at least one failure. The failure message gives measured values, and a `FAIL-*.png` screenshot is saved.
- `2`: the check could not run, because no browser or server was found.

Unit tests for the harness helpers (`lib.mjs`, `cdp.mjs` and the pure helpers of `app.mjs`): `node --test scripts/smoke/lib.test.mjs`.

## Checks

| Id | What is measured |
|---|---|
| `load/app`, `load/welcome`, `load/project` | The app renders and the Welcome overlay is shown at startup (Create project, Open project, Try example, Recent projects; no view panels, so no project was reopened automatically). The check then clicks **Try example**, the project finishes activating and the design shows nodes in Graph 2D. |
| `viewports/1280x720`, `1366x768`, `1920x1080` | No page scroll (document scroll size ≤ viewport). Toolbar, workspace, panel and sidebar rectangles are recorded, with a screenshot each. |
| `select/node-without-resize` | Clicks a node. Sidebar and panel rectangles must not change by more than 1 px; any change is listed. |
| `views/<mode>` | Each view mode in panel 2. The main canvas or diagram must fill the panel, with no page scroll. Screenshot each. |
| `undo-redo/diagram-drag` | Drags a node in the diagram, then checks that Undo restores the exact position and Redo reapplies it. |
| `analysis/run`, `analysis/stale-after-edit` | Runs the first graph analysis, which must show rows. After an edit, the stale warning must appear. |
| `import/invalid-json-message` | Error clarity: the heading names the file, the message says whether the design was kept, it lists 1–5 issue lines, and the design is unchanged. |
| `import/valid-example` | Imports the example design. |
| `export/json` | Downloads **Export project** and parses the active scenario's design from the project file. It must have nodes and edges, and with `--feature v2` it must have `schemaVersion: 2`. |
| `components/*` | **Dev server only.** `fixtures/components.html` renders the Stage 07 components in isolation. Checked: real Tab focus shows the tooltip (`aria-describedby` matches), Enter opens "More details", Escape closes, hover works, all four view legends share identical status entries with only Routed (long dashes) and Unresolved (short dashes) dashed, and the analysis legend marks stale results and Clear removes it. |
| `project-store/*` | **Dev server only.** `fixtures/project-store.html` runs `app/project/storage.ts` against the browser's real IndexedDB in a fresh database (deleted afterwards): save, list order, load round trip, missing, corrupt record quarantined (once), save over it refused, explicit discard then save (copy kept), quota (put throws the browser's own `QuotaExceededError`) and no IndexedDB. |
| `scenarios/*` | Workstream B, on the real IndexedDB of the private browser profile. From a fresh example project: create two scenarios, rename one, delete one (with confirmation); the header names the active scenario and has no switcher. Drag a different node in each scenario; Undo/Redo act only on the active scenario. Wait for "Saved in this browser", reload: Welcome again (no auto-resume), restore the project from Recent and check both scenarios and their edits. Export project, re-open the file with Open project (opened as a separate copy) and check both scenarios. With IndexedDB `put` made to throw a real `QuotaExceededError`, an edit must show "Not saved" and opening another file must ask (confirm dialog) before the unsaved changes are discarded. Finally Scenarios panel and Welcome at 1280×720 without page scroll. |
| `console/no-errors` | No uncaught exceptions or console errors. The browser's automatic `/favicon.ico` 404 is listed but ignored. |

### Post-integration checks (flags)

These checks report **SKIP** until they are requested. They never pass by default.

| Flag | Check |
|---|---|
| `--feature help` | `HelpTip`s are present in the app, and real Tab focus shows a tooltip that Escape hides. |
| `--feature legend` | `[data-legend-item^="status:"]` entries are visible in the app views. |
| `--feature analysis-overlay` | `.sgl-pres-analysis` appears after running an analysis. |
| `--feature v2` | Export writes `schemaVersion: 2`. |
| `--feature all` | All of the above. |

Use `--only viewports,select,...` to run selected groups. The groups are `viewports`, `select`, `views`, `undo-redo`, `analysis`, `import`, `export`, `help`, `legend`, `components`, `project-store` and `scenarios`. The `load/*` and `console` checks always run.

## Manual checklist (when no browser is available)

1. At 1280×720, 1366×768 and 1920×1080, the page itself does not scroll.
2. Clicking a node does not change the sidebar or panel widths.
3. Graph 2D, Graph 3D, Voxels and Architecture each fill panel 2.
4. Drag a node in the diagram: Undo puts it back and Redo moves it again.
5. Algorithms → run an analysis: values appear. Edit the design: an out-of-date warning appears.
6. Open an invalid JSON file: the message names the file, says the design was kept, and lists a short reason.
7. Export design JSON (current scenario) downloads a file that opens as valid JSON.
8. After integration: Tab to a "?" help button, and a one-sentence tooltip appears. Enter shows "More details" and Escape closes it.
9. After integration: Direct is a solid neutral line, Routed long-dashed neutral and Unresolved short-dashed muted red in every view; Access is thin and Open heavy; each view's legend says "Unresolved" in the same way.

## Scenario scripts: `workflow.mjs`, `walls.mjs`, `gate-i1.mjs`

Three longer end-to-end scripts drive the real app with real pointer input. They use the built-in example house (Welcome → **Try example**: rooms 1 Entrance [0,1,0], 2 Living [1,1,0], 3 Kitchen [1,0,0], 4 Bedroom [1,1,1] and 5 Bath [0,1,1]; relationships 1–2 Access, 2–3 Open, 2–4 Access and 4–5 Access; no toolkit). Where a toolkit is needed, they use the house toolkit (`toolkits/house/`). They follow the same safety rules as `smoke.mjs`: they never start or stop Node/Vite, never write into the repository, and only close the private browser they launched. All three share the helper module `app.mjs` (next section).

```powershell
# the app must already run, e.g. npm run dev -- --port 5390 --strictPort
node scripts/smoke/workflow.mjs --url http://localhost:5390/ --viewport 1366x768
node scripts/smoke/walls.mjs    --url http://localhost:5390/ --viewport 1280x720
node scripts/smoke/gate-i1.mjs  --url http://localhost:5390/ --viewport 1280x720
```

Common options: `--url`, `--viewport WxH` (default 1366x768 for `workflow.mjs`, 1280x720 for the others), `--out DIR` (default `<temp>/spatial-graph-lab-<script>/<timestamp>`), `--browser PATH`, `--headed` and `--help`. Each script prints one `PASS`/`FAIL` line per step. A failed step saves a `FAIL-<step>.png`. Lines starting with `NOTE` report an app issue that was worked around (see `ensureGraphEdges` below); they are not failures. The script writes `<script>.json` (results, console errors, notes) to `--out`. Exit codes: `0` all steps pass, `1` at least one failure, `2` could not run (no browser or server).

Run the scripts **one at a time** against a dev server. With several headless browsers rendering WebGL at once, the dev server and the browsers slow down until waits time out.

### `workflow.mjs`: the workshop workflow

| Step | What is checked |
|---|---|
| `load/fresh-1`, `load/fresh-2` | Reload → Welcome → Try example: the header names the example, 5 rooms and 4 relationships, fresh history, no console errors. |
| `workflow/add-room` | **+ Add node** adds room 6 ("Add room 6"). |
| `workflow/move-in-properties` | Properties → Position moves it to [5,1,0]: one command and one undo step per changed axis. |
| `workflow/connect-generates-corridor` | Properties → Relationships → **Connect** to room 2: the relationship is "Connected via route", its Corridor walls follow "Design default (…)", and Voxels counts 3 connector cells. |
| `workflow/corridor-own-walls-and-roof` | The relationship's own Corridor walls (Enclosed) and roof (None) in Properties: one undo step each. |
| `workflow/corridors-card` | Building Designer → **Corridors (generated)** card: roof Pergola is one undo step, the card summary changes and the card says one relationship sets its own look. The edge keeps its own roof, and its default option now reads "Design default (Pergola…)". |
| `workflow/resize-in-properties` | Size [2,1,1] ("Resize room 6 to 2×1×1"); the calculated Area shows 18 m². |
| `workflow/function-card-window` | "Style another function" → Living card, then window coverage 60 %: one undo step each. The two steps share a label, so the check waits for the card summary. |
| `workflow/undo-redo-every-step` | Undo every recorded step one at a time, checking each label, until no Undo is left (N operations = N undo steps). Then redo all of them. |
| `workflow/export-v2`, `workflow/reimport-roundtrip` | Export project: schema 2, room 6 geometry, the edge's `corridor` override, the corridor card in `settings`, the Living card's `windowFraction`. Open the file again: fresh history, and the re-exported design is identical. |
| `fail/room-collision-rejected` | Entrance Position x = 1 overlaps the Living: an overlap message and no history entry. |
| `fail/corridor-displacement-cancel-and-confirm` | Entrance x = 3 lands on the corridor: **Cancel** keeps the document, and **Move anyway and recalculate** records one step. |
| `fail/unresolved-after-displacement` | The corridor relationship is now Unresolved (dashed in Graph 2D). One Undo gives "Connected via route" again. |
| `fail/invalid-json-import`, `fail/unsupported-version-import`, `fail/unknown-function-import` | The import error names the file and says the design was kept. Schema version 3 is refused. An unknown Function loads without console errors. |
| `views/selection-across-views` | Room 4 stays selected (Properties and Graph 2D) while panel 2 shows Graph 3D, Voxels, Building, Plan and Data. A move then reaches Voxels. |
| `analyse/neighbours-highlight-stale-clear` | Analyse → Neighbours of room 2: the result names 1, 3, 4 and Graph 2D highlights exactly those nodes. After an edit the result is marked out of date. **Clear** removes the result and the highlights. |
| `transform/grow-preview-apply-undo` | With the house toolkit: Transform → Grow to target area → Run. The preview lists Living 36, Kitchen 18 and Bedroom 18 m², and nothing changes yet. Apply makes the Living 2×2×1. One Undo restores everything and leaves no further Undo. |
| `transform/stale-preview` | A preview becomes stale after Redo changes the design: a message is shown and Apply is disabled. It stays stale after Undo returns to the same content. |
| `console/no-errors` | No uncaught exceptions or console errors. The favicon 404 is ignored. |

### `walls.mjs`: shared wall ↔ graph and Remove invalid connections

Setup (`open-example`): Try example, then add room 6 at [0,0,0], beside the Kitchen and in front of the Entrance. The Kitchen | room 6 wall (face `3:-x`, owner room 3) is then a free shared wall. The Building hides its roofs.

| Step | What is checked |
|---|---|
| `building-add-access` | Hover over the wall in the Building until it reports `data-wall-hover="3:-x"`, then click → **Add relationship** → **Access**. Graph 2D gains exactly that edge, the wall panel reports "door on this wall", the Building's Direct count goes up by one and its pixels change, and the Plan draws a door on face `3:-x`. One Undo removes it everywhere. |
| `plan-add-access` | The same from the Plan's wall line (hover highlight, active highlight), with the same edge id as before. The Building's panel for that wall then offers Change to Open / Remove only, never Add. One Undo. |
| `remove-invalid` | Three single-axis moves make three relationships unresolved. Graph 2D **Remove invalid connections (3)** → review list (all checked, preview marks) → uncheck one → **Remove 2 selected**. The Building, Graph 3D and Voxels unresolved counts all drop by 2 ("Remove 2 invalid connections"). One Undo restores both. |
| `no-invalid-explained` | Back at the base state, the Graph 2D canvas menu item explains that there are no invalid connections. |
| `i2/wall-click-selects-owner-room` | A wall click in the Building and in the Plan selects the owner room (room 3) and opens the wall panel. |
| `i2/remove-from-wall-panel-clears-edge-selection` | Add, then **Remove relationship** in the wall panel: the panel offers Add again, room 3 is selected and no edge stays selected. |
| `i2/five-view-sync` | One wall-added Access edge, checked in five views: selected in Graph 2D, selection-colour pixels in Graph 3D and Voxels, Direct +1 in every 3D legend, and the Plan door on the same face. One Undo removes it everywhere. Redo, then room 6 moves away: the edge stays, dashed, Unresolved in every legend, with no Plan door. Remove invalid connections lists it, checked, as "no longer shared". Only it is removed, and one Undo restores it. |
| `graph2d-legend-4-viewports` | Layout 4: the Graph 2D legend starts folded, no node is under it, and it opens on click. |
| `console/no-errors` | No console errors. |

### `gate-i1.mjs`: projects, scenarios, calculated values, layouts, cameras

Each step belongs to an item, and an item passes only when all its steps pass. The script prints `ITEM n: PASS|FAIL` and writes `gate-i1.json`.

| Item · step | What is checked |
|---|---|
| 1 · `welcome-create-empty` | Welcome at startup with no project reopened, and it offers Create / Open / Try example. **Create project** with the House toolkit gives an empty graph, and the header shows House. |
| 1 · `example-named-and-saved` | Try example, rename it in Project (unique name), then **Save locally**: the header says "Saved locally". |
| 1 · `two-scenarios-different-geometry` | **+ New scenario** → Create scenario (a copy). Move the Kitchen in scenario 2 and the Entrance in scenario 1: no edit leaks into the other scenario, and each has its own undo history. |
| 1 · `shared-custom-attribute` | Attributes → **+ Add attribute** → Custom attribute "capacity" (Number). It is listed in both scenarios and in Properties, and it is not a design undo step. |
| 5 · `save-view-and-switch` | Camera: target Viewport 2 (Building), orbit, Save view "Gate view". The other scenario lists 0 saved views, the target is kept across switches, and Recall restores the exact pose. |
| 3 · `add-calculated-attribute` | Area is listed by default. **+ Add attribute** → Calculated attribute → "Exposed façade area". |
| 3 · `properties-readonly-colour-by-refresh` | The Kitchen's row in Properties is read-only. Voxels "Colour by" offers it (and Area) and uses it (legend). Resizing the Kitchen refreshes its value (36 → 54 m²) and its Area, and Undo restores the value. |
| 2 · `add-edge-in-graph2d` | Graph 2D **Add connection…** from the Entrance to the Kitchen (touching, no relationship): the Building's Direct count goes up by one and the Plan draws a door with the new edge id. Clicking the Plan door shows its status in Properties. |
| 2 · `invalid-edge-kept-until-undo` | Moving the Kitchen up a storey keeps the edge, Unresolved, with no Plan door, and "Remove invalid connections" is offered. Undo brings the door back. |
| 1 · `reload-recent-restore` | Reload → Welcome with no project reopened → Recent → the named project. Its scenarios, geometry, relationship counts (from the Scenarios list), "capacity" and a fresh history are back. |
| 3 · `calculated-attribute-persisted` | "Exposed façade area" is still listed and shown after the reload. |
| 5 · `camera-after-reload` | The target and "Gate view" are restored, and Recall gives the saved pose. |
| 1 · `export-import-project` | Export project: 2 scenarios, the capacity attribute, `settings.calculatedFields`, cameras per scenario, and no calculated values. Open it again as a copy: scenarios, attributes and separate histories are intact. |
| 4 · `views-layouts-maximise` | Layout 4 with Graph 2D / Building / Voxels / Plan, then with Graph 3D / Data, then with a room selected. Each viewport is maximised and restored, and layouts 1 and 2 are checked. Every time: no page scroll, panels inside the workspace, header controls not clipped, the projection toggle never covering an overlay, and one visible layout selector. Six view modes are on offer. |
| – · `console/no-errors` | No console errors. |

### Checks dropped or changed in the P4 rewrite

- The old scripts used the deleted "example-gallery" toolkit (reading gallery, store, studios) and the Algorithms tab. They now use the built-in example house and the Analyse and Transform destinations.
- The "connect-storage-to-galleries" transformation and the stale "daylight" preview are now the house toolkit's **Grow to target area** (apply, one undo step, stale preview).
- `workflow.mjs`: the gizmo orbit check (`orbit-keeps-selection`) and the per-function roof change were removed. The Designer check is now the Corridors card plus one function card. The 7-room baseline is now the example's 5 rooms. The project-bar toolkit check is gone, because the example has no toolkit.
- `gate-i1.mjs`: Create project now gives an empty graph, so the scenario work runs on the named and saved example. The shared field is a **custom attribute** added through the Add attribute dialog (the old "Add a node field" form is gone). The opt-in calculated value is still "Exposed façade area", added through that dialog. The check that the colour-by legend *text* changes after a move was dropped: its bands may stay the same. The value refresh is checked in Properties instead. Relationship counts after the restore come from the stored data (the Scenarios list), not from the edges Graph 2D draws.
- `walls.mjs`: the example has no free shared wall, so the script adds room 6 to create one.

## Shared helper module (`app.mjs`)

`scripts/smoke/app.mjs` holds the browser-driving code shared by the three scripts. Any tool that drives the app can use it, for example a guide-screenshot script. It uses only Node built-ins and `cdp.mjs`. A small page-side helper, `window.__sgl`, is installed into every document (it survives reloads).

```js
import { openSession, tryExample, openRail, setViewMode, selectNode, setLayout } from './smoke/app.mjs';

const s = await openSession({ url: 'http://localhost:5390/', viewport: { width: 1366, height: 768 } });
try {
  await tryExample(s);                       // Welcome → Try example, 5 rooms + 4 edges in Graph 2D
  await setLayout(s, 2);
  await setViewMode(s, 1, 'building');       // panel index 1 (data-panel="1"), alias of 'architecture'
  await selectNode(s, 2);
  await openRail(s, 'Building Designer');
  const box = await s.rect('#sidebar-panel-designer');
  await s.screenshot('designer.webp', { clip: box, format: 'webp', quality: 90 });
  if (s.consoleErrors.length) console.error(s.consoleErrors);
} finally {
  await s.close();
}
```

### Session

`openSession({ url, viewport = {width: 1366, height: 768}, out?, headless = true, browser?, navigate = true })` launches the private browser, sets the viewport, allows downloads into `<out>/downloads` and opens `url`. It throws `SetupError` when no browser or server is found. `out` defaults to `<temp>/spatial-graph-lab-session/<timestamp>`. The session object has:

| Member | Meaning |
|---|---|
| `page`, `browser` | The raw CDP connections (`page.send(method, params)`, `page.on(event, fn)`). |
| `url`, `viewport`, `out`, `downloadDir`, `version` | What the session was opened with. |
| `consoleErrors`, `ignoredConsole`, `dialogs`, `notes` | Uncaught exceptions, `console.error` and network errors; ignored ones (favicon 404); accepted confirm dialogs; worked-around app issues. |
| `evaluate(expr)` | Runs a page expression (awaits promises) and returns its JSON value. Throws on a page exception. |
| `waitFor(predicateExpr, timeoutMs = 10000, what?)` | Polls until the expression is truthy and returns its value. Throws "timed out … waiting for <what>". |
| `click(selectorOrText, { within?, timeout?, button? })` | A real mouse click at the centre of the first match: a CSS selector, or else the visible button/tab/label whose text starts with (or whose aria-label equals) the text. `within` is a scope selector. Waits until the element is enabled. |
| `clickElement(finderExpr, what?)` | A real click on the element a page expression returns. |
| `clickAt(x, y, { button?, settle? })`, `moveTo(x, y)`, `drag(x, y, dx, dy, { steps? })`, `key(name)` | Raw input in CSS px. |
| `rect(selector)` | Bounding rectangle `{x, y, width, height}` in CSS px, or null. |
| `screenshot(filePath, { clip?, format?, quality?, scale? })` | `clip` is a rect or a CSS selector; `format` is `png`, `webp` or `jpeg` (by default taken from the file extension); `scale` (e.g. 0.75) makes a smaller image, of the whole viewport when there is no clip. A relative path goes into `out`. Returns `{ file, data }`. |
| `setFiles(selector, paths)` | Fills a file input (Open project / import). |
| `goto(url?)` | Navigate and wait until the document is complete. |
| `download(trigger)` | Runs `trigger()` and returns the path of the new file in `downloadDir`. |
| `writeTemp(name, text)`, `readJson(file)` | Scratch files in `out/tmp` (never the repository). |
| `close()` | Closes the private browser and deletes its profile. |

### App helpers (each takes the session first)

| Helper | What it does |
|---|---|
| `gotoWelcome(s, url?)` | Reload and wait for Welcome to be ready, including its list of saved projects. If that list never finishes ("Looking for saved projects…", a known intermittent issue right after a reload in a fresh headless profile, after which Create project hangs), it reloads again (at most 3 tries) and records a `NOTE`. |
| `tryExample(s)` | Welcome → **Try example** (it reloads first when Welcome is not shown). Waits for 5 rooms and 4 edges in Graph 2D. |
| `openWithToolkit(s, toolkitId = 'house', designFile?)` | Loads `?toolkit=<id>`, then Welcome → Open project with `toolkits/<id>/designs/<id>.json`. A design file becomes a new project that uses that toolkit. Waits for its rooms and edges. Use it for the house example **with** the house toolkit (the Transform, the custom attributes targetArea and priority). |
| `createProject(s, { toolkit? })` | Welcome → **Create project**, with the toolkit chosen in the Welcome picker (or `?toolkit=`). Today this gives an empty graph. |
| `waitForProject(s, nodes?)` | Waits until Welcome has closed, Graph 2D shows `nodes` rooms (or any number) and the project has finished activating. |
| `openRail(s, label)` | Project, Attributes, Building Designer (or Designer), Analyse, Transform, Scenarios, Camera, Display, or Properties (the right pane). It expands a collapsed left pane and returns the panel selector `#sidebar-panel-<id>`. |
| `setViewMode(s, panelIndex, mode)` | `panelIndex` is 0-based (`data-panel`). `mode` is `graph2d`, `graph3d`, `voxels`, `architecture` (alias `building`), `plan` or `data`. It waits for the view's surface. |
| `setLayout(s, n)` | Viewport layout 1, 2 or 4. |
| `selectNode(s, id)`, `selectEdge(s, id)` | A real click on the Graph 2D node, or on the midpoint of the edge (a Graph 2D panel must be shown). Shows Properties and waits for the selection. |
| `nodeCenter(s, id)` | The centre of a node in Graph 2D. |
| `moveRoom(s, id, [x, y, z])` | Select the room and set its Position (one command per changed axis). |
| `expandSection(s, scopeSelector, title)` | Opens folded `.sgl-csection-toggle` sections, for example Properties → "Relationships" or "In the building". |
| `undo(s)`, `redo(s)` | Click the header's Undo or Redo. |
| `ensureGraphEdges(s, expected)` | Waits until Graph 2D draws `expected` edges. If it does not (a known intermittent app issue right after a project opens, most often from Recent), it remounts the view, records a `NOTE` and returns false. |
| `dismissNotices(s)`, `pageOverflow(s)` | Close transient notices; document vs viewport scroll sizes. |
| `createRunner(s, name)` → `{ step(id, fn, { item? }), results, finish(extra) }` | PASS/FAIL recording with `FAIL-*.png`. `finish` writes `<name>.json`, prints the notes and the summary, closes the browser and returns the exit code. |
| `runScript({ name, usage, url, viewport }, body)` | Standard entry point. It parses `--url --viewport --out --browser --headed --timeout --help`, opens the session, runs `body(s, opts)` and exits 0, 1 or 2. |

Pure helpers, unit-tested in `lib.test.mjs`: `parseViewport`, `resolveViewMode`, `railId`, `parseCliArgs`, `urlWithToolkit`, `defaultOutDir`, `VIEW_MODES`, `RAIL`. Paths: `REPO_ROOT`, `EXAMPLE_DESIGN_FILE`, `HOUSE_DESIGN_FILE` (read-only).

The page helper `window.__sgl` gives, among others, `nodes()`, `edgeIds()`, `undoTitle()`, `canUndo()`, `props()`, `railText(id)`, `geo('position.x')`, `triple('size')`, `setTriple(part, [x, y, z])`, `panel(i)`, `graphPanel()`, `panelMode(i, mode)`, `legendCount(i, 'status:direct')`, `planOpenings(i)`, `wallPanel(i)`, `pose(i)`, `canvas(i)`, `wallHover(i)`, `setValue(el, v)`, `enter(el)`, `byText(text, scope)` and `rect(el)`.

## Guide screenshots (`scripts/guide-shots.mjs`)

Captures the app screenshots of the Guide (How-to entries and the Panels tab) with `app.mjs`. Like the smoke scripts it **never starts or stops a server**: start the app yourself and pass `--url`. Unlike them it **writes into the repository**, on purpose: one WebP per entry to `public/guide/<entry id>.webp` (whole-app shots at 0.75 scale, panel shots at full size, quality 80) and the numbered marker centres, as fractions (0–1) of each image, to `app/ui/guide/screenshots.json`. The Guide draws the markers over the image; their numbers are the entry’s step numbers. Alt text is written by hand in `app/ui/guide/screenshots.ts`.

```powershell
node scripts/guide-shots.mjs --url http://localhost:5180/
node scripts/guide-shots.mjs --url http://localhost:5180/ --only howto-connect,panel-analyse   # retake some
```

Each capture prints PASS or FAIL (a missing marker target fails it, with `FAIL-<id>.png` in `--out`); the others still run. Rerun it whenever the UI changes, then run the tests (`app/ui/guide/guideContent.test.ts` checks that every image exists and every marker is inside it) and look at the Guide.
