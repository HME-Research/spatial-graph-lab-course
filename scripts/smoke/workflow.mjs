#!/usr/bin/env node
// Spatial Graph Lab — Gate 1 end-to-end workflow check (integration). See scripts/smoke/README.md.
//
// Drives the REAL app (dev or production preview) through the complete workshop workflow on real
// schema-v2 data with the real resolver: add node, connect, move/resize, corridor generation,
// corridor walls / roof, Designer façade/roof, an algorithm, undo/redo, export/re-import; plus failure
// cases (room collision, corridor displacement Cancel/confirm, unresolved route, invalid JSON,
// unsupported version, unknown type, stale transformation preview) and four-view coordination.
//
// Same safety rules as smoke.mjs: never starts/stops Node or Vite, never writes into the
// repository (output defaults to the OS temp dir), only closes the private browser it launched.
//
//   node scripts/smoke/workflow.mjs --url http://localhost:5181/ [--viewport 1366x768] [--out DIR]

import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findBrowser, launch } from './cdp.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = arg('url', 'http://localhost:5181/');
const [vw, vh] = arg('viewport', '1366x768').split('x').map(Number);
const outDir = resolve(arg('out', join(tmpdir(), 'spatial-graph-lab-workflow', new Date().toISOString().replace(/[:.]/g, '-'))));
const downloadDir = join(outDir, 'downloads');
mkdirSync(downloadDir, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const executable = findBrowser(arg('browser'));
if (!executable) {
  console.error('error: no Edge/Chromium found');
  process.exit(2);
}
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`error: cannot reach ${url}: ${e instanceof Error ? e.message : e}`);
  process.exit(2);
}

const { page, browser, version } = await launch({ executable, headless: true });
console.log(`      ${version}; viewport ${vw}x${vh}; output ${outDir}\n`);

const consoleErrors = [];
const failedRequests = [];
const dialogs = [];
page.on('Runtime.exceptionThrown', (p) => consoleErrors.push(`exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`));
page.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') consoleErrors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
});
page.on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error' && !/favicon\.ico/.test(p.entry.url ?? '')) consoleErrors.push(`${p.entry.source}: ${p.entry.text} ${p.entry.url ?? ''}`);
});
page.on('Network.loadingFailed', (p) => failedRequests.push(`${p.errorText} ${p.requestId}`));
page.on('Page.javascriptDialogOpening', (p) => {
  dialogs.push(`${p.type}: ${p.message}`);
  void page.send('Page.handleJavaScriptDialog', { accept: true });
});
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Log.enable');
await page.send('DOM.enable');
await page.send('Network.enable');
await page.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });

// ── helpers ───────────────────────────────────────────────────────────────────────────────────
async function evaluate(expression) {
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}
async function waitFor(expression, what, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await evaluate(expression);
    if (v) return v;
    await delay(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}
async function screenshot(name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}
async function mouse(type, x, y, extra = {}) {
  await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
}
async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y, { buttons: 1 });
  await mouse('mouseReleased', x, y, { buttons: 0 });
  await delay(150);
}
async function dragAt(x, y, dx, dy, steps = 10) {
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y, { buttons: 1 });
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps, { buttons: 1 });
    await delay(16);
  }
  await mouse('mouseReleased', x + dx, y + dy, { buttons: 0 });
  await delay(250);
}
async function setFile(selector, path) {
  const { root } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}
/** Page-side helpers installed once per load. */
const PAGE_HELPERS = `
window.__wf = {
  setValue(el, v) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  },
  enter(el) {
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
  },
  button(text, scope = document) {
    return [...scope.querySelectorAll('button')].find((b) => b.offsetParent !== null && b.textContent.trim().startsWith(text)) ?? null;
  },
  click(text, scope = document) {
    const b = this.button(text, scope);
    if (!b) return 'missing';
    if (b.disabled) return 'disabled';
    b.click();
    return 'clicked';
  },
  undoTitle() { return document.querySelector('.history-actions button')?.getAttribute('aria-label') ?? ''; },
  redoTitle() { return document.querySelectorAll('.history-actions button')[1]?.getAttribute('aria-label') ?? ''; },
  canUndo() { return !document.querySelector('.history-actions button').disabled; },
  canRedo() { return !document.querySelectorAll('.history-actions button')[1].disabled; },
  nodes() { return [...document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node')].map((n) => n.getAttribute('data-id')); },
  edges() { return [...document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__edge')].length; },
  props() { return document.querySelector('#sidebar-panel-properties')?.innerText ?? ''; },
  // Geometry rows of Properties (P4): Position X, Position Y, Level / Size X, Size Y, Floors, each its own field.
  GEO: { position: ['position-x', 'position-y', 'level'], size: ['size-x', 'size-y', 'floors'] },
  geo(id) { return (document.querySelector('#sidebar-panel-properties') ?? document).querySelector('.sgl-field[data-attribute="' + id + '"] input'); },
  field(part, axis) { return this.geo(this.GEO[part][['x', 'y', 'z'].indexOf(axis)]); },
  triple(part) { return this.GEO[part].map((id) => Number(this.geo(id)?.value)); },
  // One edit per changed axis: each row is its own command and undo step (a 3-axis change is up to
  // three steps, applied x, y, z in order). Returns the number of edits sent.
  setTriple(part, values) {
    let sent = 0;
    this.GEO[part].forEach((id, i) => {
      const el = this.geo(id);
      if (!el || Number(el.value) === values[i]) return;
      this.setValue(el, values[i]);
      this.enter(el);
      sent += 1;
    });
    return sent;
  },
  panel2(mode) { const s = document.querySelectorAll('.panel-header select')[1]; this.setValue(s, mode); return s.value; },
  voxelInfo() { return document.querySelector('.view-panel[data-panel="1"] .viewer3d-info')?.innerText ?? ''; },
  tab(id) { document.querySelector('#sidebar-tab-' + id)?.click(); },
};
true`;
const helpers = () => evaluate(PAGE_HELPERS);
const nodeCenter = (id) =>
  evaluate(`(() => { const n = document.querySelector('.view-panel[data-panel="0"] .react-flow__node[data-id="${id}"]'); if (!n) return null;
    const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
async function selectNodeInGraph(id) {
  const c = await nodeCenter(id);
  if (!c) throw new Error(`node ${id} not in Graph 2D`);
  await clickAt(c.x, c.y);
  // Since phase 06 a click only selects (the summary opens on double-click); close one if open.
  await evaluate(`document.querySelector('.view-panel[data-panel="0"] .sgl-popover button[aria-label="Close details"]')?.click(); true`);
  await evaluate(`__wf.tab('properties'); true`);
  await waitFor(`__wf.field('position', 'x') !== null`, `Properties of ${id}`);
}
let downloads = 0;
async function download() {
  const before = new Set(readdirSync(downloadDir));
  await evaluate(`__wf.tab('project'); true`);
  if ((await evaluate(`__wf.click('Export project')`)) !== 'clicked') throw new Error('Export project not clickable');
  for (const end = Date.now() + 8000; Date.now() < end; ) {
    const name = readdirSync(downloadDir).find((x) => !before.has(x) && x.endsWith('.json'));
    if (name) {
      await delay(200);
      // Rename, so a later export with the same name is detected as a new file.
      const file = join(downloadDir, `export-${++downloads}-${name}`);
      renameSync(join(downloadDir, name), file);
      // A project file: the active scenario's design is what the old design export contained.
      const project = JSON.parse(readFileSync(file, 'utf8'));
      return { file, project, json: project.scenarios.find((s) => s.id === project.activeScenarioId).design };
    }
    await delay(150);
  }
  throw new Error('no download');
}

const results = [];
async function step(id, fn) {
  try {
    const message = await fn();
    results.push({ id, status: 'PASS', message });
    console.log(`PASS  ${id}  ${message}`);
  } catch (e) {
    const shot = await screenshot(`FAIL-${id.replace(/[^a-z0-9-]+/gi, '_')}`).catch(() => null);
    const message = `${e instanceof Error ? e.message : String(e)}${shot ? ` (screenshot ${shot})` : ''}`;
    results.push({ id, status: 'FAIL', message });
    console.log(`FAIL  ${id}  ${message}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ── 0. fresh load (repeated, to look for the intermittent project-loading failure) ───────────────
for (let i = 1; i <= 3; i++) {
  await step(`load/fresh-${i}`, async () => {
    const errorsBefore = consoleErrors.length;
    await page.send('Page.navigate', { url });
    // Welcome is always shown at startup (workstream B): open the example as a new local project.
    await waitFor(`!!document.querySelector('.sgl-welcome')`, 'the Welcome screen', 20000);
    await evaluate(`[...document.querySelectorAll('.sgl-welcome button')].find((b) => b.textContent.trim().startsWith('Try example'))?.click(); true`);
    await waitFor(`document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node').length > 0`, 'the design', 20000);
    await helpers();
    // The toolkit (types, algorithms) of the local project is activated.
    await waitFor(`!document.querySelector('.project-bar[aria-busy="true"]')`, 'the toolkit to activate', 20000);
    // The header names the project only (no internal or toolkit ids); the toolkit is listed in Project → Advanced.
    const bar = await evaluate(`document.querySelector('.sgl-identity-project')?.textContent ?? ''`);
    expect(/^Example/.test(bar), `project identity: ${bar.slice(0, 120)}`);
    await evaluate(`__wf.tab('project'); true`);
    const toolkit = await waitFor(`(() => { const dt = [...document.querySelectorAll('.sgl-project dt')].find((d) => d.textContent === 'Toolkit'); const t = dt?.nextElementSibling?.textContent ?? ''; return t && t !== 'loading…' ? t : null; })()`, 'the toolkit');
    expect(toolkit.length > 0, `toolkit: ${toolkit}`);
    expect(consoleErrors.length === errorsBefore, `console errors: ${consoleErrors.slice(errorsBefore).join(' | ')}`);
    return `project active, ${(await evaluate('__wf.nodes()')).length} rooms, no console errors`;
  });
}
await screenshot(`00-loaded-${vw}x${vh}`);

// ── 1. workflow ───────────────────────────────────────────────────────────────────────────────
let newId = null;
const undoLabels = [];

await step('workflow/add-node', async () => {
  const before = await evaluate('__wf.nodes()');
  expect((await evaluate(`__wf.click('+ Add node')`)) === 'clicked', 'Add node button');
  await waitFor(`__wf.nodes().length === ${before.length + 1}`, 'a new node');
  newId = (await evaluate('__wf.nodes()')).find((id) => !before.includes(id));
  const label = await evaluate('__wf.undoTitle()');
  undoLabels.push(label);
  expect(/Add room \d+/.test(label), `undo label ${label}`);
  return `added ${newId}; ${label}`;
});

await step('workflow/move-via-properties', async () => {
  await selectNodeInGraph(newId);
  // Position X / Position Y / Level are separate fields: one edit and one undo step per changed axis.
  const target = [5, 0, 0];
  const next = await evaluate(`__wf.triple('position')`);
  for (let i = 0; i < 3; i++) {
    if (next[i] === target[i]) continue;
    next[i] = target[i];
    const label = `Move room ${newId} to [${next.join(', ')}]`;
    await evaluate(`__wf.setTriple('position', ${JSON.stringify(next)}); true`);
    await waitFor(`__wf.undoTitle().includes(${JSON.stringify(label)})`, label);
    undoLabels.push(await evaluate('__wf.undoTitle()'));
  }
  return `${newId} at ${JSON.stringify(await evaluate(`__wf.triple('position')`))}; ${undoLabels.at(-1)}`;
});

await step('workflow/connect-generates-enclosed-corridor', async () => {
  await evaluate(`(() => { const s = document.querySelector('select[aria-label="Room to connect to"]'); __wf.setValue(s, 'studio-ground'); return true; })()`);
  expect((await evaluate(`__wf.click('Connect', document.querySelector('#sidebar-panel-properties'))`)) === 'clicked', 'Connect button');
  await waitFor(`/Add connection/.test(__wf.undoTitle())`, 'the connection to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  // Show the new relationship's Properties.
  const shown = await evaluate(`(() => { const b = [...document.querySelectorAll('#sidebar-panel-properties button[title="Show this relationship"]')].pop(); if (!b) return false; b.click(); return true; })()`);
  expect(shown, 'relationship link in Properties');
  const text = await waitFor(`/In the building/i.test(__wf.props()) && __wf.props()`, 'relationship Properties');
  expect(/Connected via route/.test(text), `status: ${text.slice(0, 300)}`);
  const walls = await evaluate(`document.querySelector('select[aria-label="Corridor walls"]')?.value ?? null`);
  expect(walls === '', `corridor walls follow the design default: ${walls}`);
  await evaluate(`__wf.panel2('voxels'); true`);
  const info = await waitFor(`/connector cells/.test(__wf.voxelInfo()) && __wf.voxelInfo()`, 'connector cells in Voxels');
  expect(/3 connector cells/.test(info), `voxels: ${info}`);
  await screenshot(`10-corridor-voxels-${vw}x${vh}`);
  await evaluate(`__wf.panel2('architecture'); true`);
  await delay(600);
  await screenshot(`11-corridor-building-default-${vw}x${vh}`);
  return `routed, design default (open + flat); Voxels "${info.split('\n').pop()}"`;
});

await step('workflow/change-corridor-look', async () => {
  await evaluate(`__wf.setValue(document.querySelector('select[aria-label="Corridor walls"]'), 'enclosed'); true`);
  await waitFor(`/corridor walls/.test(__wf.undoTitle())`, 'the walls change to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  await delay(600);
  await screenshot(`12-corridor-building-enclosed-${vw}x${vh}`);
  await evaluate(`__wf.setValue(document.querySelector('select[aria-label="Corridor roof"]'), 'none'); true`);
  await waitFor(`document.querySelector('select[aria-label="Corridor roof"]').value === 'none'`, 'no roof');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  await delay(600);
  await screenshot(`13-corridor-building-enclosed-no-roof-${vw}x${vh}`);
  return 'design default → own Enclosed walls → own no roof, one undo step each';
});

await step('workflow/resize-via-properties', async () => {
  await selectNodeInGraph(newId);
  await evaluate(`__wf.setTriple('size', [2, 1, 1]); true`);
  await waitFor(`/Resize room .* to 2×1×1/.test(__wf.undoTitle())`, 'the resize to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  return undoLabels.at(-1);
});

await step('workflow/move-in-properties-voxels', async () => {
  await evaluate(`__wf.panel2('voxels'); true`);
  // The Move/Resize step panel was removed (2026-11-17); the keyboard alternative to the gizmo is
  // the room's Position in Properties (one change = one command).
  expect(!(await evaluate(`!!document.querySelector('[aria-label$="plus one cell"]')`)), 'the Move/Resize step buttons are back');
  const before = await evaluate(`__wf.triple('position')`);
  await evaluate(`__wf.setTriple('position', [${before[0]}, ${before[1] + 1}, ${before[2]}]); true`);
  await waitFor(`__wf.triple('position')[1] === ${before[1] + 1}`, 'the gizmo move');
  const label = await evaluate('__wf.undoTitle()');
  expect(/Move room/.test(label), label);
  // Undo it: exactly one step returns the room.
  await evaluate(`document.querySelector('.history-actions button').click(); true`);
  await waitFor(`__wf.triple('position')[1] === ${before[1]}`, 'undo of the gizmo move');
  return `+y moved ${JSON.stringify(before)} → y+1 in one step; undo restored`;
});

await step('workflow/orbit-keeps-selection', async () => {
  const rect = await evaluate(`(() => { const c = document.querySelector('.view-panel[data-panel="1"] canvas'); const b = c.getBoundingClientRect(); return { x: b.x + 30, y: b.y + b.height - 60 }; })()`);
  await dragAt(rect.x, rect.y, 80, -20);
  const text = await evaluate('__wf.props()');
  expect(new RegExp(`Room`).test(text) && (await evaluate(`__wf.field('position', 'x') !== null`)), 'selection lost after orbit');
  return 'orbit drag on empty canvas kept the selected room';
});

await step('workflow/designer-windows-and-roof', async () => {
  await evaluate(`__wf.tab('designer'); true`);
  // "Style rooms by" (2026-11-18): functions get a card from "+ Style another function" (one undo step each).
  await waitFor(`document.querySelector('select[aria-label="Style another function"]') !== null`, 'the Designer add menu');
  for (const fn of ['gallery', 'studio']) {
    const before = await evaluate('__wf.undoTitle()');
    await evaluate(`(() => { const s = document.querySelector('select[aria-label="Style another function"]'); __wf.setValue(s, '${fn}'); return true; })()`);
    await waitFor(`__wf.undoTitle() !== ${JSON.stringify(before)}`, `the ${fn} card`);
    undoLabels.push(await evaluate('__wf.undoTitle()'));
  }
  await waitFor(`document.querySelector('input[aria-label="Gallery window coverage in percent"], input[aria-label$="window coverage in percent"]') !== null`, 'Designer rows');
  const names = await evaluate(`[...document.querySelectorAll('input[aria-label$="window coverage in percent"]')].map((i) => i.getAttribute('aria-label'))`);
  const gallery = names.find((n) => /gallery/i.test(n)) ?? names[0];
  await evaluate(`(() => { const i = document.querySelector('input[aria-label="${gallery}"]'); __wf.setValue(i, '60'); __wf.enter(i); return true; })()`);
  await waitFor(`/Designer settings/.test(__wf.undoTitle())`, 'the window change to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  const roofSelects = await evaluate(`[...document.querySelectorAll('.sgl-designer-type select')].map((s) => s.id)`);
  const studioRoof = roofSelects.find((id) => /studio/i.test(id)) ?? roofSelects[0];
  const n = undoLabels.length;
  await evaluate(`__wf.setValue(document.getElementById('${studioRoof}'), 'none'); true`);
  await waitFor(`__wf.undoTitle() !== ${JSON.stringify(undoLabels[n - 1])} || document.getElementById('${studioRoof}').value === 'none'`, 'the roof change');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  await evaluate(`__wf.panel2('architecture'); true`);
  await delay(700);
  await screenshot(`14-designer-building-${vw}x${vh}`);
  return `${gallery} = 60 %, ${studioRoof} = none`;
});

let edgesBeforeAlgorithm = 0;
await step('workflow/run-transformation-and-apply', async () => {
  await evaluate(`__wf.tab('transform'); true`);
  edgesBeforeAlgorithm = await evaluate('__wf.edges()');
  const picked = await evaluate(`(() => { const b = [...document.querySelectorAll('.algorithm-item')].find((x) => /storage|store/i.test(x.textContent)); if (!b) return false; b.click(); return true; })()`);
  expect(picked, 'connect-storage-to-galleries in the list');
  expect((await evaluate(`__wf.click('Run', document.querySelector('#sidebar-panel-transform'))`)) === 'clicked', 'Run');
  await waitFor(`/preview:/i.test(document.querySelector('#sidebar-panel-transform').innerText)`, 'the preview');
  expect((await evaluate(`__wf.click('Apply', document.querySelector('#sidebar-panel-transform'))`)) === 'clicked', 'Apply');
  await waitFor(`/Apply “/.test(__wf.undoTitle())`, 'the apply to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  const after = await evaluate('__wf.edges()');
  expect(after > edgesBeforeAlgorithm, `edges ${edgesBeforeAlgorithm} → ${after}`);
  return `edges ${edgesBeforeAlgorithm} → ${after}; ${undoLabels.at(-1)}`;
});

await step('workflow/undo-redo-every-step', async () => {
  // Undo all recorded steps one at a time, checking each label, then redo them all.
  const seen = [];
  for (let i = undoLabels.length - 1; i >= 0; i--) {
    const title = await evaluate('__wf.undoTitle()');
    expect(title === undoLabels[i], `undo #${undoLabels.length - i}: expected "${undoLabels[i]}", got "${title}"`);
    seen.push(title);
    await evaluate(`document.querySelector('.history-actions button').click(); true`);
    await delay(120);
  }
  expect(!(await evaluate('__wf.canUndo()')), 'undo still possible after undoing every step (an operation took more than one entry)');
  expect((await evaluate('__wf.nodes()')).length === 7, 'baseline should have the 7 rooms of the example');
  for (let i = 0; i < undoLabels.length; i++) {
    await evaluate(`document.querySelectorAll('.history-actions button')[1].click(); true`);
    await delay(120);
  }
  expect(!(await evaluate('__wf.canRedo()')), 'redo still possible');
  expect((await evaluate('__wf.edges()')) > edgesBeforeAlgorithm, 'redo did not restore the algorithm result');
  return `${undoLabels.length} operations = ${undoLabels.length} undo steps, all redone`;
});

let exported = null;
await step('workflow/export-v2', async () => {
  exported = await download();
  const d = exported.json;
  expect(d.schemaVersion === 2, `schemaVersion ${d.schemaVersion}`);
  const room = d.nodes.find((n) => n.id === newId);
  expect(room && JSON.stringify(room.size) === '[2,1,1]' && JSON.stringify(room.grid) === '[5,0,0]', `new room ${JSON.stringify(room)}`);
  const corridor = d.edges.find((e) => (e.source === newId || e.target === newId) && e.corridor);
  expect(corridor?.corridor?.walls === 'enclosed' && corridor?.corridor?.roof === 'none', `connector edge ${JSON.stringify(corridor)}`);
  // Function cards ("Style rooms by", 2026-11-18): settings.styles.function.groups[].look.
  const cards = (d.settings?.styles?.function?.groups ?? []).map((g) => g.look);
  expect(d.settings?.styleBy === 'function', `styleBy ${d.settings?.styleBy}`);
  expect(cards.some((a) => a.windowFraction === 0.6) && cards.some((a) => a.roof === 'none'), `function cards ${JSON.stringify(cards)}`);
  return `${exported.file}: v2, ${d.nodes.length} rooms, ${d.edges.length} relationships, function cards ${JSON.stringify(cards)}`;
});

await step('workflow/reimport-roundtrip', async () => {
  await evaluate(`__wf.tab('project'); true`);
  await setFile('.sgl-project-actions input[type="file"]', exported.file);
  await waitFor(`!__wf.canUndo()`, 'the re-imported design (fresh history)');
  const nodes = await evaluate('__wf.nodes()');
  expect(nodes.length === exported.json.nodes.length, `rooms ${nodes.length}`);
  const modified = await evaluate(`/unsaved|modified|not exported/i.test(document.querySelector('.project-bar')?.innerText ?? '')`);
  expect(!modified, 'design marked modified right after import');
  const again = await download();
  // Re-opened in the same browser the project gets a new identity (a separate copy); its scenario design is identical.
  expect(JSON.stringify(again.json) === JSON.stringify(exported.json), 're-exported scenario design differs from the imported one');
  return `re-imported ${nodes.length} rooms; re-exported scenario design is identical; dialogs accepted: ${dialogs.length}`;
});

// ── 2. failure cases ─────────────────────────────────────────────────────────────────────────
await step('fail/room-collision-rejected', async () => {
  // Room 1 (the entrance at [0, 0, 0]) is never moved by the steps above: Position X = 1 (one
  // Geometry edit) puts it into room 2.
  await selectNodeInGraph('1');
  const before = await evaluate('__wf.undoTitle()');
  const pos = await evaluate(`__wf.triple('position')`);
  await evaluate(`__wf.setTriple('position', [1, ${pos[1]}, ${pos[2]}]); true`);
  const msg = await waitFor(`(/overlaps/i.test(__wf.props()) && __wf.props().match(/[^\\n]*overlaps[^\\n]*/i)[0])`, 'an overlap message');
  expect((await evaluate('__wf.undoTitle()')) === before, 'a history entry was recorded for a rejected move');
  await delay(200);
  const after = await evaluate(`__wf.triple('position')`);
  return `"${msg}"; no history entry; stored position ${JSON.stringify(pos)} (field shows ${JSON.stringify(after)})`;
});

await step('fail/corridor-displacement-cancel-and-confirm', async () => {
  await selectNodeInGraph('gallery-upper');
  const before = await evaluate('__wf.undoTitle()');
  await evaluate(`__wf.setTriple('position', [3, 0, 0]); true`);
  await waitFor(`__wf.button('Move anyway and recalculate') !== null`, 'the corridor confirmation');
  await screenshot(`20-displacement-confirm-${vw}x${vh}`);
  expect((await evaluate(`__wf.click('Cancel', document.querySelector('#sidebar-panel-properties'))`)) === 'clicked', 'Cancel');
  await delay(200);
  expect((await evaluate('__wf.undoTitle()')) === before, 'Cancel changed the document');
  await evaluate(`__wf.setTriple('position', [3, 0, 0]); true`);
  await waitFor(`__wf.button('Move anyway and recalculate') !== null`, 'the corridor confirmation again');
  expect((await evaluate(`__wf.click('Move anyway and recalculate')`)) === 'clicked', 'confirm');
  await waitFor(`/Move room .* to \\[3, 0, 0\\]/.test(__wf.undoTitle())`, 'the confirmed move');
  return `Cancel kept the document; confirm recorded "${await evaluate('__wf.undoTitle()')}"`;
});

await step('fail/unresolved-route-after-displacement', async () => {
  await selectNodeInGraph(newId);
  const shown = await evaluate(`(() => { const b = [...document.querySelectorAll('#sidebar-panel-properties button[title="Show this relationship"]')].find((x) => /02/.test(x.textContent)) ?? [...document.querySelectorAll('#sidebar-panel-properties button[title="Show this relationship"]')][0]; if (!b) return false; b.click(); return true; })()`);
  expect(shown, 'relationship link');
  const text = await waitFor(`/In the building/i.test(__wf.props()) && __wf.props()`, 'relationship Properties');
  expect(/Unresolved/.test(text), `expected Unresolved: ${text.slice(0, 300)}`);
  const red = await evaluate(`[...document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__edge path')].some((p) => (p.getAttribute('stroke') ?? getComputedStyle(p).stroke).toLowerCase().includes('a2453f') || getComputedStyle(p).stroke === 'rgb(162, 69, 63)')`);
  await screenshot(`21-unresolved-${vw}x${vh}`);
  // One undo returns the corridor.
  await evaluate(`document.querySelector('.history-actions button').click(); true`);
  const back = await waitFor(`/In the building/i.test(__wf.props()) && __wf.props()`, 'relationship Properties after undo');
  expect(/Connected via route/.test(back), 'undo did not restore the corridor');
  return `status Unresolved with reason; red dashed edge in Graph 2D: ${red}; one undo restored "Connected via route"`;
});

await step('fail/stale-transformation-preview', async () => {
  await evaluate(`__wf.tab('transform'); true`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.algorithm-item')].find((x) => /daylight/i.test(x.textContent)); b?.click(); return true; })()`);
  expect((await evaluate(`__wf.click('Run', document.querySelector('#sidebar-panel-transform'))`)) === 'clicked', 'Run');
  await waitFor(`/preview:/i.test(document.querySelector('#sidebar-panel-transform').innerText)`, 'the preview');
  // Change the shown document elsewhere (one undo or redo step), which makes the preview stale.
  const viaUndo = await evaluate('__wf.canUndo()');
  expect(viaUndo || (await evaluate('__wf.canRedo()')), 'neither undo nor redo is available');
  await evaluate(`document.querySelectorAll('.history-actions button')[${viaUndo ? 0 : 1}].click(); true`);
  await waitFor(`/can no longer be applied/.test(document.querySelector('#sidebar-panel-transform').innerText)`, 'the stale message');
  const disabled = await evaluate(`__wf.button('Apply', document.querySelector('#sidebar-panel-transform'))?.disabled === true`);
  expect(disabled, 'Apply still enabled on a stale preview');
  await evaluate(`document.querySelectorAll('.history-actions button')[${viaUndo ? 1 : 0}].click(); true`);
  // Returning to the same content does not make the old preview current again (revision-bound).
  await delay(200);
  const stillStale = await evaluate(`/can no longer be applied/.test(document.querySelector('#sidebar-panel-transform').innerText)`);
  expect(stillStale, 'preview became applicable again after returning to the same content');
  return `stale after ${viaUndo ? 'undo' : 'redo'}: message shown, Apply disabled; still stale after returning`;
});

const writeTemp = (name, text) => {
  const file = join(outDir, name);
  writeFileSync(file, text);
  return file;
};

await step('fail/invalid-json-import', async () => {
  const before = (await evaluate('__wf.nodes()')).length;
  await evaluate(`__wf.tab('project'); true`);
  await setFile('.sgl-project-actions input[type="file"]', writeTemp('broken.json', '{ "schemaVersion": 2, "nodes": ['));
  const h = await waitFor(`document.querySelector('section.issues[role="alert"] h2')?.textContent`, 'the import error');
  expect(/broken\.json/.test(h) && /kept unchanged/.test(h), h);
  expect((await evaluate('__wf.nodes()')).length === before, 'design changed');
  await evaluate(`__wf.click('Dismiss', document.querySelector('section.issues[role="alert"]')); true`);
  return h;
});

await step('fail/unsupported-version-import', async () => {
  await setFile('.sgl-project-actions input[type="file"]', writeTemp('future.json', JSON.stringify({ schemaVersion: 3, metadata: { name: 'x' }, nodes: [], edges: [] })));
  const text = await waitFor(`document.querySelector('section.issues[role="alert"]')?.innerText`, 'the version error');
  expect(/future\.json/.test(text), text);
  await evaluate(`__wf.click('Dismiss', document.querySelector('section.issues[role="alert"]')); true`);
  return text.split('\n')[0];
});

await step('fail/unknown-type-import', async () => {
  const doc = {
    schemaVersion: 2,
    metadata: { name: 'Unknown type' },
    nodes: [
      { id: 1, grid: [0, 0, 0], size: [1, 1, 1], typeId: 'spaceship', attributes: {} },
      { id: 2, grid: [3, 0, 0], size: [1, 1, 1], typeId: 'gallery', attributes: {} },
    ],
    edges: [{ id: 1, source: 1, target: 2, kind: 'access', attributes: {} }],
    diagram: { positions: {} },
    settings: { styleBy: 'function', styles: {} },
  };
  const errorsBefore = consoleErrors.length;
  await evaluate(`__wf.tab('project'); true`);
  await setFile('.sgl-project-actions input[type="file"]', writeTemp('unknown-type.json', JSON.stringify(doc)));
  await waitFor(`__wf.nodes().length === 2`, 'the imported design');
  const bar = await evaluate(`document.querySelector('.project-bar')?.innerText ?? ''`);
  await evaluate(`__wf.panel2('architecture'); true`);
  await delay(600);
  await screenshot(`30-unknown-type-${vw}x${vh}`);
  expect(consoleErrors.length === errorsBefore, `console errors: ${consoleErrors.slice(errorsBefore).join(' | ')}`);
  return `loaded; project checks: "${bar.split('\n').find((l) => /check/i.test(l)) ?? bar.slice(0, 80)}"`;
});

// ── 3. coordination across the four views ────────────────────────────────────────────────────
await step('views/coordinated-selection', async () => {
  // A fresh example project: reload (Welcome shows at every startup) → Try example. (New project
  // opens a clean project directly since 2026-11-17, so it no longer leads back to Welcome.)
  await page.send('Page.navigate', { url });
  await waitFor(`!!document.querySelector('.sgl-welcome')`, 'the Welcome screen', 20000);
  await evaluate(`[...document.querySelectorAll('.sgl-welcome button')].find((b) => b.textContent.trim().startsWith('Try example'))?.click(); true`);
  await waitFor(`document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node').length > 0`, 'the design', 20000);
  await helpers();
  await waitFor(`__wf.nodes().length === 7`, 'the example');
  await selectNodeInGraph('6');
  const out = [];
  for (const mode of ['graph3d', 'voxels', 'architecture']) {
    await evaluate(`__wf.panel2('${mode}'); true`);
    await delay(500);
    const still = await evaluate(`__wf.field('position', 'x') !== null && /Room\\s+6/.test(__wf.props())`);
    expect(still, `selection lost when panel 2 shows ${mode}`);
    await screenshot(`40-selected-${mode}-${vw}x${vh}`);
    out.push(mode);
  }
  // An edit in Properties is reflected in the other views (Voxels hover info counts / Graph 2D label).
  // One Geometry edit: room 6 (the bedroom at [2, 0, 1]) moves along x to free cells.
  await evaluate(`__wf.setTriple('position', [4, 0, 1]); true`);
  await waitFor(`__wf.undoTitle().includes('Move room 6 to [4, 0, 1]')`, 'the move');
  await evaluate(`__wf.panel2('voxels'); true`);
  const info = await waitFor(`__wf.voxelInfo()`, 'voxel info');
  return `selection kept across ${out.join(', ')}; Voxels: ${info.split('\n').pop()}`;
});

await step('console/no-errors', async () => {
  expect(consoleErrors.length === 0, consoleErrors.join(' | '));
  return `no console errors; failed requests: ${failedRequests.length}`;
});

await screenshot(`99-final-${vw}x${vh}`);
const failed = results.filter((r) => r.status === 'FAIL').length;
writeFileSync(join(outDir, 'workflow.json'), JSON.stringify({ url, viewport: `${vw}x${vh}`, results, consoleErrors, failedRequests, dialogs }, null, 2));
console.log(`\n${results.length - failed} passed, ${failed} failed — ${outDir}`);
await browser.send('Browser.close', {}).catch(() => {});
process.exit(failed ? 1 : 0);
