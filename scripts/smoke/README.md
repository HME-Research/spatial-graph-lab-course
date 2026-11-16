# Browser smoke harness

This is a reproducible browser check for Spatial Graph Lab. It needs only **Node ≥ 22** and an installed **Microsoft Edge or Chrome/Chromium**. It adds no npm dependencies. It talks to the browser through the DevTools protocol, using Node's built-in `fetch` and `WebSocket`.

## Safety

- It **never starts or stops Node/Vite**. Start the app yourself, on your own port.
- It launches one private headless browser with a temporary profile, and only ever closes that process.
- It never writes into the repository. Screenshots, `report.md`, `report.json` and downloads go to `--out`. The default is `%TEMP%\spatial-graph-lab-smoke\<timestamp>` on Windows, or the OS temp dir elsewhere.
- Imports use a temporary invalid file and the read-only `app/document/examples/two-storey-example.json`. Confirm dialogs ("discard changes?") are accepted inside the private browser only.

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

Unit tests for the harness helpers: `node --test scripts/smoke/lib.test.mjs`.

## Checks

| Id | What is measured |
|---|---|
| `load/app`, `load/welcome`, `load/project` | The app renders and the Welcome screen is shown at startup (Create, Open, Try Example, Recent; no view panels, so no project was reopened automatically). The check then clicks **Try Example**, the project finishes activating and the design shows nodes in Graph 2D. |
| `viewports/1280x720`, `1366x768`, `1920x1080` | No page scroll (document scroll size ≤ viewport). Toolbar, workspace, panel and sidebar rectangles are recorded, with a screenshot each. |
| `select/node-without-resize` | Clicks a node. Sidebar and panel rectangles must not change by more than 1 px; any change is listed. |
| `views/<mode>` | Each view mode in panel 2. The main canvas or diagram must fill the panel, with no page scroll. Screenshot each. |
| `undo-redo/diagram-drag` | Drags a node in the diagram, then checks that Undo restores the exact position and Redo reapplies it. |
| `analysis/run`, `analysis/stale-after-edit` | Runs the first graph analysis, which must show rows. After an edit, the stale warning must appear. |
| `import/invalid-json-message` | Error clarity: the heading names the file, the message says whether the design was kept, it lists 1–5 issue lines, and the design is unchanged. |
| `import/valid-example` | Imports the example design. |
| `export/json` | Downloads Export JSON and parses it. It must have nodes and edges, and with `--feature v2` it must have `schemaVersion: 2`. |
| `components/*` | **Dev server only.** `fixtures/components.html` renders the Stage 07 components in isolation. Checked: real Tab focus shows the tooltip (`aria-describedby` matches), Enter opens "More details", Escape closes, hover works, all four view legends share identical status entries with only Routed (long dashes) and Unresolved (short dashes) dashed, and the analysis legend marks stale results and Clear removes it. |
| `project-store/*` | **Dev server only.** `fixtures/project-store.html` runs `app/project/storage.ts` against the browser's real IndexedDB in a fresh database (deleted afterwards): save, list order, load round trip, missing, corrupt record quarantined (once), save over it refused, explicit discard then save (copy kept), quota (put throws the browser's own `QuotaExceededError`) and no IndexedDB. |
| `scenarios/*` | Workstream B, on the real IndexedDB of the private browser profile. From a fresh example project: create two scenarios, rename one, delete one (with confirmation); the header names the active scenario and has no switcher. Drag a different node in each scenario; Undo/Redo act only on the active scenario. Wait for "Saved in this browser", reload: Welcome again (no auto-resume), restore the project from Recent and check both scenarios and their edits. Export Project, re-import the file (opened as a separate copy) and check both scenarios. With IndexedDB `put` made to throw a real `QuotaExceededError`, an edit must show "Not saved" and opening another file must ask (confirm dialog) before the unsaved changes are discarded. Finally Scenarios panel and Welcome at 1280×720 without page scroll. |
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
7. Export JSON downloads a file that opens as valid JSON.
8. After integration: Tab to a "?" help button, and a one-sentence tooltip appears. Enter shows "More details" and Escape closes it.
9. After integration: Direct is a solid neutral line, Routed long-dashed neutral and Unresolved short-dashed muted red in every view; Access is thin and Open heavy; each view's legend says "Unresolved" in the same way.

## Gate 1 workflow check (`workflow.mjs`)

An end-to-end check of the integrated app on real schema-v2 data and the real resolver. Same safety rules as `smoke.mjs` (it never starts or stops servers and never writes into the repository).

```powershell
node scripts/smoke/workflow.mjs --url http://localhost:5181/ --viewport 1366x768
node scripts/smoke/workflow.mjs --url http://localhost:5181/ --viewport 1280x720
```

It loads the app three times from scratch, then: adds a room, moves it with Properties, connects it to a separated room (an enclosed corridor is generated: 3 connector cells in Voxels), switches the corridor to Covered and Deck, resizes the room, moves it with the gizmo's step buttons (one undo step), orbits without losing the selection, changes window coverage and a roof in the Designer, applies a transformation, undoes every step one at a time (N operations = N undo steps) and redoes them, exports v2 and re-imports it (byte-identical re-export). Failure cases: room collision (rejected, no history entry), corridor displacement (Cancel keeps the document; "Move anyway and recalculate" records one step), the resulting Unresolved relationship and its undo, a stale transformation preview, invalid JSON, an unsupported schema version and an unknown room type. Finally the selection is checked across Graph 3D, Voxels and Building, and the console must be free of errors.
