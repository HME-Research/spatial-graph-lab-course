#!/usr/bin/env node
// Spatial Graph Lab — Gate 1 end-to-end workflow check (integration). See scripts/smoke/README.md.
//
// Drives the REAL app (dev or production preview) through the complete workshop workflow on real
// schema-v2 data with the real resolver: add node, connect, move/resize, corridor generation,
// connector style, Designer façade/roof, an algorithm, undo/redo, export/re-import; plus failure
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
  field(prefix, axis) { return document.querySelector('input[aria-label="' + prefix + ' ' + axis + '"]') ?? document.querySelector('input[aria-label^="' + prefix + ' ' + axis + ' "]'); },
  triple(prefix) { return ['x','y','z'].map((a) => Number(this.field(prefix, a)?.value)); },
  setTriple(prefix, values) {
    ['x','y','z'].forEach((a, i) => this.setValue(this.field(prefix, a), values[i]));
    this.enter(this.field(prefix, 'z'));
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
  await evaluate(`document.querySelector('.react-flow__pane')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await evaluate(`__wf.tab('properties'); true`);
  await waitFor(`__wf.field('Position (lowest corner)', 'x') !== null`, `Properties of ${id}`);
}
let downloads = 0;
async function download() {
  const before = new Set(readdirSync(downloadDir));
  if ((await evaluate(`__wf.click('Export JSON')`)) !== 'clicked') throw new Error('Export JSON not clickable');
  for (const end = Date.now() + 8000; Date.now() < end; ) {
    const name = readdirSync(downloadDir).find((x) => !before.has(x) && x.endsWith('.json'));
    if (name) {
      await delay(200);
      // Rename, so a later export with the same name is detected as a new file.
      const file = join(downloadDir, `export-${++downloads}-${name}`);
      renameSync(join(downloadDir, name), file);
      return { file, json: JSON.parse(readFileSync(file, 'utf8')) };
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
    await waitFor(`document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node').length > 0`, 'the design', 20000);
    await helpers();
    const bar = await evaluate(`document.querySelector('.project-bar')?.innerText ?? ''`);
    expect(/Example gallery/.test(bar), `project bar: ${bar.slice(0, 120)}`);
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
  expect(/Add room 07/.test(label), `undo label ${label}`);
  return `added ${newId}; ${label}`;
});

await step('workflow/move-via-properties', async () => {
  await selectNodeInGraph(newId);
  await evaluate(`__wf.setTriple('Position (lowest corner)', [5, 0, 0]); true`);
  await waitFor(`/Move room .* to \\[5, 0, 0\\]/.test(__wf.undoTitle())`, 'the move to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  return `${newId} at ${JSON.stringify(await evaluate(`__wf.triple('Position (lowest corner)')`))}; ${undoLabels.at(-1)}`;
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
  const style = await evaluate(`document.querySelector('select[aria-label="Corridor style"]')?.value ?? null`);
  expect(style === 'enclosed', `default style ${style}`);
  await evaluate(`__wf.panel2('voxels'); true`);
  const info = await waitFor(`/connector cells/.test(__wf.voxelInfo()) && __wf.voxelInfo()`, 'connector cells in Voxels');
  expect(/3 connector cells/.test(info), `voxels: ${info}`);
  await screenshot(`10-corridor-voxels-${vw}x${vh}`);
  await evaluate(`__wf.panel2('architecture'); true`);
  await delay(600);
  await screenshot(`11-corridor-building-enclosed-${vw}x${vh}`);
  return `routed, default enclosed; Voxels "${info.split('\n').pop()}"`;
});

await step('workflow/change-connector-style', async () => {
  await evaluate(`__wf.setValue(document.querySelector('select[aria-label="Corridor style"]'), 'covered'); true`);
  await waitFor(`/connector style/.test(__wf.undoTitle())`, 'the style change to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  await delay(600);
  await screenshot(`12-corridor-building-covered-${vw}x${vh}`);
  await evaluate(`__wf.setValue(document.querySelector('select[aria-label="Corridor style"]'), 'deck'); true`);
  await waitFor(`document.querySelector('select[aria-label="Corridor style"]').value === 'deck'`, 'deck');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  await delay(600);
  await screenshot(`13-corridor-building-deck-${vw}x${vh}`);
  return 'enclosed → covered → deck, one undo step each';
});

await step('workflow/resize-via-properties', async () => {
  await selectNodeInGraph(newId);
  await evaluate(`__wf.setTriple('Size (cells)', [2, 1, 1]); true`);
  await waitFor(`/Resize room .* to 2×1×1/.test(__wf.undoTitle())`, 'the resize to be recorded');
  undoLabels.push(await evaluate('__wf.undoTitle()'));
  return undoLabels.at(-1);
});

await step('workflow/gizmo-step-buttons-voxels', async () => {
  await evaluate(`__wf.panel2('voxels'); true`);
  await waitFor(`document.querySelector('.room-edit') !== null`, 'the room edit panel in Voxels');
  // Move +y one cell with the gizmo's keyboard alternative (one gesture = one command).
  const before = await evaluate(`__wf.triple('Position (lowest corner)')`);
  const ok = await evaluate(`(() => { const p = document.querySelector('.room-edit'); const btn = [...p.querySelectorAll('button')].find((b) => /y/.test(b.getAttribute('aria-label') ?? '') && /\\+|more|increase|plus/i.test((b.getAttribute('aria-label') ?? '') + b.textContent)); if (!btn) return [...p.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') + '|' + b.textContent).join(';'); btn.click(); return 'ok'; })()`);
  expect(ok === 'ok', `no +y step button: ${ok}`);
  await waitFor(`__wf.triple('Position (lowest corner)')[1] === ${before[1] + 1}`, 'the gizmo move');
  const label = await evaluate('__wf.undoTitle()');
  expect(/Move room/.test(label), label);
  // Undo it: exactly one step returns the room.
  await evaluate(`document.querySelector('.history-actions button').click(); true`);
  await waitFor(`__wf.triple('Position (lowest corner)')[1] === ${before[1]}`, 'undo of the gizmo move');
  return `+y moved ${JSON.stringify(before)} → y+1 in one step; undo restored`;
});

await step('workflow/orbit-keeps-selection', async () => {
  const rect = await evaluate(`(() => { const c = document.querySelector('.view-panel[data-panel="1"] canvas'); const b = c.getBoundingClientRect(); return { x: b.x + 30, y: b.y + b.height - 60 }; })()`);
  await dragAt(rect.x, rect.y, 80, -20);
  const text = await evaluate('__wf.props()');
  expect(new RegExp(`Room`).test(text) && (await evaluate(`__wf.field('Position (lowest corner)', 'x') !== null`)), 'selection lost after orbit');
  return 'orbit drag on empty canvas kept the selected room';
});

await step('workflow/designer-windows-and-roof', async () => {
  await evaluate(`__wf.tab('designer'); true`);
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
  await evaluate(`__wf.tab('algorithms'); true`);
  edgesBeforeAlgorithm = await evaluate('__wf.edges()');
  const picked = await evaluate(`(() => { const b = [...document.querySelectorAll('.algorithm-item')].find((x) => /storage|store/i.test(x.textContent)); if (!b) return false; b.click(); return true; })()`);
  expect(picked, 'connect-storage-to-galleries in the list');
  expect((await evaluate(`__wf.click('Run', document.querySelector('#sidebar-panel-algorithms'))`)) === 'clicked', 'Run');
  await waitFor(`/preview:/i.test(document.querySelector('#sidebar-panel-algorithms').innerText)`, 'the preview');
  expect((await evaluate(`__wf.click('Apply', document.querySelector('#sidebar-panel-algorithms'))`)) === 'clicked', 'Apply');
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
  expect((await evaluate('__wf.nodes()')).length === 6, 'baseline should have 6 rooms');
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
  const corridor = d.edges.find((e) => (e.source === newId || e.target === newId) && e.connectorStyle);
  expect(corridor?.connectorStyle === 'deck', `connector edge ${JSON.stringify(corridor)}`);
  const ta = d.settings?.typeAppearance ?? {};
  expect(Object.values(ta).some((a) => a.windowFraction === 0.6) && Object.values(ta).some((a) => a.roof === 'none'), `typeAppearance ${JSON.stringify(ta)}`);
  return `${exported.file}: v2, ${d.nodes.length} rooms, ${d.edges.length} relationships, typeAppearance ${JSON.stringify(ta)}`;
});

await step('workflow/reimport-roundtrip', async () => {
  await setFile('.toolbar input[type="file"]', exported.file);
  await waitFor(`!__wf.canUndo()`, 'the re-imported design (fresh history)');
  const nodes = await evaluate('__wf.nodes()');
  expect(nodes.length === exported.json.nodes.length, `rooms ${nodes.length}`);
  const modified = await evaluate(`/unsaved|modified|not exported/i.test(document.querySelector('.project-bar')?.innerText ?? '')`);
  expect(!modified, 'design marked modified right after import');
  const again = await download();
  expect(readFileSync(again.file, 'utf8') === readFileSync(exported.file, 'utf8'), 're-export differs from the imported file');
  return `re-imported ${nodes.length} rooms; re-export is byte-identical; dialogs accepted: ${dialogs.length}`;
});

// ── 2. failure cases ─────────────────────────────────────────────────────────────────────────
await step('fail/room-collision-rejected', async () => {
  await selectNodeInGraph(newId);
  const before = await evaluate('__wf.undoTitle()');
  const pos = await evaluate(`__wf.triple('Position (lowest corner)')`);
  await evaluate(`__wf.setTriple('Position (lowest corner)', [1, 1, 0]); true`);
  const msg = await waitFor(`(/overlaps/i.test(__wf.props()) && __wf.props().match(/[^\\n]*overlaps[^\\n]*/i)[0])`, 'an overlap message');
  expect((await evaluate('__wf.undoTitle()')) === before, 'a history entry was recorded for a rejected move');
  await delay(200);
  const after = await evaluate(`__wf.triple('Position (lowest corner)')`);
  return `"${msg}"; no history entry; stored position ${JSON.stringify(pos)} (field shows ${JSON.stringify(after)})`;
});

await step('fail/corridor-displacement-cancel-and-confirm', async () => {
  await selectNodeInGraph('gallery-upper');
  const before = await evaluate('__wf.undoTitle()');
  await evaluate(`__wf.setTriple('Position (lowest corner)', [3, 0, 0]); true`);
  await waitFor(`__wf.button('Move anyway and recalculate') !== null`, 'the corridor confirmation');
  await screenshot(`20-displacement-confirm-${vw}x${vh}`);
  expect((await evaluate(`__wf.click('Cancel', document.querySelector('#sidebar-panel-properties'))`)) === 'clicked', 'Cancel');
  await delay(200);
  expect((await evaluate('__wf.undoTitle()')) === before, 'Cancel changed the document');
  await evaluate(`__wf.setTriple('Position (lowest corner)', [3, 0, 0]); true`);
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
  await evaluate(`__wf.tab('algorithms'); true`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.algorithm-item')].find((x) => /daylight/i.test(x.textContent)); b?.click(); return true; })()`);
  expect((await evaluate(`__wf.click('Run', document.querySelector('#sidebar-panel-algorithms'))`)) === 'clicked', 'Run');
  await waitFor(`/preview:/i.test(document.querySelector('#sidebar-panel-algorithms').innerText)`, 'the preview');
  // Change the shown document elsewhere (one undo or redo step), which makes the preview stale.
  const viaUndo = await evaluate('__wf.canUndo()');
  expect(viaUndo || (await evaluate('__wf.canRedo()')), 'neither undo nor redo is available');
  await evaluate(`document.querySelectorAll('.history-actions button')[${viaUndo ? 0 : 1}].click(); true`);
  await waitFor(`/can no longer be applied/.test(document.querySelector('#sidebar-panel-algorithms').innerText)`, 'the stale message');
  const disabled = await evaluate(`__wf.button('Apply', document.querySelector('#sidebar-panel-algorithms'))?.disabled === true`);
  expect(disabled, 'Apply still enabled on a stale preview');
  await evaluate(`document.querySelectorAll('.history-actions button')[${viaUndo ? 1 : 0}].click(); true`);
  // Returning to the same content does not make the old preview current again (revision-bound).
  await delay(200);
  const stillStale = await evaluate(`/can no longer be applied/.test(document.querySelector('#sidebar-panel-algorithms').innerText)`);
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
  await setFile('.toolbar input[type="file"]', writeTemp('broken.json', '{ "schemaVersion": 2, "nodes": ['));
  const h = await waitFor(`document.querySelector('section.issues h2')?.textContent`, 'the import error');
  expect(/broken\.json/.test(h) && /kept unchanged/.test(h), h);
  expect((await evaluate('__wf.nodes()')).length === before, 'design changed');
  await evaluate(`__wf.click('Dismiss', document.querySelector('section.issues')); true`);
  return h;
});

await step('fail/unsupported-version-import', async () => {
  await setFile('.toolbar input[type="file"]', writeTemp('future.json', JSON.stringify({ schemaVersion: 3, metadata: { name: 'x' }, nodes: [], edges: [] })));
  const text = await waitFor(`document.querySelector('section.issues')?.innerText`, 'the version error');
  expect(/future\.json/.test(text), text);
  await evaluate(`__wf.click('Dismiss', document.querySelector('section.issues')); true`);
  return text.split('\n')[0];
});

await step('fail/unknown-type-import', async () => {
  const doc = {
    schemaVersion: 2,
    metadata: { name: 'Unknown type' },
    nodes: [
      { id: 'a', grid: [0, 0, 0], size: [1, 1, 1], typeId: 'spaceship', attributes: {} },
      { id: 'b', grid: [3, 0, 0], size: [1, 1, 1], typeId: 'gallery', attributes: {} },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', kind: 'access', attributes: {} }],
    diagram: { positions: {} },
    settings: { typeAppearance: {} },
  };
  const errorsBefore = consoleErrors.length;
  await setFile('.toolbar input[type="file"]', writeTemp('unknown-type.json', JSON.stringify(doc)));
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
  await evaluate(`__wf.click('Load example'); true`);
  await waitFor(`__wf.nodes().length === 6`, 'the example');
  await selectNodeInGraph('store');
  const out = [];
  for (const mode of ['graph3d', 'voxels', 'architecture']) {
    await evaluate(`__wf.panel2('${mode}'); true`);
    await delay(500);
    const still = await evaluate(`__wf.field('Position (lowest corner)', 'x') !== null && /storage/.test(__wf.props())`);
    expect(still, `selection lost when panel 2 shows ${mode}`);
    await screenshot(`40-selected-${mode}-${vw}x${vh}`);
    out.push(mode);
  }
  // An edit in Properties is reflected in the other views (Voxels hover info counts / Graph 2D label).
  await evaluate(`__wf.setTriple('Position (lowest corner)', [3, 1, 0]); true`);
  await waitFor(`/Move room .* to \\[3, 1, 0\\]/.test(__wf.undoTitle())`, 'the move');
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
