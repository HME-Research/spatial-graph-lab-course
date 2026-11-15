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
| `load/app`, `load/project` | The app renders and the project finishes activating. The design shows nodes in Graph 2D; if it does not, the check clicks **Load example**. |
| `viewports/1280x720`, `1366x768`, `1920x1080` | No page scroll (document scroll size ≤ viewport). Toolbar, workspace, panel and sidebar rectangles are recorded, with a screenshot each. |
| `select/node-without-resize` | Clicks a node. Sidebar and panel rectangles must not change by more than 1 px; any change is listed. |
| `views/<mode>` | Each view mode in panel 2. The main canvas or diagram must fill the panel, with no page scroll. Screenshot each. |
| `undo-redo/diagram-drag` | Drags a node in the diagram, then checks that Undo restores the exact position and Redo reapplies it. |
| `analysis/run`, `analysis/stale-after-edit` | Runs the first graph analysis, which must show rows. After an edit, the stale warning must appear. |
| `import/invalid-json-message` | Error clarity: the heading names the file, the message says whether the design was kept, it lists 1–5 issue lines, and the design is unchanged. |
| `import/valid-example` | Imports the example design. |
| `export/json` | Downloads Export JSON and parses it. It must have nodes and edges, and with `--feature v2` it must have `schemaVersion: 2`. |
| `components/*` | **Dev server only.** `fixtures/components.html` renders the Stage 07 components in isolation. Checked: real Tab focus shows the tooltip (`aria-describedby` matches), Enter opens "More details", Escape closes, hover works, all four view legends share identical status entries with only Unresolved dashed, and the analysis legend marks stale results and Clear removes it. |
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

Use `--only viewports,select,...` to run selected groups. The groups are `viewports`, `select`, `views`, `undo-redo`, `analysis`, `import`, `export`, `help`, `legend` and `components`. The `load/*` and `console` checks always run.

## Manual checklist (when no browser is available)

1. At 1280×720, 1366×768 and 1920×1080, the page itself does not scroll.
2. Clicking a node does not change the sidebar or panel widths.
3. Graph 2D, Graph 3D, Voxels and Architecture each fill panel 2.
4. Drag a node in the diagram: Undo puts it back and Redo moves it again.
5. Algorithms → run an analysis: values appear. Edit the design: an out-of-date warning appears.
6. Open an invalid JSON file: the message names the file, says the design was kept, and lists a short reason.
7. Export JSON downloads a file that opens as valid JSON.
8. After integration: Tab to a "?" help button, and a one-sentence tooltip appears. Enter shows "More details" and Escape closes it.
9. After integration: an unresolved relationship is a thin muted red dashed line in every view, and each view's legend says "Unresolved" in the same way.
