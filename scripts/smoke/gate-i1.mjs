#!/usr/bin/env node
// Spatial Graph Lab — Integration Gate I1 mandatory scenario (see scripts/smoke/README.md).
//
// Drives the REAL integrated app (production preview or dev server) through the five items of the
// programme's Gate I1 scenario and records PASS/FAIL per check and per item:
//   1. Welcome → Create project → two scenarios → edit different rooms' geometry → switch → reload →
//      Recent → Export Project → Import: both scenarios, shared attribute schema, no mixed undo.
//   2. Add an edge in Graph 2D → Building and Plan reflect it; a spatially invalid edge stays until
//      explicitly removed (regression only: workstream D is not merged).
//   3. Enable a calculated value → Properties shows it read-only, colour-by uses it, a geometry change
//      refreshes it (and undo restores it).
//   4. Five views, layouts 1 | 2 | 4 and maximise at the given viewport without clipping.
//   5. Camera target and a saved view survive a scenario switch and a reload.
//
// Same safety rules as smoke.mjs: never starts/stops Node or Vite, never writes into the
// repository (output defaults to the OS temp dir), only closes the private browser it launched.
//
//   node scripts/smoke/gate-i1.mjs --url http://localhost:5291/ [--viewport 1280x720] [--out DIR]

import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findBrowser, launch } from './cdp.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = arg('url', 'http://localhost:5291/');
const [vw, vh] = arg('viewport', '1280x720').split('x').map(Number);
const outDir = resolve(arg('out', join(tmpdir(), 'spatial-graph-lab-gate-i1', new Date().toISOString().replace(/[:.]/g, '-'))));
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

const { page, browser, version, close } = await launch({ executable, headless: true });
console.log(`      ${version}; viewport ${vw}x${vh}; output ${outDir}\n`);

const consoleErrors = [];
const dialogs = [];
page.on('Runtime.exceptionThrown', (p) => consoleErrors.push(`exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`));
page.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') consoleErrors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
});
page.on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error' && !/favicon\.ico/.test(p.entry.url ?? '')) consoleErrors.push(`${p.entry.source}: ${p.entry.text} ${p.entry.url ?? ''}`);
});
page.on('Page.javascriptDialogOpening', (p) => {
  dialogs.push(`${p.type}: ${p.message}`);
  void page.send('Page.handleJavaScriptDialog', { accept: true });
});
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Log.enable');
await page.send('DOM.enable');
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
async function screenshot(name, clip) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', ...(clip && { clip: { ...clip, scale: 1 } }) });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return { file, data };
}
async function mouse(type, x, y, extra = {}) {
  await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
}
async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y, { buttons: 1 });
  await mouse('mouseReleased', x, y, { buttons: 0 });
  await delay(200);
}
async function dragAt(x, y, dx, dy, steps = 12) {
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y, { buttons: 1 });
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps, { buttons: 1 });
    await delay(16);
  }
  await mouse('mouseReleased', x + dx, y + dy, { buttons: 0 });
  await delay(400);
}
async function setFile(selector, path) {
  const { root } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`no element matches ${selector}`);
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}

/** Page-side helpers, installed after every load. */
const PAGE_HELPERS = `
window.__g = {
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
  tab(id) { const t = document.querySelector('#sidebar-tab-' + id); if (!t) return false; if (t.getAttribute('aria-selected') !== 'true' || document.querySelector('#sidebar-panel-' + id)?.hidden) t.click(); return true; },
  canUndo() { return !document.querySelector('.history-actions button').disabled; },
  undoTitle() { return document.querySelector('.history-actions button')?.getAttribute('aria-label') ?? ''; },
  undo() { document.querySelector('.history-actions button').click(); },
  nodes() { return [...document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node')].map((n) => n.getAttribute('data-id')); },
  edgeCount() { return document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__edge').length; },
  props() { return document.querySelector('#sidebar-panel-properties')?.innerText ?? ''; },
  field(prefix, axis) { return document.querySelector('input[aria-label="' + prefix + ' ' + axis + '"]') ?? document.querySelector('input[aria-label^="' + prefix + ' ' + axis + ' "]'); },
  triple(prefix) { return ['x','y','z'].map((a) => Number(this.field(prefix, a)?.value)); },
  setTriple(prefix, values) {
    ['x','y','z'].forEach((a, i) => this.setValue(this.field(prefix, a), values[i]));
    this.enter(this.field(prefix, 'z'));
  },
  panelMode(panel, mode) { const s = document.querySelector('select[aria-label="View shown in panel ' + panel + '"]'); if (!s) return null; if (mode && s.value !== mode) this.setValue(s, mode); return s.value; },
  scenario() { return document.querySelector('.sgl-identity-scenario')?.textContent ?? null; },
  scenarios() { return [...document.querySelectorAll('.sgl-scenario .sgl-scenario-name')].map((e) => e.textContent); },
  row(name) { return [...document.querySelectorAll('.sgl-scenario')].find((li) => li.querySelector('.sgl-scenario-name')?.textContent === name) ?? null; },
  saveState() { return document.querySelector('.sgl-save-status')?.getAttribute('data-save-state') ?? null; },
  pose(panel) { return document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"] canvas[data-camera-pose]')?.dataset.cameraPose ?? null; },
  legendCount(panel, id) {
    const p = document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"]');
    const el = p?.querySelector('[data-legend-item="' + id + '"] .sgl-pres-count');
    return el ? Number(el.textContent.replace(/[^0-9]/g, '')) : 0;
  },
  planEdgeIds(panel) {
    const p = document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"] svg[data-view-surface="plan"]');
    return p ? [...new Set([...p.querySelectorAll('.sgl-plan-openings [data-edge-id]')].map((e) => e.dataset.edgeId))] : null;
  },
  fieldKeys() { return [...document.querySelectorAll('#sidebar-panel-attributes .sgl-field-list input, #sidebar-panel-attributes .sgl-field-list code')].map((e) => e.value ?? e.textContent).join('|'); },
};
true`;
const helpers = () => evaluate(PAGE_HELPERS);
const NODE = (id) => `.view-panel[data-panel="0"] .react-flow__node[data-id="${id}"]`;
const nodeCenter = (id) =>
  evaluate(`(() => { const n = document.querySelector(${JSON.stringify(NODE(id))}); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);

async function selectNode(id) {
  const c = await nodeCenter(id);
  if (!c) throw new Error(`node ${id} not in Graph 2D`);
  await clickAt(c.x, c.y);
  await evaluate(`document.querySelector('.view-panel[data-panel="0"] .sgl-popover button[aria-label="Close details"]')?.click(); true`);
  await waitFor(`__g.field('Position (lowest corner)', 'x') !== null && new RegExp(${JSON.stringify(id)}).test(__g.props())`, `Properties of ${id}`);
}
async function moveRoom(id, grid) {
  await selectNode(id);
  await evaluate(`__g.setTriple('Position (lowest corner)', ${JSON.stringify(grid)}); true`);
  await waitFor(`__g.triple('Position (lowest corner)').join(',') === ${JSON.stringify(grid.join(','))} && /Move room/.test(__g.undoTitle())`, `${id} at ${grid}`);
}
async function positionOf(id) {
  await selectNode(id);
  return evaluate(`__g.triple('Position (lowest corner)')`);
}
async function openTab(id) {
  const ok = await evaluate(`__g.tab(${JSON.stringify(id)})`);
  if (!ok) throw new Error(`no #sidebar-tab-${id}`);
  await delay(250);
}
async function switchScenario(name) {
  await openTab('scenarios');
  const ok = await evaluate(`(() => { const b = __g.row(${JSON.stringify(name)})?.querySelector('.sgl-scenario-switch'); if (!b) return false; b.click(); return true; })()`);
  if (!ok) throw new Error(`no scenario row "${name}"`);
  await waitFor(`__g.scenario() === ${JSON.stringify(name)}`, `scenario "${name}" active`);
  await delay(500);
}
const waitSaved = () =>
  waitFor(
    `(() => { const s = __g.saveState(); if (s === 'blocked') throw new Error('save blocked: ' + document.querySelector('.sgl-save-status')?.title); return s === 'saved'; })()`,
    'the project to be saved in this browser',
    15000,
  );
async function panelRect(panel) {
  return evaluate(`(() => { const b = document.querySelector('.view-panel[data-panel="${panel - 1}"]')?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null; })()`);
}
async function canvasCenter(panel) {
  return waitFor(
    `(() => { const c = document.querySelector('.view-panel[data-panel="${panel - 1}"] canvas[data-camera-pose]'); if (!c) return null; const b = c.getBoundingClientRect(); return b.width > 50 ? { x: b.x + b.width * 0.42, y: b.y + b.height * 0.62 } : null; })()`,
    `a 3D canvas in panel ${panel}`,
    15000,
  );
}

// ── results ───────────────────────────────────────────────────────────────────────────────────
const results = [];
async function step(item, id, fn) {
  try {
    const message = await fn();
    results.push({ item, id, status: 'PASS', message });
    console.log(`PASS  [${item}] ${id}  ${message}`);
    return true;
  } catch (e) {
    const shot = await screenshot(`FAIL-${id.replace(/[^a-z0-9-]+/gi, '_')}`).catch(() => null);
    const message = `${e instanceof Error ? e.message : String(e)}${shot ? ` (screenshot ${shot.file})` : ''}`;
    results.push({ item, id, status: 'FAIL', message });
    console.log(`FAIL  [${item}] ${id}  ${message}`);
    return false;
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const PROJECT = `I1 Gate ${Date.now().toString(36)}`;
const st = {};

// ══ Item 1 (part 1): Welcome → Create → two scenarios → different edits ══════════════════════════
await step(1, 'welcome-create', async () => {
  await page.send('Page.navigate', { url });
  await waitFor(`!!document.querySelector('.sgl-welcome')`, 'the Welcome screen', 20000);
  const panels = await evaluate(`document.querySelectorAll('.view-panel').length`);
  expect(panels === 0, 'a project was opened automatically');
  await helpers();
  expect((await evaluate(`__g.click('Create project', document.querySelector('.sgl-welcome'))`)) === 'clicked', 'Create project');
  await waitFor(`!!document.querySelector('.sgl-welcome-create input[type="text"]')`, 'the Create form');
  await evaluate(`(() => { __g.setValue(document.querySelector('.sgl-welcome-create input[type="text"]'), ${JSON.stringify(PROJECT)});
    const s = document.querySelector('select[aria-label="Room types and algorithms from"]'); if (s) __g.setValue(s, 'example-gallery'); return true; })()`);
  await evaluate(`document.querySelector('.sgl-welcome-create').requestSubmit(); true`);
  await waitFor(`!document.querySelector('.sgl-welcome') && document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node').length === 6`, 'the created project', 20000);
  await helpers();
  await waitFor(`!document.querySelector('.project-bar[aria-busy="true"]')`, 'the code project to activate', 20000);
  const name = await evaluate(`document.querySelector('.sgl-identity-project')?.textContent ?? ''`);
  expect(name.includes(PROJECT), `header names "${name}"`);
  await screenshot('01-created');
  return `created "${PROJECT}" from example-gallery (6 rooms); Welcome had no auto-opened project`;
});

await step(1, 'two-scenarios-different-geometry', async () => {
  await openTab('scenarios');
  await waitFor(`document.querySelectorAll('.sgl-scenario').length === 1`, 'one scenario');
  expect((await evaluate(`__g.click('+ New scenario')`)) === 'clicked', '+ New scenario');
  await waitFor(`!!document.querySelector('.sgl-scenario-form')`, 'the new-scenario form');
  expect((await evaluate(`__g.click('Create scenario')`)) === 'clicked', 'Create scenario');
  await waitFor(`document.querySelectorAll('.sgl-scenario').length === 2`, 'two scenarios');
  st.names = await evaluate(`__g.scenarios()`);
  st.second = await evaluate(`__g.scenario()`);
  st.first = st.names.find((n) => n !== st.second);
  // Second (active) scenario: move the store one cell east.
  await moveRoom('store', [2, 1, 0]);
  await switchScenario(st.first);
  expect(!(await evaluate(`__g.canUndo()`)), `${st.first} offers Undo before any edit in it (histories mixed)`);
  const storeInFirst = await positionOf('store');
  expect(storeInFirst.join(',') === '1,1,0', `the store moved in ${st.first} too: ${storeInFirst}`);
  // First scenario: move a different room (the upper gallery).
  await moveRoom('gallery-upper', [1, 1, 1]);
  await switchScenario(st.second);
  const s = await positionOf('store');
  const g = await positionOf('gallery-upper');
  expect(s.join(',') === '2,1,0' && g.join(',') === '1,0,1', `${st.second}: store ${s}, gallery-upper ${g}`);
  const undo = await evaluate(`__g.undoTitle()`);
  expect(/store|04/i.test(undo) || /Move room/.test(undo), `${st.second} undo: ${undo}`);
  await screenshot('02-scenarios');
  return `${st.second}: store → [2,1,0]; ${st.first}: gallery-upper → [1,1,1]; each switch keeps its own geometry and undo ("${undo}")`;
});

await step(1, 'shared-attribute-schema', async () => {
  await openTab('attributes');
  await waitFor(`!!document.querySelector('form[aria-label="Add a node field"]')`, 'the Add a node field form');
  await evaluate(`(() => { const f = document.querySelector('form[aria-label="Add a node field"]'); __g.setValue(f.querySelector('input'), 'capacity'); return true; })()`);
  await evaluate(`(() => { const f = document.querySelector('form[aria-label="Add a node field"]'); f.requestSubmit(); return true; })()`);
  await waitFor(`/capacity/.test(document.querySelector('#sidebar-panel-attributes')?.innerText ?? '')`, 'the capacity field');
  await switchScenario(st.first);
  await openTab('attributes');
  const shared = await evaluate(`/capacity/.test(document.querySelector('#sidebar-panel-attributes')?.innerText ?? '')`);
  expect(shared, `capacity is not listed in ${st.first}`);
  expect(!(await evaluate(`/capacity|field/i.test(__g.undoTitle())`)), 'a schema edit landed in the design undo history');
  await switchScenario(st.second);
  return `node field "capacity" added once; listed in both scenarios; not a design undo step`;
});

// ══ Item 5 (part 1): camera target + saved view per scenario ══════════════════════════════════
await step(5, 'save-view-and-switch', async () => {
  expect((await evaluate(`__g.panelMode(2, 'architecture')`)) === 'architecture', 'panel 2 shows Building');
  const c = await canvasCenter(2);
  await openTab('camera');
  await waitFor(`!!document.querySelector('select[aria-label="Camera target viewport"]')`, 'the target chooser');
  await evaluate(`__g.setValue(document.querySelector('select[aria-label="Camera target viewport"]'), 'viewport-2'); true`);
  await waitFor(`document.querySelector('[data-camera-target]')?.getAttribute('data-camera-target') === 'ready'`, 'target ready');
  await dragAt(c.x, c.y, 120, 30);
  st.saved = await waitFor(`__g.pose(2)`, 'a camera pose');
  await evaluate(`(() => { __g.setValue(document.querySelector('input[aria-label="Name for the saved camera"]'), 'Gate view'); return true; })()`);
  expect((await evaluate(`__g.click('Save view', document.querySelector('#sidebar-panel-camera'))`)) === 'clicked', 'Save view');
  await waitFor(`document.querySelector('.sgl-camera-list')?.getAttribute('data-saved-cameras') === '1'`, 'one saved camera');
  // Other scenario: no saved camera there (per scenario); the target choice is kept.
  await switchScenario(st.first);
  await openTab('camera');
  const other = await evaluate(`document.querySelector('[data-saved-cameras]')?.getAttribute('data-saved-cameras')`);
  const target1 = await evaluate(`document.querySelector('select[aria-label="Camera target viewport"]')?.value`);
  expect(other === '0', `${st.first} lists ${other} saved cameras (should be per scenario)`);
  expect(target1 === 'viewport-2', `target after switch: ${target1}`);
  await switchScenario(st.second);
  await openTab('camera');
  await waitFor(`document.querySelector('.sgl-camera-list')?.getAttribute('data-saved-cameras') === '1'`, `"Gate view" back in ${st.second}`);
  const c2 = await canvasCenter(2);
  await dragAt(c2.x, c2.y, -160, 20);
  const moved = await evaluate(`__g.pose(2)`);
  expect(moved !== st.saved, 'orbit did not change the pose');
  expect((await evaluate(`__g.click('Recall', document.querySelector('.sgl-camera-list'))`)) === 'clicked', 'Recall');
  const recalled = await waitFor(`__g.pose(2) === ${JSON.stringify(st.saved)} && __g.pose(2)`, 'the recalled pose');
  await screenshot('05-camera');
  return `saved "Gate view" (${st.saved}); other scenario lists 0; target stays viewport-2 across switches; recall restored ${recalled}`;
});

// ══ Item 3: calculated value → Properties read-only + colour-by + refresh ═══════════════════════
await step(3, 'enable-calculated-value', async () => {
  await openTab('attributes');
  const row = `document.querySelector('#sidebar-panel-attributes [data-metric="exposed-facade-area"] input[type="checkbox"]')`;
  await waitFor(`!!${row}`, 'the Exposed façade area row in the catalogue');
  const before = await evaluate(`${row}.checked`);
  expect(!before, 'exposed-facade-area is already enabled by default (test needs an opt-in value)');
  await evaluate(`${row}.click(); true`);
  await waitFor(`${row}.checked`, 'the checkbox to stay ticked');
  const kinds = await evaluate(`[...document.querySelectorAll('#sidebar-panel-attributes .sgl-calculated-catalogue li')].map((li) => li.dataset.metric + '=' + li.querySelector('.sgl-calculated-kind')?.textContent).join('; ')`);
  expect(/has-exterior-facade=yes \/ no/.test(kinds), `value kinds: ${kinds}`);
  return `enabled "Exposed façade area"; catalogue kinds: ${kinds}`;
});

await step(3, 'properties-readonly-and-colour-by-and-refresh', async () => {
  const cell = `document.querySelector('#sidebar-panel-properties [data-attribute-kind="calculated"][data-metric="exposed-facade-area"] .sgl-field-value')`;
  await selectNode('store');
  const v1 = await waitFor(`${cell}?.textContent`, 'the calculated row in Properties');
  const inputs = await evaluate(`document.querySelectorAll('#sidebar-panel-properties [data-attribute-kind="calculated"] input, #sidebar-panel-properties [data-attribute-kind="calculated"] select, #sidebar-panel-properties [data-attribute-kind="calculated"] textarea').length`);
  expect(inputs === 0, 'a calculated row has inputs');
  const levelRows = await evaluate(`document.querySelectorAll('#sidebar-panel-properties [data-attribute="level"]').length`);
  expect(levelRows === 1, `Level shown ${levelRows} times in Properties`);
  // Colour by (Voxels in panel 2).
  await evaluate(`__g.panelMode(2, 'voxels'); true`);
  const sel = `[...document.querySelectorAll('.view-panel[data-panel="1"] select')].find((s) => [...s.options].some((o) => o.value === 'type'))`;
  await waitFor(`!!${sel}`, 'the Voxels colour-by select', 15000);
  const offered = await evaluate(`[...${sel}.options].map((o) => o.value).filter((v) => v.startsWith('metric:'))`);
  expect(offered.includes('metric:exposed-facade-area'), `colour-by offers ${offered}`);
  await evaluate(`__g.setValue(${sel}, 'metric:exposed-facade-area'); true`);
  const legend1 = await waitFor(`(() => { const t = document.querySelector('.view-panel[data-panel="1"] .viewer3d-legend-title')?.textContent ?? ''; return /façade area/i.test(t) && document.querySelector('.view-panel[data-panel="1"] .viewer3d-legend')?.textContent; })()`, 'the metric legend');
  await screenshot('03-colour-by-before');
  // Geometry change: back next to the reading gallery and the ground studio → fewer exterior walls.
  await moveRoom('store', [1, 1, 0]);
  const v2 = await waitFor(`(() => { const t = ${cell}?.textContent; return t && t !== ${JSON.stringify(v1)} ? t : null; })()`, 'a refreshed value');
  const legend2 = await evaluate(`document.querySelector('.view-panel[data-panel="1"] .viewer3d-legend')?.textContent`);
  expect(legend2 !== legend1, 'the colour-by legend did not change after the move');
  await screenshot('03-colour-by-after');
  await evaluate(`__g.undo(); true`);
  const v3 = await waitFor(`(() => { const t = ${cell}?.textContent; return t === ${JSON.stringify(v1)} ? t : null; })()`, 'the value after undo');
  await evaluate(`__g.panelMode(2, 'architecture'); true`);
  return `store: ${v1} → move → ${v2} → undo → ${v3}; read-only (0 inputs); Level once; colour-by legend "${legend1.slice(0, 80)}" → "${legend2.slice(0, 80)}"`;
});

// ══ Item 2: edge in Graph 2D → Building and Plan ═══════════════════════════════════════════════
await step(2, 'add-edge-in-graph2d', async () => {
  await switchScenario(st.first); // store at [1,1,0] here: touches the reading gallery, no edge.
  expect((await evaluate(`__g.panelMode(2, 'plan')`)) === 'plan', 'panel 2 shows Plan');
  await waitFor(`Array.isArray(__g.planEdgeIds(2))`, 'the Plan');
  st.planBefore = await evaluate(`__g.planEdgeIds(2)`);
  await evaluate(`__g.panelMode(2, 'architecture'); true`);
  await canvasCenter(2);
  await delay(800);
  st.directBefore = await evaluate(`__g.legendCount(2, 'status:direct')`);
  const edgesBefore = await evaluate(`__g.edgeCount()`);
  const rect = await panelRect(2);
  const shotA = await screenshot('02-building-before', rect);
  await selectNode('reading-gallery');
  expect((await evaluate(`__g.click('Add connection', document.querySelector('.view-panel[data-panel="0"]'))`)) === 'clicked', 'Graph 2D "Add connection…"');
  const target = await nodeCenter('store');
  await clickAt(target.x, target.y);
  await waitFor(`__g.edgeCount() === ${edgesBefore + 1}`, 'a new edge in Graph 2D');
  const undo = await evaluate(`__g.undoTitle()`);
  await delay(800);
  const directAfter = await evaluate(`__g.legendCount(2, 'status:direct')`);
  const shotB = await screenshot('02-building-after', rect);
  expect(directAfter === st.directBefore + 1, `Building legend direct ${st.directBefore} → ${directAfter}`);
  await evaluate(`__g.panelMode(2, 'plan'); true`);
  await waitFor(`Array.isArray(__g.planEdgeIds(2))`, 'the Plan');
  const planAfter = await evaluate(`__g.planEdgeIds(2)`);
  const added = planAfter.filter((e) => !st.planBefore.includes(e));
  expect(added.length === 1, `Plan openings with a new edge id: ${JSON.stringify(added)}`);
  st.newEdge = added[0];
  await screenshot('02-plan-after');
  // Plan click selects the same edge; Properties shows its building status.
  await evaluate(`document.querySelector('.view-panel[data-panel="1"] .sgl-plan-openings [data-edge-id="${st.newEdge}"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
  const status = await waitFor(`/In the building/.test(__g.props()) && __g.props().split('In the building')[1].slice(0, 120)`, 'the edge Properties');
  return `"${undo}"; Graph 2D edges ${edgesBefore} → ${edgesBefore + 1}; Building legend direct ${st.directBefore} → ${directAfter} (pixels ${shotA.data === shotB.data ? 'identical' : 'changed'}); Plan door for ${st.newEdge}; Properties: ${status.replace(/\s+/g, ' ').trim()}`;
});

await step(2, 'invalid-edge-kept-until-explicit-removal', async () => {
  await evaluate(`__g.panelMode(2, 'architecture'); true`);
  await canvasCenter(2);
  const edges = await evaluate(`__g.edgeCount()`);
  const unresolvedBefore = await evaluate(`__g.legendCount(2, 'status:unresolved')`);
  // Another storey, not touching: no direct contact and no straight route (unresolved, "different-level").
  await moveRoom('store', [4, 4, 1]);
  await delay(800);
  const edgesAfter = await evaluate(`__g.edgeCount()`);
  const unresolvedAfter = await evaluate(`__g.legendCount(2, 'status:unresolved')`);
  expect(edgesAfter === edges, `moving a room removed edges: ${edges} → ${edgesAfter}`);
  expect(unresolvedAfter > unresolvedBefore, `Building legend unresolved ${unresolvedBefore} → ${unresolvedAfter}`);
  await evaluate(`__g.panelMode(2, 'plan'); true`);
  await waitFor(`Array.isArray(__g.planEdgeIds(2))`, 'the Plan');
  const plan = await evaluate(`__g.planEdgeIds(2)`);
  expect(!plan.includes(st.newEdge), 'the Plan still draws a door for an unresolved edge');
  const removeOffer = await evaluate(`!!__g.button('Remove invalid', document.querySelector('.view-panel[data-panel="0"]'))`);
  await screenshot('02-unresolved');
  await evaluate(`__g.undo(); true`);
  await waitFor(`__g.planEdgeIds(2)?.includes(${JSON.stringify(st.newEdge)})`, 'the door again after undo');
  await evaluate(`__g.panelMode(2, 'architecture'); true`);
  return `edge kept (${edgesAfter} edges), unresolved ${unresolvedBefore} → ${unresolvedAfter}, no Plan door; undo restored the door${removeOffer ? '; "Remove invalid…" offered' : ''}`;
});

// ══ Reload → Recent: items 1, 3 and 5 survive ═════════════════════════════════════════════════
await step(1, 'reload-recent-restore', async () => {
  await waitSaved();
  await page.send('Page.navigate', { url });
  const rows = await waitFor(
    `(() => { const w = document.querySelector('.sgl-welcome'); if (!w) return null; const r = [...w.querySelectorAll('.sgl-recent .sgl-recent-name')].map((e) => e.textContent); return r.length ? r : null; })()`,
    'Welcome with Recent',
    20000,
  );
  expect((await evaluate(`document.querySelectorAll('.view-panel').length`)) === 0, 'a project reopened automatically');
  await helpers();
  const opened = await evaluate(`(() => { const b = [...document.querySelectorAll('.sgl-recent-open')].find((e) => e.querySelector('.sgl-recent-name')?.textContent === ${JSON.stringify(PROJECT)}); if (!b) return false; b.click(); return true; })()`);
  expect(opened, `"${PROJECT}" not in Recent: ${JSON.stringify(rows)}`);
  await waitFor(`!document.querySelector('.sgl-welcome') && document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node').length === 6`, 'the restored project', 20000);
  await helpers();
  await waitFor(`!document.querySelector('.project-bar[aria-busy="true"]')`, 'the code project to activate', 20000);
  await screenshot('06-restored');
  await openTab('scenarios');
  const names = await evaluate(`__g.scenarios()`);
  expect(names.join('|') === st.names.join('|'), `scenarios ${names}`);
  expect(!(await evaluate(`__g.canUndo()`)), 'a restored project offers Undo');
  const active = await evaluate(`__g.scenario()`);
  await switchScenario(st.second);
  const s = await positionOf('store');
  const e2 = await evaluate(`__g.edgeCount()`);
  expect(!(await evaluate(`__g.canUndo()`)), `Undo offered in ${st.second} after restore`);
  await switchScenario(st.first);
  const g = await positionOf('gallery-upper');
  const e1 = await evaluate(`__g.edgeCount()`);
  expect(s.join(',') === '2,1,0' && g.join(',') === '1,1,1', `restored geometry: store ${s} (${st.second}), gallery-upper ${g} (${st.first})`);
  expect(e1 === e2 + 1, `restored edges: ${st.first} ${e1}, ${st.second} ${e2}`);
  await openTab('attributes');
  const capacity = await evaluate(`/capacity/.test(document.querySelector('#sidebar-panel-attributes')?.innerText ?? '')`);
  expect(capacity, 'the shared capacity field was not restored');
  return `Welcome after reload (no auto-resume); Recent restored "${PROJECT}" (active ${active}); geometry, the new edge and the capacity field restored; history fresh`;
});

await step(3, 'calculated-field-persisted', async () => {
  await openTab('attributes');
  const on = await evaluate(`document.querySelector('#sidebar-panel-attributes [data-metric="exposed-facade-area"] input[type="checkbox"]')?.checked`);
  expect(on === true, 'the enabled calculated value was not restored');
  await selectNode('store');
  const v = await waitFor(`document.querySelector('#sidebar-panel-properties [data-attribute-kind="calculated"][data-metric="exposed-facade-area"] .sgl-field-value')?.textContent`, 'the calculated row after reload');
  return `still enabled after reload; store shows ${v}`;
});

await step(5, 'camera-after-reload', async () => {
  await switchScenario(st.second);
  expect((await evaluate(`__g.panelMode(2, 'architecture')`)) === 'architecture', 'panel 2 shows Building');
  const c = await canvasCenter(2);
  await openTab('camera');
  const target = await evaluate(`document.querySelector('select[aria-label="Camera target viewport"]')?.value`);
  expect(target === 'viewport-2', `target after reload: ${target}`);
  await waitFor(`document.querySelector('.sgl-camera-list')?.getAttribute('data-saved-cameras') === '1'`, '"Gate view" after reload');
  const name = await evaluate(`document.querySelector('.sgl-camera-list .sgl-camera-name')?.innerText ?? ''`);
  await waitFor(`document.querySelector('[data-camera-target]')?.getAttribute('data-camera-target') === 'ready'`, 'target ready');
  await dragAt(c.x, c.y, 90, -20);
  expect((await evaluate(`__g.click('Recall', document.querySelector('.sgl-camera-list'))`)) === 'clicked', 'Recall');
  await waitFor(`__g.pose(2) === ${JSON.stringify(st.saved)}`, 'the saved pose after reload');
  await screenshot('06-camera-after-reload');
  return `target viewport-2 remembered; "${name.split('\n')[0]}" restored with the project and recalled to the exact saved pose`;
});

// ══ Item 1 (part 2): Export Project → Import ═══════════════════════════════════════════════════
await step(1, 'export-import-project', async () => {
  await openTab('project');
  const existing = new Set(readdirSync(downloadDir));
  await openTab('project');
  expect((await evaluate(`__g.click('Export project')`)) === 'clicked', 'Export project');
  let name = null;
  for (const end = Date.now() + 10000; name === null && Date.now() < end; ) {
    name = readdirSync(downloadDir).find((x) => !existing.has(x) && x.endsWith('.project.json')) ?? null;
    if (name === null) await delay(150);
  }
  expect(name, 'no .project.json downloaded');
  await delay(300);
  const path = join(downloadDir, `gate-${name}`);
  renameSync(join(downloadDir, name), path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const byName = Object.fromEntries(json.scenarios.map((s) => [s.name, s]));
  const fields = JSON.stringify(json.attributes ?? null);
  expect(json.scenarios.length === 2, `${json.scenarios.length} scenarios exported`);
  expect(/capacity/.test(fields), 'the capacity field is not in the exported attribute record');
  expect((json.settings.calculatedFields ?? []).includes('exposed-facade-area'), `settings.calculatedFields: ${JSON.stringify(json.settings.calculatedFields)}`);
  expect(byName[st.second].cameras.length === 1 && byName[st.first].cameras.length === 0, 'saved cameras are not per scenario in the file');
  expect(!/exposed-facade-area":\s*[0-9]/.test(JSON.stringify(json.scenarios)), 'a metric VALUE was exported');
  await openTab('project');
  await setFile('.sgl-project-actions input[type="file"]', path);
  const notice = await waitFor(`document.querySelector('.sgl-notice')?.textContent ?? null`, 'the "separate copy" notice', 15000);
  await helpers();
  await openTab('scenarios');
  await waitFor(`document.querySelectorAll('.sgl-scenario').length === 2`, 'two scenarios in the imported project');
  expect(!(await evaluate(`__g.canUndo()`)), 'the imported project offers Undo');
  await switchScenario(st.second);
  const s = await positionOf('store');
  expect(!(await evaluate(`__g.canUndo()`)), `Undo offered in ${st.second} of the imported project`);
  await switchScenario(st.first);
  const g = await positionOf('gallery-upper');
  expect(s.join(',') === '2,1,0' && g.join(',') === '1,1,1', `imported geometry: store ${s}, gallery-upper ${g}`);
  await openTab('attributes');
  const capacity = await evaluate(`/capacity/.test(document.querySelector('#sidebar-panel-attributes')?.innerText ?? '')`);
  expect(capacity, 'the imported project lost the shared capacity field');
  // One edit in one scenario does not appear in the other's undo.
  await moveRoom('gallery-upper', [1, 0, 1]);
  await switchScenario(st.second);
  expect(!(await evaluate(`__g.canUndo()`)), `an edit in ${st.first} is undoable from ${st.second} (mixed undo)`);
  await waitSaved();
  return `exported ${name} (2 scenarios, capacity, calculatedFields, cameras per scenario, no metric values); re-imported as a copy ("${notice.trim().slice(0, 80)}"); both scenarios, schema and histories separate`;
});

// ══ Item 4: five views, 1 | 2 | 4, maximise ════════════════════════════════════════════════════
async function layoutCheck(label) {
  const r = await evaluate(`(() => {
    const d = document.documentElement, b = document.body;
    const overflow = Math.max(d.scrollWidth, b.scrollWidth) > d.clientWidth + 1 || Math.max(d.scrollHeight, b.scrollHeight) > d.clientHeight + 1;
    const ws = document.querySelector('.workspace .panels')?.getBoundingClientRect();
    const problems = [];
    const notes = [];
    const panels = [...document.querySelectorAll('.view-panel')].filter((p) => !p.hidden && p.offsetParent !== null);
    for (const p of panels) {
      const pr = p.getBoundingClientRect();
      const tag = 'panel ' + (Number(p.dataset.panel) + 1) + ' (' + p.dataset.view + ')';
      if (ws && (pr.left < ws.left - 1 || pr.right > ws.right + 1 || pr.top < ws.top - 1 || pr.bottom > ws.bottom + 1)) problems.push(tag + ' outside the workspace');
      const surface = p.querySelector('.react-flow, canvas, svg[data-view-surface]');
      const sr = surface?.getBoundingClientRect();
      if (!sr || sr.width < 60 || sr.height < 60) problems.push(tag + ' has no visible view surface');
      for (const el of p.querySelectorAll('.panel-header select, .panel-header button')) {
        const e = el.getBoundingClientRect();
        if (e.width === 0 || e.right > pr.right + 1 || e.left < pr.left - 1 || e.bottom > pr.bottom + 1) problems.push(tag + ' header control clipped: ' + (el.getAttribute('aria-label') || el.textContent.trim()));
      }
      const toggle = p.querySelector('.viewer3d-projection');
      if (toggle) {
        const t = toggle.getBoundingClientRect();
        if (t.right > pr.right + 1 || t.bottom > pr.bottom + 1) problems.push(tag + ' projection toggle clipped');
        // The toggle sits BELOW the overlay layer by design (E): it must never cover an overlay panel.
        for (const o of p.querySelectorAll('.viewer3d-panel, .room-edit')) {
          const q = o.getBoundingClientRect();
          if (!q.width || !(t.left < q.right && t.right > q.left && t.top < q.bottom && t.bottom > q.top)) continue;
          const cx = (Math.max(t.left, q.left) + Math.min(t.right, q.right)) / 2, cy = (Math.max(t.top, q.top) + Math.min(t.bottom, q.bottom)) / 2;
          const top = document.elementFromPoint(cx, cy);
          if (top && toggle.contains(top)) problems.push(tag + ' projection toggle covers an overlay panel');
          else notes.push(tag + ' toggle under an overlay' + (toggle.closest('.viewer3d-nav')?.classList.contains('passive') ? ' (passive: room gizmo shown)' : ''));
        }
      }
    }
    const layoutSel = [...document.querySelectorAll('[role="group"][aria-label="Viewport layout"]')].filter((g) => g.offsetParent !== null).length;
    if (layoutSel !== 1) problems.push('visible layout selectors: ' + layoutSel);
    return { overflow, problems, notes, panels: panels.map((p) => p.dataset.view) };
  })()`);
  const shot = await screenshot(`04-${label}`);
  expect(!r.overflow, `${label}: the page scrolls`);
  expect(r.problems.length === 0, `${label}: ${r.problems.join('; ')}`);
  return `${label}: ${r.panels.join('+')}${r.notes.length ? ` [${r.notes.join('; ')}]` : ''}`;
}
async function setLayout(n) {
  const ok = await evaluate(`(() => { const g = [...document.querySelectorAll('[role="group"][aria-label="Viewport layout"]')].find((x) => x.offsetParent !== null); const b = g && [...g.querySelectorAll('button')].find((x) => x.textContent.trim() === '${n}'); if (!b) return false; b.click(); return true; })()`);
  expect(ok, `layout ${n} button`);
  await waitFor(`document.querySelectorAll('.view-panel').length >= ${n}`, `layout ${n}`);
  await delay(1200);
}

await step(4, 'five-views-layouts-maximise', async () => {
  const out = [];
  // Dismiss the import notice so the standard layout is measured.
  await evaluate(`document.querySelector('.sgl-notice button')?.click(); true`);
  await delay(300);
  await setLayout(4);
  for (const [p, m] of [[1, 'graph2d'], [2, 'architecture'], [3, 'voxels'], [4, 'plan']]) await evaluate(`__g.panelMode(${p}, '${m}'); true`);
  await delay(2500);
  out.push(await layoutCheck('layout4-graph2d-building-voxels-plan'));
  await evaluate(`__g.panelMode(3, 'graph3d'); true`);
  await delay(2000);
  out.push(await layoutCheck('layout4-graph2d-building-graph3d-plan'));
  // With a room selected (the room gizmo / editor shown) at 4 viewports. Selected from the Plan
  // (panel 4): in a quarter-size Graph 2D the node may sit under its legend.
  await evaluate(`document.querySelector('.view-panel[data-panel="3"] [data-node-id="store"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
  await waitFor(`/store/.test(__g.props()) && __g.field('Position (lowest corner)', 'x') !== null`, 'store selected from the Plan');
  await delay(1000);
  out.push(await layoutCheck('layout4-room-selected'));
  for (let i = 1; i <= 4; i++) {
    const ok = await evaluate(`(() => { const b = document.querySelector('.view-panel[data-panel="${i - 1}"] .viewport-maximise'); if (!b) return false; b.click(); return true; })()`);
    expect(ok, `maximise button of panel ${i}`);
    await delay(1200);
    const visible = await evaluate(`[...document.querySelectorAll('.view-panel')].filter((p) => !p.hidden).map((p) => p.dataset.panel)`);
    expect(visible.length === 1 && visible[0] === String(i - 1), `maximised panel ${i}: visible ${visible}`);
    out.push(await layoutCheck(`maximised-${i}`));
    await evaluate(`document.querySelector('.view-panel[data-panel="${i - 1}"] .viewport-maximise').click(); true`);
    await delay(800);
  }
  await setLayout(1);
  out.push(await layoutCheck('layout1'));
  await setLayout(2);
  out.push(await layoutCheck('layout2'));
  const modes = await evaluate(`[...document.querySelectorAll('select[aria-label="View shown in panel 1"] option')].map((o) => o.value)`);
  expect(modes.join(',') === 'graph2d,graph3d,voxels,architecture,plan', `view modes on offer: ${modes}`);
  return `${modes.length} view modes; ${out.join(' | ')}`;
});

await step('-', 'console/no-errors', async () => {
  expect(consoleErrors.length === 0, consoleErrors.join(' | '));
  return 'no uncaught exceptions or console errors';
});

// ── summary ───────────────────────────────────────────────────────────────────────────────────
const items = [1, 2, 3, 4, 5].map((item) => {
  const rs = results.filter((r) => r.item === item);
  return { item, status: rs.length && rs.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL', checks: rs.length };
});
console.log('');
for (const i of items) console.log(`ITEM ${i.item}: ${i.status} (${i.checks} checks)`);
const failed = results.filter((r) => r.status === 'FAIL').length;
writeFileSync(join(outDir, 'gate-i1.json'), JSON.stringify({ url, viewport: `${vw}x${vh}`, project: PROJECT, items, results, consoleErrors, dialogs }, null, 2));
console.log(`\n${results.length - failed} passed, ${failed} failed — ${outDir}`);
await close();
process.exit(failed ? 1 : 0);
