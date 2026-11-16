#!/usr/bin/env node
// Spatial Graph Lab — wave 2 D: wall ↔ graph interactions and "Remove invalid connections".
//
// Drives the REAL app (production preview or dev server) with real pointer input (CDP
// Input.dispatchMouseEvent) through:
//   building-add-access   Building: hover/click the shared wall reading gallery | store → Add relationship
//                         → Access → the edge is in Graph 2D, the door is on THAT wall in the Building
//                         (wall panel + status legend) and in the Plan (opening on the same face id);
//                         one Undo removes it everywhere.
//   plan-add-access       The same from the Plan: click the wall line → Add → Access → Plan door on that
//                         face, the Building's wall panel reports the door on this wall; one Undo.
//   no-duplicate          Clicking the wall of an already related pair offers change / remove, never Add.
//   remove-invalid        Make three relationships unresolved, open Graph 2D "Remove invalid connections",
//                         uncheck one, confirm: only the checked ones are removed (Graph 2D, Building,
//                         Graph 3D, Voxels legends and the Plan note agree); ONE Undo restores both.
//
// Same safety rules as smoke.mjs: never starts/stops Node or Vite, never writes into the repository
// (output defaults to the OS temp dir), only closes the private browser it launched.
//
//   node scripts/smoke/walls.mjs --url http://localhost:5306/ [--viewport 1280x720] [--out DIR]

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findBrowser, launch } from './cdp.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = arg('url', 'http://localhost:5306/');
const [vw, vh] = arg('viewport', '1280x720').split('x').map(Number);
const outDir = resolve(arg('out', join(tmpdir(), 'spatial-graph-lab-walls', new Date().toISOString().replace(/[:.]/g, '-'))));
mkdirSync(outDir, { recursive: true });
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

const { page, version, close } = await launch({ executable, headless: true });
console.log(`      ${version}; viewport ${vw}x${vh}; output ${outDir}\n`);

const consoleErrors = [];
page.on('Runtime.exceptionThrown', (p) => consoleErrors.push(`exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`));
page.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') consoleErrors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
});
page.on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error' && !/favicon\.ico/.test(p.entry.url ?? '')) consoleErrors.push(`${p.entry.source}: ${p.entry.text} ${p.entry.url ?? ''}`);
});
page.on('Page.javascriptDialogOpening', () => void page.send('Page.handleJavaScriptDialog', { accept: true }));
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Log.enable');
await page.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });

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
async function moveTo(x, y) {
  await mouse('mouseMoved', x, y, { button: 'none' });
}
async function clickAt(x, y) {
  await moveTo(x, y);
  await mouse('mousePressed', x, y, { buttons: 1 });
  await mouse('mouseReleased', x, y, { buttons: 0 });
  await delay(250);
}
async function dragAt(x, y, dx, dy, steps = 16) {
  await moveTo(x, y);
  await mouse('mousePressed', x, y, { buttons: 1 });
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps, { buttons: 1 });
    await delay(16);
  }
  await mouse('mouseReleased', x + dx, y + dy, { buttons: 0 });
  await delay(400);
}
/** Real pointer click on the centre of the element `finder` (a page expression) returns. */
async function clickElement(finder, what) {
  const c = await waitFor(
    `(() => { const el = (${finder}); if (!el || el.disabled) return null; el.scrollIntoView?.({ block: 'nearest' }); const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`,
    what,
  );
  await clickAt(c.x, c.y);
}
const P = (n) => `document.querySelector('.view-panel[data-panel="${n - 1}"]')`;
const buttonIn = (scope, text) => `[...(${scope})?.querySelectorAll('button') ?? []].find((b) => b.offsetParent !== null && b.textContent.trim().startsWith(${JSON.stringify(text)}))`;

const PAGE_HELPERS = `
window.__w = {
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
  undoButton() { return document.querySelector('.history-actions button'); },
  canUndo() { return !this.undoButton().disabled; },
  undoTitle() { return this.undoButton()?.getAttribute('aria-label') ?? ''; },
  edgeIds() { return [...document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__edge')].map((e) => e.getAttribute('data-id')).filter(Boolean).sort(); },
  props() { return document.querySelector('#sidebar-panel-properties')?.innerText ?? ''; },
  field(prefix, axis) { return document.querySelector('input[aria-label="' + prefix + ' ' + axis + '"]') ?? document.querySelector('input[aria-label^="' + prefix + ' ' + axis + ' "]'); },
  triple(prefix) { return ['x','y','z'].map((a) => Number(this.field(prefix, a)?.value)); },
  setTriple(prefix, values) {
    ['x','y','z'].forEach((a, i) => this.setValue(this.field(prefix, a), values[i]));
    this.enter(this.field(prefix, 'z'));
  },
  panelMode(panel, mode) { const s = document.querySelector('select[aria-label="View shown in panel ' + panel + '"]'); if (!s) return null; if (mode && s.value !== mode) this.setValue(s, mode); return s.value; },
  legendCount(panel, id) {
    const p = document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"]');
    const el = p?.querySelector('[data-legend-item="' + id + '"] .sgl-pres-count');
    return el ? Number(el.textContent.replace(/[^0-9]/g, '')) : 0;
  },
  planOpenings(panel) {
    const p = document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"] svg[data-view-surface="plan"]');
    return p ? [...p.querySelectorAll('.sgl-plan-openings [data-edge-id]')].map((e) => ({ edge: e.dataset.edgeId, face: e.dataset.faceId, cls: e.getAttribute('class') })) : null;
  },
  wallPanel(panel) {
    const el = document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"] .sgl-wall-panel');
    return el ? { face: el.dataset.wallFace, state: el.dataset.wallState, edge: el.dataset.wallEdge ?? null, opening: el.dataset.wallOpening ?? null, text: el.innerText } : null;
  },
  pose(panel) { return document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"] canvas[data-camera-pose]')?.dataset.cameraPose ?? null; },
  canvasRect(panel) { const c = document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"] canvas[data-camera-pose]'); if (!c) return null; const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; },
  wallHover(panel) { return document.querySelector('.view-panel[data-panel="' + (panel - 1) + '"] [data-wall-hover]')?.dataset.wallHover ?? null; },
};
true`;
const helpers = () => evaluate(PAGE_HELPERS);

const NODE = (id) => `.view-panel[data-panel="0"] .react-flow__node[data-id="${id}"]`;
async function selectNode(id) {
  await clickElement(`document.querySelector(${JSON.stringify(NODE(id))})`, `node ${id} in Graph 2D`);
  await evaluate(`document.querySelector('.view-panel[data-panel="0"] .sgl-popover button[aria-label="Close details"]')?.click(); true`);
  await waitFor(`__w.field('Position (lowest corner)', 'x') !== null && new RegExp(${JSON.stringify(id)}).test(__w.props())`, `Properties of ${id}`);
}
async function moveRoom(id, grid) {
  await selectNode(id);
  await evaluate(`__w.setTriple('Position (lowest corner)', ${JSON.stringify(grid)}); true`);
  await waitFor(`__w.triple('Position (lowest corner)').join(',') === ${JSON.stringify(grid.join(','))} && /Move room/.test(__w.undoTitle())`, `${id} at ${grid}`);
}
async function undo() {
  await clickElement(`__w.undoButton()`, 'the Undo button');
}
async function setMode(panel, mode) {
  expect((await evaluate(`__w.panelMode(${panel}, '${mode}')`)) === mode, `panel ${panel} shows ${mode}`);
  if (mode === 'plan') await waitFor(`Array.isArray(__w.planOpenings(${panel}))`, 'the Plan');
  else if (mode !== 'graph2d') await waitFor(`!!__w.pose(${panel}) && (__w.canvasRect(${panel})?.width ?? 0) > 50`, `a 3D canvas in panel ${panel}`, 20000);
  await delay(600);
}

/** Screen point of a world point in panel `panel`'s camera (pose from data-camera-pose; Y up). */
function project(pose, rect, q) {
  const [projection, ps, ts, extra] = pose.split('|');
  const p = ps.split(',').map(Number);
  const t = ts.split(',').map(Number);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(...a);
    return a.map((v) => v / l);
  };
  const f = norm(sub(t, p));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(q, p);
  const aspect = rect.width / rect.height;
  let nx;
  let ny;
  if (projection === 'orthographic') {
    const h = Number(extra) / 2;
    nx = dot(d, r) / (h * aspect);
    ny = dot(d, u) / h;
  } else {
    const k = Math.tan(((Number(extra) * Math.PI) / 180) / 2);
    const z = dot(d, f);
    nx = dot(d, r) / (z * k * aspect);
    ny = dot(d, u) / (z * k);
  }
  return { x: rect.x + ((nx + 1) / 2) * rect.width, y: rect.y + ((1 - ny) / 2) * rect.height };
}

/**
 * Hover (real mouse moves) around the projections of points on the wall until the Building reports
 * that wall under the pointer (`data-wall-hover`), then return that screen point.
 * Grid: face between grid x 0 | 1 at grid y 1 → Three.js x = 1.5, z = -3; the wall spans z -4.5…-1.5.
 */
async function findWall(panel, faceId, worldX, worldZ) {
  const pose = await evaluate(`__w.pose(${panel})`);
  const rect = await evaluate(`__w.canvasRect(${panel})`);
  const tried = [];
  for (const y of [2.6, 2.2, 2.85, 1.8, 1.2]) {
    for (const dz of [0, -0.6, 0.6, -1.1, 1.1]) {
      const c = project(pose, rect, [worldX, y, worldZ + dz]);
      for (const [ox, oy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
        const x = c.x + ox;
        const yy = c.y + oy;
        if (x < rect.x + 2 || x > rect.x + rect.width - 2 || yy < rect.y + 2 || yy > rect.y + rect.height - 2) continue;
        await moveTo(x, yy);
        await delay(40);
        const hit = await evaluate(`__w.wallHover(${panel})`);
        tried.push(hit);
        if (hit === faceId) return { x, y: yy };
      }
    }
  }
  throw new Error(`no pointer position over ${faceId} (hover results: ${[...new Set(tried)].join(', ') || 'none'})`);
}

// ── results ───────────────────────────────────────────────────────────────────────────────────
const results = [];
async function step(id, fn) {
  try {
    const message = await fn();
    results.push({ id, status: 'PASS', message });
    console.log(`PASS  ${id}  ${message}`);
    return true;
  } catch (e) {
    const shot = await screenshot(`FAIL-${id.replace(/[^a-z0-9-]+/gi, '_')}`).catch(() => null);
    const message = `${e instanceof Error ? e.message : String(e)}${shot ? ` (screenshot ${shot.file})` : ''}`;
    results.push({ id, status: 'FAIL', message });
    console.log(`FAIL  ${id}  ${message}`);
    return false;
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const WALL = 'reading-gallery:+x';
const panelRect = (n) => evaluate(`(() => { const b = ${P(n)}?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null; })()`);

await step('open-example', async () => {
  await page.send('Page.navigate', { url });
  await waitFor(`!!document.querySelector('.sgl-welcome')`, 'the Welcome screen', 20000);
  await evaluate(`[...document.querySelectorAll('.sgl-welcome button')].find((b) => b.textContent.trim().startsWith('Try Example'))?.click(); true`);
  await waitFor(`document.querySelectorAll('.view-panel[data-panel="0"] .react-flow__node').length === 6`, 'the example', 20000);
  await helpers();
  await waitFor(`!document.querySelector('.project-bar[aria-busy="true"]')`, 'the code project to activate', 20000);
  await evaluate(`document.querySelector('.sgl-notice button')?.click(); true`);
  await setMode(2, 'architecture');
  // Roofs off (a view cutaway) so the interior wall can be seen from above.
  const roofs = `[...${P(2)}.querySelectorAll('label')].find((l) => /Roofs/.test(l.textContent))?.querySelector('input')`;
  if (await evaluate(`${roofs}?.checked`)) await clickElement(roofs, 'the Roofs checkbox');
  await waitFor(`${roofs}?.checked === false`, 'roofs hidden');
  await delay(800);
  // The fitted camera looks from the front, where the upper storey hides the back rooms' shared
  // wall: orbit (real drag) to look from behind and higher up.
  const r = await evaluate(`__w.canvasRect(2)`);
  const poseBefore = await evaluate(`__w.pose(2)`);
  await dragAt(r.x + r.width * 0.3, r.y + r.height * 0.5, Math.round(r.height * 0.45), Math.round(r.height * 0.12));
  await waitFor(`__w.pose(2) !== ${JSON.stringify(poseBefore)}`, 'the orbit');
  await delay(500);
  const edges = await evaluate(`__w.edgeIds()`);
  expect(edges.length === 6, `example edges: ${edges}`);
  return `example open; Building roofs hidden; ${edges.length} edges`;
});

const st = {};
await step('building-add-access', async () => {
  st.edgesBefore = await evaluate(`__w.edgeIds()`);
  st.directBefore = await evaluate(`__w.legendCount(2, 'status:direct')`);
  const rect = await panelRect(2);
  const before = await screenshot('01-building-before', rect);
  const at = await findWall(2, WALL, 1.5, -3);
  const hoverHint = await evaluate(`${P(2)}.querySelector('[data-wall-hover]')?.textContent ?? ''`);
  expect(/Wall between/.test(hoverHint), `hover hint: ${hoverHint}`);
  await screenshot('02-building-hover', rect);
  await clickAt(at.x, at.y);
  const panel = await waitFor(`(() => { const p = __w.wallPanel(2); return p && p.face === ${JSON.stringify(WALL)} ? p : null; })()`, 'the wall panel');
  expect(panel.state === 'add', `wall panel state ${panel.state}: ${panel.text}`);
  expect(/Add relationship/.test(panel.text), `no Add relationship: ${panel.text}`);
  await clickElement(buttonIn(`${P(2)}.querySelector('.sgl-wall-panel')`, 'Add relationship'), 'Add relationship…');
  await clickElement(buttonIn(`${P(2)}.querySelector('.sgl-wall-panel')`, 'Access'), 'Access');
  const after = await waitFor(`(() => { const p = __w.wallPanel(2); return p && p.state === 'existing' ? p : null; })()`, 'the panel to show the new relationship');
  expect(after.opening === 'here', `door not on the clicked wall: ${after.opening} (${after.text})`);
  st.edge = after.edge;
  const edges = await evaluate(`__w.edgeIds()`);
  const added = edges.filter((e) => !st.edgesBefore.includes(e));
  expect(added.length === 1 && added[0] === st.edge, `Graph 2D new edges ${JSON.stringify(added)} (panel edge ${st.edge})`);
  const undoTitle = await evaluate(`__w.undoTitle()`);
  await delay(600);
  const directAfter = await evaluate(`__w.legendCount(2, 'status:direct')`);
  expect(directAfter === st.directBefore + 1, `Building legend direct ${st.directBefore} → ${directAfter}`);
  expect(/Access|door/i.test(await evaluate(`__w.props()`)), 'Properties does not show the new relationship');
  // Close the panel so the screenshot shows the door.
  await clickElement(`${P(2)}.querySelector('.sgl-wall-close')`, 'close the wall panel');
  await delay(500);
  const shot = await screenshot('03-building-door', rect);
  expect(shot.data !== before.data, 'the Building pixels did not change');
  // Plan: the door is on the same face id.
  await setMode(2, 'plan');
  const openings = await evaluate(`__w.planOpenings(2)`);
  const door = openings.filter((o) => o.edge === st.edge);
  expect(door.length === 1 && door[0].face === WALL && /door/.test(door[0].cls), `Plan openings of ${st.edge}: ${JSON.stringify(door)}`);
  await screenshot('04-plan-door', await panelRect(2));
  // ONE undo removes it everywhere.
  await undo();
  await waitFor(`__w.edgeIds().length === ${st.edgesBefore.length}`, 'the edge removed by one Undo');
  const planAfterUndo = await evaluate(`__w.planOpenings(2)`);
  expect(!planAfterUndo.some((o) => o.edge === st.edge), 'the Plan door survived Undo');
  await setMode(2, 'architecture');
  const directUndo = await evaluate(`__w.legendCount(2, 'status:direct')`);
  expect(directUndo === st.directBefore, `Building legend direct after undo ${directUndo}`);
  return `"${undoTitle}"; ${st.edge}: Graph 2D +1 edge, Building direct ${st.directBefore} → ${directAfter} (pixels changed), panel "door on this wall", Plan door on ${WALL}; one Undo removed it from every view`;
});

await step('plan-add-access', async () => {
  await setMode(2, 'plan');
  const line = `${P(2)}.querySelector('.sgl-plan-wall-target[data-face-id="${WALL}"]')`;
  const c = await waitFor(`(() => { const b = ${line}?.getBoundingClientRect(); return b && b.width + b.height > 4 ? { x: b.x + b.width / 2, y: b.y + b.height * 0.25 } : null; })()`, 'the wall line in the Plan');
  await moveTo(c.x, c.y);
  await delay(150);
  expect(await evaluate(`${line}.classList.contains('hovered')`), 'the wall is not highlighted on hover');
  await clickAt(c.x, c.y);
  const panel = await waitFor(`(() => { const p = __w.wallPanel(2); return p && p.face === ${JSON.stringify(WALL)} ? p : null; })()`, 'the wall panel in the Plan');
  expect(panel.state === 'add', `Plan wall panel state ${panel.state}`);
  expect(await evaluate(`${line}.classList.contains('active')`), 'the open wall is not highlighted');
  await clickElement(buttonIn(`${P(2)}.querySelector('.sgl-wall-panel')`, 'Add relationship'), 'Add relationship…');
  await clickElement(buttonIn(`${P(2)}.querySelector('.sgl-wall-panel')`, 'Access'), 'Access');
  const after = await waitFor(`(() => { const p = __w.wallPanel(2); return p && p.state === 'existing' ? p : null; })()`, 'the new relationship in the Plan panel');
  expect(after.opening === 'here', `Plan panel: door ${after.opening}`);
  const door = (await evaluate(`__w.planOpenings(2)`)).filter((o) => o.edge === after.edge);
  expect(door.length === 1 && door[0].face === WALL, `Plan door: ${JSON.stringify(door)}`);
  expect((await evaluate(`__w.edgeIds()`)).includes(after.edge), 'Graph 2D lacks the edge');
  expect(after.edge === st.edge, `edge id not stable across add/undo/add: ${st.edge} then ${after.edge}`);
  await screenshot('05-plan-added', await panelRect(2));
  // The Building puts the door on the same wall: its wall panel there says so.
  await setMode(2, 'architecture');
  const at = await findWall(2, WALL, 1.5, -3);
  await clickAt(at.x, at.y);
  const b = await waitFor(`(() => { const p = __w.wallPanel(2); return p && p.face === ${JSON.stringify(WALL)} ? p : null; })()`, 'the Building wall panel');
  expect(b.state === 'existing' && b.edge === after.edge && b.opening === 'here', `Building panel: ${JSON.stringify(b)}`);
  // No duplicate: a related wall offers change/remove only.
  expect(!/Add relationship/.test(b.text) && /Change to Open/.test(b.text) && /Remove relationship/.test(b.text), `related wall offers: ${b.text}`);
  await screenshot('06-building-existing', await panelRect(2));
  await undo();
  await waitFor(`__w.edgeIds().length === ${st.edgesBefore.length}`, 'one Undo');
  const p2 = await waitFor(`(() => { const p = __w.wallPanel(2); return p && p.state === 'add' ? p : null; })()`, 'the panel to offer Add again after Undo');
  await clickElement(`${P(2)}.querySelector('.sgl-wall-close')`, 'close the wall panel');
  return `${after.edge} added from the Plan on ${WALL}; Building panel "door on this wall"; related wall offers change/remove only; one Undo → panel offers ${p2.state} again`;
});

await step('remove-invalid', async () => {
  // Three unresolved relationships: the store on another storey, the upper gallery away from both studios.
  await moveRoom('store', [4, 4, 1]);
  await moveRoom('gallery-upper', [6, 6, 0]);
  await evaluate(`document.querySelector('.view-panel[data-panel="0"]')?.click(); true`);
  const edges = await evaluate(`__w.edgeIds()`);
  const button = buttonIn(P(1), 'Remove invalid connections');
  const label = await waitFor(`${button}?.textContent`, 'the Remove invalid connections button');
  expect(/\(3\)/.test(label), `button: ${label}`);
  const unresolved = {};
  for (const mode of ['architecture', 'graph3d', 'voxels']) {
    await setMode(2, mode);
    unresolved[mode] = await evaluate(`__w.legendCount(2, 'status:unresolved')`);
  }
  await clickElement(button, 'Remove invalid connections');
  const dialog = `${P(1)}.querySelector('.sgl-invalid-dialog')`;
  const rows = await waitFor(`(() => { const d = ${dialog}; return d ? [...d.querySelectorAll('label[data-edge-id]')].map((l) => ({ id: l.dataset.edgeId, checked: l.querySelector('input').checked, text: l.innerText })) : null; })()`, 'the review list');
  expect(rows.length === 3 && rows.every((r) => r.checked), `rows ${JSON.stringify(rows)}`);
  expect(rows.every((r) => !r.text.includes(r.id) || /↔/.test(r.text)), 'rows show raw ids instead of names');
  const preview = await evaluate(`[...${P(1)}.querySelectorAll('[data-remove-preview]')].map((e) => e.dataset.removePreview).sort()`);
  expect(preview.length === 3, `preview marks ${preview}`);
  const keep = rows[0].id;
  await clickElement(`${dialog}.querySelector('label[data-edge-id="${keep}"] input')`, `uncheck ${keep}`);
  await waitFor(`!${dialog}.querySelector('label[data-edge-id="${keep}"] input').checked`, 'the row unchecked');
  const preview2 = await evaluate(`[...${P(1)}.querySelectorAll('[data-remove-preview]')].map((e) => e.dataset.removePreview).sort()`);
  expect(preview2.length === 2 && !preview2.includes(keep), `preview after uncheck ${preview2}`);
  await screenshot('07-remove-invalid-review');
  await clickElement(buttonIn(dialog, 'Remove 2 selected'), 'Remove 2 selected');
  await waitFor(`__w.edgeIds().length === ${edges.length - 2}`, 'two edges removed');
  const left = await evaluate(`__w.edgeIds()`);
  const removed = rows.map((r) => r.id).filter((id) => id !== keep);
  expect(left.includes(keep) && removed.every((id) => !left.includes(id)), `left ${left}`);
  const undoTitle = await evaluate(`__w.undoTitle()`);
  expect(/Remove 2 invalid connections/.test(undoTitle), `undo label ${undoTitle}`);
  const afterCounts = {};
  for (const mode of ['architecture', 'graph3d', 'voxels']) {
    await setMode(2, mode);
    afterCounts[mode] = await evaluate(`__w.legendCount(2, 'status:unresolved')`);
    expect(afterCounts[mode] === unresolved[mode] - 2, `${mode} unresolved ${unresolved[mode]} → ${afterCounts[mode]}`);
  }
  await setMode(2, 'plan');
  const note = await evaluate(`${P(2)}.querySelector('.sgl-plan-note')?.textContent ?? ''`);
  await screenshot('08-removed');
  // ONE undo restores both.
  await undo();
  await waitFor(`__w.edgeIds().length === ${edges.length}`, 'both edges back after one Undo');
  expect(JSON.stringify(await evaluate(`__w.edgeIds()`)) === JSON.stringify(edges), 'edge ids differ after Undo');
  await setMode(2, 'architecture');
  const restored = await evaluate(`__w.legendCount(2, 'status:unresolved')`);
  expect(restored === unresolved.architecture, `Building unresolved after undo ${restored}`);
  const label2 = await evaluate(`${buttonIn(P(1), 'Remove invalid connections')}?.textContent`);
  expect(/\(3\)/.test(label2 ?? ''), `button after undo: ${label2}`);
  return `3 unresolved (Building/Graph 3D/Voxels ${Object.values(unresolved).join('/')}); kept ${keep}, removed ${removed.join(', ')} → ${Object.values(afterCounts).join('/')}; "${undoTitle}"; Plan note "${note.trim()}"; one Undo restored ${edges.length} edges`;
});

await step('no-invalid-explained', async () => {
  // Undo the two moves: nothing is unresolved any more; the canvas menu explains it.
  await undo();
  await undo();
  await waitFor(`!${buttonIn(P(1), 'Remove invalid connections')}`, 'the contextual button to disappear');
  const pane = await evaluate(`(() => { const b = ${P(1)}.querySelector('.react-flow__pane').getBoundingClientRect(); return { x: b.x + b.width - 30, y: b.y + b.height * 0.45 }; })()`);
  await moveTo(pane.x, pane.y);
  await mouse('mousePressed', pane.x, pane.y, { button: 'right', buttons: 2 });
  await mouse('mouseReleased', pane.x, pane.y, { button: 'right', buttons: 0 });
  await clickElement(`[...${P(1)}.querySelectorAll('.sgl-menu button')].find((b) => b.textContent.startsWith('Remove invalid connections'))`, 'the menu item');
  const text = await waitFor(`${P(1)}.querySelector('.sgl-status')?.textContent`, 'the explanation');
  expect(/no invalid connections/.test(text), `notice: ${text}`);
  return `no button without unresolved relationships; menu explains: "${text.replace(/\s+/g, ' ').replace(/×$/, '').trim()}"`;
});

await step('graph2d-legend-4-viewports', async () => {
  const ok = await evaluate(`(() => { const g = [...document.querySelectorAll('[role="group"][aria-label="Viewport layout"]')].find((x) => x.offsetParent !== null); const b = g && [...g.querySelectorAll('button')].find((x) => x.textContent.trim() === '4'); if (!b) return false; b.click(); return true; })()`);
  expect(ok, 'layout 4 button');
  await waitFor(`document.querySelectorAll('.view-panel').length >= 4`, 'layout 4');
  await evaluate(`${P(1)}.querySelector('.sgl-status button[aria-label="Dismiss"]')?.click(); true`);
  await delay(1500);
  const m = await evaluate(`(() => {
    const p = ${P(1)};
    const legend = p.querySelector('.sgl-legend');
    const details = legend?.querySelector('details');
    const lb = legend?.getBoundingClientRect();
    const covered = [...p.querySelectorAll('.react-flow__node')].filter((n) => { const b = n.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2; return lb && x >= lb.x && x <= lb.right && y >= lb.y && y <= lb.bottom; }).map((n) => n.dataset.id);
    const pb = p.getBoundingClientRect();
    return { open: details?.open ?? null, legend: lb ? [Math.round(lb.width), Math.round(lb.height)] : null, panel: [Math.round(pb.width), Math.round(pb.height)], covered };
  })()`);
  await screenshot('09-layout4');
  expect(m.open === false, `legend open in a ${m.panel.join('×')} panel`);
  expect(m.covered.length === 0, `nodes under the legend: ${m.covered}`);
  // The student can still open it.
  await clickElement(`${P(1)}.querySelector('.sgl-legend summary')`, 'the legend toggle');
  const opened = await waitFor(`${P(1)}.querySelector('.sgl-legend details')?.open`, 'the legend to open');
  return `panel ${m.panel.join('×')}: legend folded (${m.legend.join('×')} px), no node under it; opens on click (${opened})`;
});

await step('console/no-errors', async () => {
  expect(consoleErrors.length === 0, consoleErrors.join(' | '));
  return 'no uncaught exceptions or console errors';
});

const failed = results.filter((r) => r.status === 'FAIL').length;
writeFileSync(join(outDir, 'walls.json'), JSON.stringify({ url, viewport: `${vw}x${vh}`, results, consoleErrors }, null, 2));
console.log(`\n${results.length - failed} passed, ${failed} failed — ${outDir}`);
await close();
process.exit(failed ? 1 : 0);
