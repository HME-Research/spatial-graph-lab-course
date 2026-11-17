#!/usr/bin/env node
// Spatial Graph Lab browser smoke test (Stage 07). See scripts/smoke/README.md.
// Runs against an ALREADY RUNNING dev or preview server; never starts/stops Node or Vite, never
// writes into the repository (screenshots and report go to --out, default under the OS temp dir).

import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser, launch } from './cdp.mjs';
import {
  FEATURES,
  formatMarkdown,
  formatTable,
  isIgnorableConsoleError,
  overflowProblem,
  parseArgs,
  rectChanges,
  roundRect,
  summarize,
  timestamp,
  USAGE,
  VIEWPORTS,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const EXAMPLE_DESIGN = join(repoRoot, 'app', 'document', 'examples', 'two-storey-example.json');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const { opts, errors } = parseArgs(process.argv.slice(2), process.env);
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}
if (errors.length) {
  console.error(errors.map((e) => `error: ${e}`).join('\n'));
  console.error('\nRun with --help for usage.');
  process.exit(2);
}

const outDir = resolve(opts.out ?? join(tmpdir(), 'spatial-graph-lab-smoke', timestamp()));
mkdirSync(outDir, { recursive: true });
const downloadDir = join(outDir, 'downloads');
mkdirSync(downloadDir, { recursive: true });

const results = [];
const record = (id, status, message, data) => {
  results.push({ id, status, message, ...(data !== undefined && { data }) });
  console.log(`${status.padEnd(4)}  ${id}  ${message}`);
};
const wants = (group) => !opts.only || opts.only.has(group);

// ── Preconditions ─────────────────────────────────────────────────────────────────────────────
async function serverReachable() {
  try {
    const res = await fetch(opts.url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return `HTTP ${res.status}`;
    const html = await res.text();
    return html.includes('id="root"') ? null : 'the page has no #root element (is this the Spatial Graph Lab server?)';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const serverProblem = await serverReachable();
if (serverProblem) {
  console.error(`error: cannot reach ${opts.url}: ${serverProblem}`);
  console.error('Start the app first, in its own terminal, e.g.:  npm run dev -- --port 5180 --strictPort');
  process.exit(2);
}
const executable = findBrowser(opts.browser);
if (!executable) {
  console.error(`error: no Edge/Chromium found${opts.browser ? ` at ${opts.browser}` : ''}. Pass --browser <path>.`);
  console.error('Manual checklist: scripts/smoke/README.md');
  process.exit(2);
}

const started = new Date().toISOString();
let session;
try {
  session = await launch({ executable, headless: opts.headless, log: (m) => console.log(`      ${m}`) });
} catch (e) {
  console.error(`error: could not start the browser: ${e instanceof Error ? e.message : e}`);
  process.exit(2);
}
const { page, browser } = session;
console.log(`      ${session.version}; output: ${outDir}\n`);

// ── Page helpers ──────────────────────────────────────────────────────────────────────────────
const consoleErrors = [];
const dialogs = [];
page.on('Runtime.exceptionThrown', (p) => consoleErrors.push(`exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`));
page.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') consoleErrors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
});
page.on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error') consoleErrors.push(`${p.entry.source}: ${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ''}`);
});
page.on('Page.javascriptDialogOpening', (p) => {
  dialogs.push(`${p.type}: ${p.message}`);
  void page.send('Page.handleJavaScriptDialog', { accept: true });
});

await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Log.enable');
await page.send('DOM.enable');

async function evaluate(expression) {
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(expression, what, timeout = opts.timeout) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await evaluate(expression);
    if (last) return last;
    await delay(100);
  }
  throw new Error(`timed out after ${timeout} ms waiting for ${what}`);
}

async function setViewport({ width, height }) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await delay(500);
}

async function screenshot(name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

const RECTS_JS = `(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
  return {
    toolbar: r('.toolbar'), projectBar: r('.project-bar'), workspace: r('.workspace'),
    panel1: r('.view-panel[data-panel="0"]'), panel2: r('.view-panel[data-panel="1"]'),
    sidebar: r('.sidebar, .sgl-sidenav'), sidebarBody: r('.sidebar-body:not([hidden]), .sgl-sidenav-panel:not([hidden])'),
  };
})()`;
const rects = () => evaluate(RECTS_JS);
const roundAll = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, roundRect(v)]));

const OVERFLOW_JS = `(() => { const d = document.documentElement, b = document.body;
  return { scrollWidth: Math.max(d.scrollWidth, b.scrollWidth), scrollHeight: Math.max(d.scrollHeight, b.scrollHeight),
           clientWidth: d.clientWidth, clientHeight: d.clientHeight, scrollX: window.scrollX, scrollY: window.scrollY }; })()`;

async function mouse(type, x, y, extra = {}) {
  await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
}

async function clickAt(x, y) {
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y, { buttons: 1 });
  await mouse('mouseReleased', x, y, { buttons: 0 });
}

async function drag(x, y, dx, dy, steps = 8) {
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y, { buttons: 1 });
  for (let i = 1; i <= steps; i++) {
    await mouse('mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps, { buttons: 1 });
    await delay(16);
  }
  await mouse('mouseReleased', x + dx, y + dy, { buttons: 0 });
  await delay(300);
}

/** A real key press. Keys that type a character (Enter = "\r") need `text` to activate buttons. */
async function key(keyName, code, keyCode, modifiers = 0) {
  const text = keyName === 'Enter' ? '\r' : keyName.length === 1 ? keyName : undefined;
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers, ...(text && { text, unmodifiedText: text }) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers });
}

/** Clicks the first button whose trimmed text starts with `text` (via the DOM; for plain buttons). */
const clickButton = (text, scope = 'document') =>
  evaluate(`(() => { const b = [...${scope}.querySelectorAll('button')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}));
    if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);

const NODE_SEL = '.view-panel[data-panel="0"] .react-flow__node';
const nodeCenter = (index = 0) =>
  evaluate(`(() => { const n = document.querySelectorAll(${JSON.stringify(NODE_SEL)})[${index}]; if (!n) return null;
    const b = n.getBoundingClientRect(); return { id: n.getAttribute('data-id'), x: b.x + b.width / 2, y: b.y + b.height / 2, transform: n.style.transform }; })()`);
const nodeCount = () => evaluate(`document.querySelectorAll(${JSON.stringify(NODE_SEL)}).length`);

async function setFile(selector, path) {
  const { root } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`no element matches ${selector}`);
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}

async function check(id, fn) {
  try {
    const out = await fn();
    if (!out) return;
    record(id, out.status, out.message, out.data);
  } catch (e) {
    let shot = null;
    try {
      shot = await screenshot(`FAIL-${id.replace(/[^a-z0-9-]+/gi, '_')}`);
    } catch {
      /* ignore */
    }
    record(id, 'FAIL', `${e instanceof Error ? e.message : String(e)}${shot ? ` (screenshot ${shot})` : ''}`);
  }
}
const pass = (message, data) => ({ status: 'PASS', message, data });
const fail = (message, data) => ({ status: 'FAIL', message, data });
const skip = (message) => ({ status: 'SKIP', message });

/** Show one left destination (only clicks when it is not already the open one). */
async function showSidebarTab(id) {
  await evaluate(`(() => { const t = document.querySelector('#sidebar-tab-${id}'); if (!t) return false; if (t.getAttribute('aria-selected') !== 'true' || document.querySelector('#sidebar-panel-${id}')?.hidden) t.click(); return true; })()`);
  await delay(100);
}

/** On the Welcome screen (always shown at startup, workstream B): open the example as a new project. */
async function leaveWelcome() {
  if (!(await evaluate(`!!document.querySelector('.sgl-welcome')`))) return false;
  const clicked = await clickButton('Try example', `document.querySelector('.sgl-welcome')`);
  if (clicked !== 'clicked') throw new Error(`Welcome "Try example" button ${clicked}`);
  await waitFor(`!document.querySelector('.sgl-welcome') && document.querySelectorAll(${JSON.stringify(NODE_SEL)}).length > 0`, 'the example project after Try example');
  return true;
}

/** Make sure a design with nodes is shown in panel 1 (Graph 2D), loading the example if needed. */
async function ensureDesign() {
  if (await leaveWelcome()) return;
  if ((await nodeCount()) > 0) return;
  await evaluate(`(() => { const s = document.querySelector('select[aria-label="View mode, panel 1"], select[aria-label="View shown in panel 1"]'); if (!s || s.value === 'graph2d') return;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'graph2d'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  if ((await nodeCount()) > 0) return;
  // No design-level "Load example" any more: start again from Welcome → Try example.
  await page.send('Page.reload');
  await waitFor(`!!document.querySelector('.sgl-welcome')`, 'the Welcome screen after a reload');
  await leaveWelcome();
}

// ── Checks ────────────────────────────────────────────────────────────────────────────────────
await setViewport(VIEWPORTS[1]);
await page.send('Page.navigate', { url: opts.url });

await check('load/app', async () => {
  await waitFor(`!!document.querySelector('.app .toolbar h1')`, 'the app toolbar');
  const title = await evaluate(`document.querySelector('.toolbar h1').textContent`);
  return title.includes('Spatial Graph Lab') ? pass(`app rendered ("${title}")`) : fail(`unexpected title "${title}"`);
});

await check('load/welcome', async () => {
  const shown = await waitFor(`(() => { const w = document.querySelector('.sgl-welcome'); return w ? { text: w.innerText.slice(0, 600), panels: document.querySelectorAll('.view-panel').length } : null; })()`, 'the Welcome screen');
  const file = await screenshot('welcome-1366x768');
  const problems = ['Welcome to Spatial Graph Lab', 'Create project', 'Open project', 'Try example', 'Recent projects'].filter((t) => !shown.text.toLowerCase().includes(t.toLowerCase()));
  if (shown.panels > 0) problems.push(`${shown.panels} view panel(s) mounted behind Welcome`);
  return problems.length
    ? fail(`Welcome incomplete: ${problems.join('; ')}`, { screenshot: file })
    : pass('Welcome overlay shown at startup (Create, Open, Try example, Recent); no project auto-opened', { screenshot: file });
});

await check('load/project', async () => {
  await leaveWelcome();
  await waitFor(`!document.querySelector('.project-bar[aria-busy="true"]')`, 'project activation to finish');
  const project = await evaluate(`document.querySelector('.sgl-identity-project')?.textContent ?? null`);
  await ensureDesign();
  const n = await nodeCount();
  return n > 0 ? pass(`project "${project ?? 'none'}" active; design shows ${n} node(s) in Graph 2D`, { project, nodes: n }) : fail('no nodes visible in Graph 2D after loading');
});

if (wants('viewports')) {
  for (const vp of VIEWPORTS) {
    await check(`viewports/${vp.width}x${vp.height}`, async () => {
      await setViewport(vp);
      const m = await evaluate(OVERFLOW_JS);
      const layout = roundAll(await rects());
      const file = await screenshot(`viewport-${vp.width}x${vp.height}`);
      const problem = overflowProblem(m);
      const missing = Object.entries(layout).filter(([k, v]) => v === null && k !== 'projectBar').map(([k]) => k);
      const data = { overflow: m, layout, screenshot: file };
      if (problem) return fail(`page scrolls (${problem}); screenshot ${file}`, data);
      if (missing.length) return fail(`layout regions missing: ${missing.join(', ')}`, data);
      const s = layout.sidebar;
      return pass(`no page scroll; sidebar ${s.width}×${s.height}, panel 1 ${layout.panel1.width}×${layout.panel1.height}`, data);
    });
  }
  await setViewport(VIEWPORTS[1]);
}

if (wants('select')) {
  await check('select/node-without-resize', async () => {
    await ensureDesign();
    await evaluate(`(document.querySelector('#sidebar-tab-inspector') ?? document.querySelector('#sidebar-tab-properties'))?.click()`);
    await delay(200);
    const before = await rects();
    const node = await nodeCenter(0);
    if (!node) return fail('no node to click');
    await clickAt(node.x, node.y);
    await waitFor(
      `!!document.querySelector(${JSON.stringify(`${NODE_SEL}.selected`)}) || !document.querySelector('.inspector')?.textContent.includes('Nothing selected')`,
      `node "${node.id}" to become selected`,
    );
    await delay(300);
    const after = await rects();
    const changes = rectChanges(before, after);
    const file = await screenshot('select-node-1366x768');
    const data = { node: node.id, before: roundAll(before), after: roundAll(after), screenshot: file };
    return changes.length
      ? fail(`selecting "${node.id}" resized the layout: ${changes.join('; ')}`, data)
      : pass(`selected "${node.id}"; sidebar and panels unchanged (±1px)`, data);
  });
}

if (wants('views')) {
  const select = 'select[aria-label="View mode, panel 2"], select[aria-label="View shown in panel 2"]';
  const original = await evaluate(`document.querySelector(${JSON.stringify(select)})?.value ?? null`);
  const modes = await evaluate(`[...(document.querySelector(${JSON.stringify(select)})?.options ?? [])].map((o) => o.value)`);
  if (!original || modes.length === 0) record('views', 'FAIL', 'panel 2 view-mode selector not found (split view expected by default)');
  for (const mode of modes) {
    await check(`views/${mode}`, async () => {
      await evaluate(`(() => { const s = document.querySelector(${JSON.stringify(select)});
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(mode)});
        s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const body = '.view-panel[data-panel="1"] .view-body';
      const content = await waitFor(
        `(() => { const b = document.querySelector(${JSON.stringify(body)}); if (!b) return null;
          // A view that is still an explicit placeholder (marked data-placeholder="<mode>") draws no canvas yet.
          if (b.querySelector(${JSON.stringify(`[data-placeholder="${mode}"]`)})) return { kind: 'placeholder' };
          const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
          const c = [...b.querySelectorAll('canvas')].sort((x, y) => area(y) - area(x))[0]; const f = b.querySelector('.react-flow');
          // An SVG view (Plan) marks its drawing surface with data-view-surface="<mode>".
          const s = b.querySelector(${JSON.stringify(`svg[data-view-surface="${mode}"]`)});
          const el = c ?? f ?? s; if (!el) return null; const r = el.getBoundingClientRect(), br = b.getBoundingClientRect();
          // The main canvas must fill most of the panel (not the 300×150 default of an unsized canvas).
          return r.width >= br.width * 0.8 && r.height >= br.height * 0.6 ? { kind: c ? 'canvas' : f ? 'react-flow' : 'svg', width: Math.round(r.width), height: Math.round(r.height) } : null; })()`,
        `${mode} content (canvas or diagram) in panel 2`,
      );
      await delay(600);
      const m = await evaluate(OVERFLOW_JS);
      const file = await screenshot(`view-${mode}-1366x768`);
      const problem = overflowProblem(m);
      const data = { content, screenshot: file };
      if (problem) return fail(`${mode}: page scrolls (${problem})`, data);
      if (content.kind === 'placeholder') return skip(`${mode}: view is a placeholder (data-placeholder="${mode}"), nothing drawn to check yet; no page scroll`);
      return pass(`${mode}: ${content.kind} ${content.width}×${content.height}, no page scroll`, data);
    });
  }
  if (original) {
    await evaluate(`(() => { const s = document.querySelector(${JSON.stringify(select)});
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(original)});
      s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await delay(300);
  }
}

const historyState = () =>
  evaluate(`(() => { const [u, r] = document.querySelectorAll('.history-actions button'); return u && r ? { undo: !u.disabled, redo: !r.disabled, undoTitle: u.title } : null; })()`);

if (wants('undo-redo')) {
  await check('undo-redo/diagram-drag', async () => {
    await ensureDesign();
    const node = await nodeCenter(0);
    if (!node) return fail('no node to drag');
    const h0 = await historyState();
    if (!h0) return fail('Undo/Redo buttons not found in .history-actions');
    await drag(node.x, node.y, 70, 40);
    const moved = await nodeCenter(0);
    const h1 = await waitFor(`(() => { const [u] = document.querySelectorAll('.history-actions button'); return u && !u.disabled ? u.title : null; })()`, 'Undo to become enabled after a diagram drag');
    if (moved.transform === node.transform) return fail('the node did not move when dragged');
    await clickButton('↶');
    await waitFor(`(() => { const [, r] = document.querySelectorAll('.history-actions button'); return r && !r.disabled; })()`, 'Redo to become enabled after Undo');
    const undone = await nodeCenter(0);
    await clickButton('↷');
    await delay(300);
    const redone = await nodeCenter(0);
    const data = { before: node.transform, moved: moved.transform, undone: undone.transform, redone: redone.transform, undoTitle: h1 };
    if (undone.transform !== node.transform) return fail(`Undo did not restore the diagram position (${node.transform} → ${undone.transform})`, data);
    if (redone.transform !== moved.transform) return fail(`Redo did not reapply the move (${moved.transform} vs ${redone.transform})`, data);
    return pass(`drag → Undo restores → Redo reapplies ("${h1}")`, data);
  });
}

if (wants('analysis')) {
  await check('analysis/run', async () => {
    await ensureDesign();
    const opened = await evaluate(`(() => { const t = document.querySelector('#sidebar-tab-algorithms'); if (!t) return false; t.click(); return true; })()`);
    if (!opened) return fail('Algorithms tab (#sidebar-tab-algorithms) not found');
    await delay(200);
    const list = await evaluate(`[...document.querySelectorAll('.algorithm-item')].map((b, i) => ({ i, label: b.querySelector('.algorithm-label')?.textContent, tag: b.querySelector('.algorithm-tag')?.textContent }))`);
    const target = list.find((a) => /graph|analysis/i.test(a.tag ?? ''));
    if (!target) return skip(`no enabled graph analysis in the active project (found: ${list.map((a) => `${a.label} [${a.tag}]`).join(', ') || 'none'})`);
    await evaluate(`document.querySelectorAll('.algorithm-item')[${target.i}].click()`);
    await delay(150);
    const run = await clickButton('Run', `document.querySelector('.algorithms')`);
    if (run !== 'clicked') return fail(`Run button ${run} for "${target.label}"`);
    const result = await waitFor(
      `(() => { const r = document.querySelector('.algorithm-result'); if (!r) return null;
        return { heading: r.querySelector('h4')?.textContent ?? '', rows: r.querySelectorAll('tbody tr').length, alert: r.getAttribute('role') === 'alert', text: r.textContent.slice(0, 200) }; })()`,
      'an algorithm result',
    );
    const file = await screenshot('analysis-result-1366x768');
    const data = { algorithm: target.label, result, screenshot: file };
    if (result.alert) return fail(`"${target.label}" failed: ${result.text}`, data);
    return result.rows > 0 ? pass(`"${target.label}": ${result.rows} value row(s) shown`, data) : fail(`"${target.label}" showed no value rows`, data);
  });

  await check('analysis/stale-after-edit', async () => {
    const hasResult = await evaluate(`!!document.querySelector('.algorithm-result tbody tr')`);
    if (!hasResult) return skip('no analysis result to mark stale');
    const node = await nodeCenter(1) ?? (await nodeCenter(0));
    await drag(node.x, node.y, -50, 30);
    const warning = await waitFor(`document.querySelector('.algorithm-result .sgl-warning')?.textContent ?? null`, 'the stale-result warning after an edit');
    const file = await screenshot('analysis-stale-1366x768');
    return pass(`stale warning shown: "${warning.trim()}"`, { screenshot: file });
  });

  await check('analysis/overlay', async () => {
    if (!opts.features.has('analysis-overlay')) return skip(`needs --feature analysis-overlay (${FEATURES['analysis-overlay']}); not wired before integration`);
    const n = await evaluate(`document.querySelectorAll('.sgl-pres-analysis').length`);
    return n > 0 ? pass(`${n} analysis legend(s) visible`) : fail('no .sgl-pres-analysis legend after running an analysis');
  });
  await evaluate(`(document.querySelector('#sidebar-tab-inspector') ?? document.querySelector('#sidebar-tab-properties'))?.click()`);
}

if (wants('import')) {
  await check('import/invalid-json-message', async () => {
    const bad = join(outDir, 'invalid-design.json');
    writeFileSync(bad, '{ "schemaVersion": 1, "nodes": [ ');
    const before = await nodeCount();
    await showSidebarTab('project');
    await setFile('.sgl-project-actions input[type="file"]', bad);
    const alert = await waitFor(
      `(() => { const a = document.querySelector('section.issues[role="alert"]'); if (!a) return null;
        return { heading: a.querySelector('h2')?.textContent ?? '', text: a.innerText, items: a.querySelectorAll('li').length }; })()`,
      'an import error message',
    );
    const after = await nodeCount();
    const file = await screenshot('import-invalid-1366x768');
    const problems = [];
    if (!/could not load/i.test(alert.heading)) problems.push('heading does not say the file could not be loaded');
    if (!alert.heading.includes('invalid-design.json')) problems.push('heading does not name the file');
    if (!/kept unchanged|no design is loaded/i.test(alert.text)) problems.push('does not say whether the current design was kept');
    if (alert.items < 1 || alert.items > 5) problems.push(`${alert.items} issue lines (expected 1–5)`);
    if (after !== before) problems.push(`node count changed ${before} → ${after}`);
    await clickButton('Dismiss', `document.querySelector('section.issues')`);
    const data = { alert, screenshot: file };
    return problems.length ? fail(problems.join('; '), data) : pass(`clear error: "${alert.heading}", ${alert.items} issue line(s); design kept`, data);
  });

  await check('import/valid-example', async () => {
    await showSidebarTab('project');
    await setFile('.sgl-project-actions input[type="file"]', EXAMPLE_DESIGN);
    await waitFor(`!document.querySelector('section.issues[role="alert"]') && document.querySelectorAll(${JSON.stringify(NODE_SEL)}).length > 0`, 'the imported design');
    const n = await nodeCount();
    return pass(`imported two-storey-example.json: ${n} node(s)${dialogs.length ? `; accepted dialog(s): ${dialogs.length}` : ''}`);
  });
}

if (wants('export')) {
  await check('export/json', async () => {
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
    const existing = new Set(readdirSync(downloadDir));
    // Export is project-level: the active scenario's design is read from the project file.
    await showSidebarTab('project');
    const clicked = await clickButton('Export project');
    if (clicked !== 'clicked') return fail(`Export project button ${clicked}`);
    let name = null;
    for (const end = Date.now() + opts.timeout; name === null && Date.now() < end; ) {
      name = readdirSync(downloadDir).find((x) => !existing.has(x) && x.endsWith('.json')) ?? null;
      if (name === null) await delay(150);
    }
    if (!name) return fail(`no .json file was downloaded to ${downloadDir}`);
    const text = readFileSync(join(downloadDir, name), 'utf8');
    let doc;
    try {
      const file = JSON.parse(text);
      if (file.format !== 'spatial-graph-lab/project') return fail(`${name} is not a project file (format ${file.format})`);
      doc = file.scenarios.find((s) => s.id === file.activeScenarioId)?.design ?? {};
    } catch {
      return fail(`downloaded ${name} is not valid JSON`);
    }
    // Keep it under another name, so a later export of the same project is not renamed by the browser.
    const kept = join(downloadDir, `export-json-${name}`);
    renameSync(join(downloadDir, name), kept);
    const data = { file: kept, schemaVersion: doc.schemaVersion, nodes: doc.nodes?.length };
    if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) return fail(`${name} has no nodes/edges arrays`, data);
    if (opts.features.has('v2') && doc.schemaVersion !== 2) return fail(`--feature v2: export wrote schemaVersion ${doc.schemaVersion}, expected 2`, data);
    return pass(`${name}: schemaVersion ${doc.schemaVersion}, ${doc.nodes.length} nodes, ${doc.edges.length} edges`, data);
  });
}

if (wants('help')) {
  await check('help/keyboard-tooltip', async () => {
    if (!opts.features.has('help')) return skip(`needs --feature help (${FEATURES.help}); not wired before integration`);
    const count = await evaluate(`document.querySelectorAll('[data-help-topic]').length`);
    if (count === 0) return fail('no [data-help-topic] help buttons on the page');
    await evaluate(`document.activeElement?.blur(); document.body.focus()`);
    let reached = false;
    for (let i = 0; i < 250 && !reached; i++) {
      await key('Tab', 'Tab', 9);
      reached = await evaluate(`!!document.activeElement?.classList.contains('sgl-helptip-trigger')`);
    }
    if (!reached) return fail(`${count} help button(s) exist but none was reached with the Tab key`);
    const tip = await waitFor(
      `(() => { const t = document.activeElement.closest('.sgl-helptip')?.querySelector('[role="tooltip"]'); if (!t || t.hidden) return null;
        const r = t.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? t.textContent : null; })()`,
      'the tooltip to appear on keyboard focus',
    );
    const file = await screenshot('help-tooltip-focus');
    await key('Escape', 'Escape', 27);
    const hidden = await evaluate(`document.activeElement.closest('.sgl-helptip')?.querySelector('[role="tooltip"]')?.hidden === true`);
    return hidden ? pass(`${count} help button(s); focus shows "${tip}"; Escape hides it`, { screenshot: file }) : fail('Escape did not hide the tooltip', { screenshot: file });
  });
}

if (wants('legend')) {
  await check('legend/relationship-status', async () => {
    if (!opts.features.has('legend')) return skip(`needs --feature legend (${FEATURES.legend}); not wired before integration`);
    const items = await evaluate(`[...document.querySelectorAll('[data-legend-item^="status:"]')].map((e) => e.getAttribute('data-legend-item'))`);
    return items.length ? pass(`status legend items: ${[...new Set(items)].join(', ')}`) : fail('no [data-legend-item^="status:"] legend entries visible');
  });
}

// Stage 07 components in isolation (dev server only: the fixture is not part of the build).
if (wants('components')) {
  const fixtureUrl = new URL('scripts/smoke/fixtures/components.html', new URL('/', opts.url)).href;
  let available = false;
  try {
    const res = await fetch(fixtureUrl, { signal: AbortSignal.timeout(5_000) });
    available = res.ok && (await res.text()).includes('components.js');
  } catch {
    available = false;
  }
  if (!available) {
    record('components', 'SKIP', `component fixture not served at ${fixtureUrl} (only "npm run dev" serves it, not "preview")`);
  } else {
    await setViewport(VIEWPORTS[1]);
    await page.send('Page.navigate', { url: fixtureUrl });
    const ready = `!!document.querySelector('[data-help-topic]') && !!document.querySelector('[data-legend-view]')`;

    await check('components/help-keyboard', async () => {
      await waitFor(ready, 'the component fixture');
      await evaluate(`document.querySelector('#before-help').focus()`);
      await key('Tab', 'Tab', 9);
      const focused = await evaluate(`document.activeElement?.closest('[data-help-topic]')?.getAttribute('data-help-topic') ?? null`);
      if (!focused) return fail('Tab from the preceding control did not reach a help button');
      const tip = await waitFor(
        `(() => { const t = document.activeElement.closest('.sgl-helptip').querySelector('[role="tooltip"]'); if (t.hidden) return null;
          const r = t.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { text: t.textContent, id: t.id, describedBy: document.activeElement.getAttribute('aria-describedby') } : null; })()`,
        'the tooltip to show on keyboard focus',
      );
      if (tip.id !== tip.describedBy) return fail(`tooltip id ${tip.id} is not the button's aria-describedby (${tip.describedBy})`);
      const focusShot = await screenshot('components-help-focus');
      await key('Escape', 'Escape', 27);
      const hiddenAfterEscape = await evaluate(`document.activeElement.closest('.sgl-helptip').querySelector('[role="tooltip"]').hidden`);
      await key('Enter', 'Enter', 13);
      const panel = await waitFor(
        `(() => { const s = document.activeElement.closest('.sgl-helptip'); const p = s.querySelector('.sgl-helptip-panel');
          return !p.hidden && document.activeElement.getAttribute('aria-expanded') === 'true' ? p.textContent.includes('More details') : null; })()`,
        'Enter to open the details panel',
      );
      const panelShot = await screenshot('components-help-panel');
      await key('Escape', 'Escape', 27);
      const closed = await evaluate(`document.activeElement.closest('.sgl-helptip').querySelector('.sgl-helptip-panel').hidden`);
      const problems = [
        ...(hiddenAfterEscape ? [] : ['Escape did not hide the tooltip']),
        ...(panel ? [] : ['details panel has no "More details" disclosure']),
        ...(closed ? [] : ['Escape did not close the details panel']),
      ];
      const data = { topic: focused, tooltip: tip.text, screenshots: [focusShot, panelShot] };
      return problems.length ? fail(problems.join('; '), data) : pass(`"${focused}": focus shows "${tip.text}"; Enter opens details; Escape closes`, data);
    });

    await check('components/help-hover', async () => {
      const r = await evaluate(`(() => { const b = document.querySelectorAll('.sgl-helptip-trigger')[1].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
      await mouse('mouseMoved', 5, 5, { button: 'none' });
      await mouse('mouseMoved', r.x, r.y, { button: 'none' });
      const text = await waitFor(`(() => { const t = document.querySelectorAll('.sgl-helptip')[1].querySelector('[role="tooltip"]'); return t.hidden ? null : t.textContent; })()`, 'the tooltip to show on hover');
      await mouse('mouseMoved', 5, 5, { button: 'none' });
      const hidden = await waitFor(`document.querySelectorAll('.sgl-helptip')[1].querySelector('[role="tooltip"]').hidden`, 'the tooltip to hide on leave');
      return hidden ? pass(`hover shows "${text}" and leaving hides it`) : fail('tooltip stayed after the pointer left');
    });

    await check('components/legends-consistent', async () => {
      const legends = await evaluate(`[...document.querySelectorAll('[data-legend-view]')].map((l) => ({
        view: l.getAttribute('data-legend-view'),
        status: [...l.querySelectorAll('[data-legend-item^="status:"]')].map((i) => i.getAttribute('data-legend-item') + '=' + i.querySelector('.sgl-pres-label').textContent.trim() + '|' + i.querySelector('svg').innerHTML),
        dashed: [...l.querySelectorAll('[data-legend-item]')].filter((i) => i.querySelector('[stroke-dasharray]')).map((i) => i.getAttribute('data-legend-item')),
        focusable: [...l.querySelectorAll('[data-legend-item]')].every((i) => i.tabIndex === 0),
      }))`);
      const file = await screenshot('components-legends');
      const problems = [];
      if (legends.length !== 4) problems.push(`expected 4 view legends, found ${legends.length}`);
      for (const l of legends) {
        if (JSON.stringify(l.status) !== JSON.stringify(legends[0].status)) problems.push(`${l.view} status entries differ from ${legends[0].view}`);
        if (JSON.stringify(l.dashed) !== JSON.stringify(['status:routed', 'status:unresolved'])) problems.push(`${l.view}: dashed items ${JSON.stringify(l.dashed)}`);
        if (!l.focusable) problems.push(`${l.view}: legend items not keyboard focusable`);
      }
      const data = { legends: legends.map((l) => l.view), screenshot: file };
      return problems.length ? fail(problems.join('; '), data) : pass(`${legends.length} view legends share identical status entries; only Routed (long) and Unresolved (short) are dashed`, data);
    });

    await check('components/analysis-legend', async () => {
      await evaluate(`document.querySelector('#toggle-stale').click()`);
      const stale = await waitFor(`document.querySelector('[data-analysis-stale="true"]')?.textContent.includes('Out of date') ? true : null`, 'the stale analysis legend');
      const file = await screenshot('components-analysis-stale');
      await clickButton('Clear', `document.querySelector('.sgl-pres-analysis')`);
      const cleared = await waitFor(`!!document.querySelector('#analysis-cleared') && !document.querySelector('.sgl-pres-analysis')`, 'Clear to remove the analysis legend');
      return stale && cleared ? pass('stale analysis is marked "Out of date"; Clear removes the overlay legend', { screenshot: file }) : fail('analysis legend did not behave as expected');
    });
  }
}

// F-B project store against real IndexedDB (dev server only: the fixture is not part of the build).
if (wants('project-store')) {
  const fixtureUrl = new URL('scripts/smoke/fixtures/project-store.html', new URL('/', opts.url)).href;
  let available = false;
  try {
    const res = await fetch(fixtureUrl, { signal: AbortSignal.timeout(5_000) });
    available = res.ok && (await res.text()).includes('project-store.js');
  } catch {
    available = false;
  }
  if (!available) {
    record('project-store', 'SKIP', `project-store fixture not served at ${fixtureUrl} (only "npm run dev" serves it, not "preview")`);
  } else {
    await page.send('Page.navigate', { url: fixtureUrl });
    let result = null;
    await check('project-store/run', async () => {
      const text = await waitFor(`document.querySelector('#result[data-done="true"]')?.textContent ?? null`, 'the project-store fixture to finish');
      result = JSON.parse(text);
      const failed = result.checks.filter((c) => !c.ok).map((c) => c.id);
      return failed.length ? fail(`failed: ${failed.join(', ')}`, result) : pass(`${result.checks.length} IndexedDB checks ran in ${result.dbName} (deleted afterwards)`, result);
    });
    for (const c of result?.checks ?? []) {
      await check(`project-store/${c.id}`, async () => (c.ok ? pass(JSON.stringify(c.detail ?? null)) : fail(JSON.stringify(c.detail ?? null))));
    }
  }
}

// ── Scenarios, autosave, Recent, project export/import (workstream B) ────────────────────────
if (wants('scenarios')) {
  const ROW = (name) => `[...document.querySelectorAll('.sgl-scenario')].find((li) => li.querySelector('.sgl-scenario-name')?.textContent === ${JSON.stringify(name)})`;
  const scenarioNames = () => evaluate(`[...document.querySelectorAll('.sgl-scenario .sgl-scenario-name')].map((e) => e.textContent)`);
  const headerScenario = () => evaluate(`document.querySelector('.sgl-identity-scenario')?.textContent ?? null`);
  const openTab = (id) => evaluate(`(() => { const t = document.querySelector('#sidebar-tab-${id}'); if (!t) return false; t.click(); return true; })()`);
  const transforms = () =>
    evaluate(`Object.fromEntries([...document.querySelectorAll(${JSON.stringify(NODE_SEL)})].map((n) => [n.getAttribute('data-id'), n.style.transform]))`);
  const undoState = () => evaluate(`(() => { const [u, r] = document.querySelectorAll('.history-actions button'); return u && r ? { undo: !u.disabled, redo: !r.disabled } : null; })()`);
  const switchTo = async (name) => {
    await openTab('scenarios');
    const ok = await evaluate(`(() => { const b = ${ROW(name)}?.querySelector('.sgl-scenario-switch'); if (!b) return false; b.click(); return true; })()`);
    if (!ok) throw new Error(`no scenario row "${name}"`);
    await waitFor(`document.querySelector('.sgl-identity-scenario')?.textContent === ${JSON.stringify(name)}`, `scenario "${name}" to become active`);
    await delay(400);
  };
  const setInput = (selector, value) =>
    evaluate(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (!i) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)});
      i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const waitSaved = () =>
    waitFor(
      `(() => { const s = document.querySelector('.sgl-save-status')?.getAttribute('data-save-state'); if (s === 'blocked') throw new Error('save blocked: ' + document.querySelector('.sgl-save-status')?.title); return s === 'saved'; })()`,
      'the project to be saved in this browser',
      15000,
    );
  const st = { ok: false };

  await check('scenarios/create-rename-delete', async () => {
    await page.send('Page.navigate', { url: opts.url });
    await waitFor(`!!document.querySelector('.sgl-welcome')`, 'the Welcome screen after a fresh load');
    await leaveWelcome();
    st.project = await evaluate(`document.querySelector('.sgl-identity-project')?.textContent ?? null`);
    if (!(await openTab('scenarios'))) return fail('Scenarios tab (#sidebar-tab-scenarios) not found');
    await waitFor(`document.querySelectorAll('.sgl-scenario').length === 1`, 'exactly one scenario in a new project');
    for (let n = 2; n <= 3; n++) {
      if ((await clickButton('+ New scenario')) !== 'clicked') return fail('"+ New scenario" not clickable');
      await waitFor(`!!document.querySelector('dialog[data-dialog="new-scenario"][open]')`, 'the new-scenario dialog');
      if ((await clickButton('Create scenario', `document.querySelector('dialog[data-dialog="new-scenario"]')`)) !== 'clicked') return fail('"Create scenario" not clickable');
      await waitFor(`document.querySelectorAll('.sgl-scenario').length === ${n}`, `${n} scenarios`);
    }
    // Rename the active (third) scenario.
    await evaluate(`${ROW('Scenario 3')}.querySelector('button[aria-label="Rename Scenario 3"]').click()`);
    await waitFor(`!!document.querySelector('input[aria-label="New name for Scenario 3"]')`, 'the rename field');
    await setInput('input[aria-label="New name for Scenario 3"]', 'Option C');
    await evaluate(`document.querySelector('input[aria-label="New name for Scenario 3"]').form.requestSubmit()`);
    await waitFor(`!!${ROW('Option C')}`, 'the renamed scenario');
    // Delete Scenario 1 with confirmation.
    await evaluate(`${ROW('Scenario 1')}.querySelector('button[aria-label="Delete Scenario 1"]').click()`);
    await waitFor(`!!document.querySelector('dialog[data-dialog="delete-scenario"][open]')`, 'the delete confirmation dialog');
    await clickButton('Delete scenario', `document.querySelector('dialog[data-dialog="delete-scenario"]')`);
    await waitFor(`!${ROW('Scenario 1')}`, 'Scenario 1 to be deleted');
    const names = await scenarioNames();
    const header = await headerScenario();
    const headerSwitch = await evaluate(`!!document.querySelector('.toolbar select, .toolbar [role="listbox"], .toolbar [role="combobox"]')`);
    const file = await screenshot('scenarios-panel-1366x768');
    const data = { names, header, screenshot: file };
    if (names.join('|') !== 'Scenario 2|Option C') return fail(`scenarios ${JSON.stringify(names)}, expected Scenario 2, Option C`, data);
    if (header !== 'Option C') return fail(`header shows scenario "${header}", expected the active "Option C"`, data);
    if (headerSwitch) return fail('the header contains a selector (no scenario switcher in the header)', data);
    st.ok = true;
    return pass(`created 2 scenarios, renamed one, deleted one with confirmation; header names "${header}" without a switcher`, data);
  });

  await check('scenarios/isolated-edits-and-undo', async () => {
    if (!st.ok) return skip('needs scenarios/create-rename-delete');
    st.ok = false;
    const base = await transforms();
    const ids = Object.keys(base);
    // Option C (active): move node 0.
    let n = await nodeCenter(0);
    await drag(n.x, n.y, 60, 35);
    const c = await transforms();
    if (c[ids[0]] === base[ids[0]]) return fail('dragging node 0 in Option C did not move it');
    // Scenario 2: unchanged, then move node 1.
    await switchTo('Scenario 2');
    const s2 = await transforms();
    if (s2[ids[0]] !== base[ids[0]]) return fail(`Option C's edit leaked into Scenario 2 (${s2[ids[0]]})`);
    const u0 = await undoState();
    if (u0.undo) return fail('Scenario 2 offers Undo before any edit in it (histories mixed)');
    n = await nodeCenter(1);
    await drag(n.x, n.y, -55, 30);
    const s2b = await transforms();
    if (s2b[ids[1]] === base[ids[1]]) return fail('dragging node 1 in Scenario 2 did not move it');
    // Undo in Scenario 2 reverts only its own step, then there is nothing more to undo.
    await clickButton('↶');
    await delay(300);
    const s2u = await transforms();
    const u1 = await undoState();
    if (s2u[ids[1]] !== base[ids[1]]) return fail('Undo in Scenario 2 did not restore node 1');
    if (u1.undo) return fail('after undoing the only step of Scenario 2, Undo is still enabled (it would reach another scenario)');
    await clickButton('↷');
    await delay(300);
    // Option C keeps its own step and history.
    await switchTo('Option C');
    const c2 = await transforms();
    const u2 = await undoState();
    if (c2[ids[0]] !== c[ids[0]] || c2[ids[1]] !== base[ids[1]]) return fail(`Option C changed after editing Scenario 2: ${JSON.stringify(c2)}`);
    if (!u2.undo) return fail('Option C lost its undo step after switching');
    await clickButton('↶');
    await delay(300);
    if ((await transforms())[ids[0]] !== base[ids[0]]) return fail('Undo in Option C did not restore node 0');
    await clickButton('↷');
    await delay(300);
    st.expect = { ids, optionC: c[ids[0]], scenario2: s2b[ids[1]], base };
    await waitSaved();
    st.ok = true;
    return pass('edits stay in their scenario; Undo/Redo act only on the active scenario; saved in this browser', { expect: st.expect });
  });

  await check('scenarios/reload-recent-restore', async () => {
    if (!st.ok) return skip('needs scenarios/isolated-edits-and-undo');
    st.ok = false;
    await page.send('Page.navigate', { url: opts.url });
    const w = await waitFor(
      `(() => { const w = document.querySelector('.sgl-welcome'); if (!w) return null; const rows = [...w.querySelectorAll('.sgl-recent .sgl-recent-name')].map((e) => e.textContent); return rows.length ? { rows, panels: document.querySelectorAll('.view-panel').length } : null; })()`,
      'Welcome with Recent projects after reload',
    );
    if (w.panels > 0) return fail('a project was reopened automatically after reload');
    const file = await screenshot('welcome-recent-1366x768');
    const opened = await evaluate(
      `(() => { const b = [...document.querySelectorAll('.sgl-recent-open')].find((e) => e.querySelector('.sgl-recent-name')?.textContent === ${JSON.stringify(st.project)}); if (!b) return false; b.click(); return true; })()`,
    );
    if (!opened) return fail(`"${st.project}" not in Recent: ${JSON.stringify(w.rows)}`);
    await waitFor(`!document.querySelector('.sgl-welcome') && document.querySelectorAll(${JSON.stringify(NODE_SEL)}).length > 0`, 'the restored project');
    await openTab('scenarios');
    const names = await scenarioNames();
    const header = await headerScenario();
    const { ids, optionC, scenario2, base } = st.expect;
    const c = await transforms();
    const u = await undoState();
    await switchTo('Scenario 2');
    const s2 = await transforms();
    const data = { names, header, recent: w.rows, screenshot: file };
    if (names.join('|') !== 'Scenario 2|Option C') return fail(`restored scenarios ${JSON.stringify(names)}`, data);
    if (header !== 'Option C') return fail(`restored active scenario "${header}", expected Option C`, data);
    if (c[ids[0]] !== optionC || c[ids[1]] !== base[ids[1]]) return fail(`Option C restored wrongly: ${JSON.stringify(c)}`, data);
    if (s2[ids[1]] !== scenario2 || s2[ids[0]] !== base[ids[0]]) return fail(`Scenario 2 restored wrongly: ${JSON.stringify(s2)}`, data);
    if (u.undo) return fail('a restored project offers Undo (history should start fresh)', data);
    st.ok = true;
    return pass(`Welcome after reload (no auto-resume); Recent restored "${st.project}" with both scenarios and their edits`, data);
  });

  await check('scenarios/export-import-project', async () => {
    if (!st.ok) return skip('needs scenarios/reload-recent-restore');
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
    await openTab('project');
    await delay(200);
    await screenshot('project-files-1366x768');
    const existing = new Set(readdirSync(downloadDir));
    if ((await clickButton('Export project')) !== 'clicked') return fail('"Export project" not clickable');
    let name = null;
    for (const end = Date.now() + opts.timeout; name === null && Date.now() < end; ) {
      name = readdirSync(downloadDir).find((x) => !existing.has(x) && x.endsWith('.project.json')) ?? null;
      if (name === null) await delay(150);
    }
    if (!name) return fail('no .project.json was downloaded');
    const path = join(downloadDir, name);
    const json = JSON.parse(readFileSync(path, 'utf8'));
    if (json.format !== 'spatial-graph-lab/project' || json.scenarios?.length !== 2) return fail(`exported ${name}: format ${json.format}, ${json.scenarios?.length} scenarios`);
    await setFile('.sgl-project-actions input[type="file"]', path);
    const notice = await waitFor(`document.querySelector('.sgl-notice')?.textContent ?? null`, 'the "opened as a separate copy" notice');
    await openTab('scenarios');
    await waitFor(`document.querySelectorAll('.sgl-scenario').length === 2`, 'two scenarios in the imported project');
    const names = await scenarioNames();
    const { ids, optionC, scenario2 } = st.expect;
    await switchTo('Option C');
    const c = await transforms();
    await switchTo('Scenario 2');
    const s2 = await transforms();
    const data = { file: path, names, notice };
    if (names.join('|') !== 'Scenario 2|Option C') return fail(`imported scenarios ${JSON.stringify(names)}`, data);
    if (c[ids[0]] !== optionC || s2[ids[1]] !== scenario2) return fail('imported scenarios lost their edits', data);
    await waitSaved();
    return pass(`exported ${name} (2 scenarios) and re-imported it as a separate local copy with both scenarios intact`, data);
  });

  await check('scenarios/blocked-save-then-open', async () => {
    // Simulate a full disk: IndexedDB put throws the browser's own QuotaExceededError (restored below).
    await evaluate(`(() => { window.__sglPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new DOMException('simulated quota', 'QuotaExceededError'); }; return true; })()`);
    try {
      const n = await nodeCenter(0);
      await drag(n.x, n.y, 40, 25);
      const state = await waitFor(
        `(() => { const s = document.querySelector('.sgl-save-status'); return s?.getAttribute('data-save-state') === 'blocked' ? s.textContent + ' | ' + s.title : null; })()`,
        'the save to be reported as blocked',
        15000,
      );
      const shot = await screenshot('blocked-save-1366x768');
      const before = dialogs.length;
      await showSidebarTab('project');
      await setFile('.sgl-project-actions input[type="file"]', EXAMPLE_DESIGN);
      let asked = null;
      // An unsaved last session is asked about first ("not saved in this browser"), then the blocked save itself.
      for (const end = Date.now() + opts.timeout; asked === null && Date.now() < end; await delay(100)) asked = dialogs.slice(before).find((d) => /could not be saved/i.test(d)) ?? null;
      if (!asked) return fail(`opening another file while the save was blocked did not ask before discarding the unsaved changes; dialogs: ${JSON.stringify(dialogs.slice(before))}`, { state, screenshot: shot });
      // The harness accepts dialogs, i.e. the user chose to discard: the other file opens.
      await waitFor(`document.querySelectorAll(${JSON.stringify(NODE_SEL)}).length > 0 && document.querySelector('.sgl-identity-project')?.textContent !== null`, 'the opened file after confirming');
      return pass(`blocked save shown ("${state.split(' | ')[0].trim()}"); opening another file asked first: "${asked.slice(0, 90)}…"`, { state, dialog: asked, screenshot: shot });
    } finally {
      await evaluate(`(() => { if (window.__sglPut) IDBObjectStore.prototype.put = window.__sglPut; return true; })()`);
    }
  });

  await check('scenarios/1280x720', async () => {
    await setViewport(VIEWPORTS[0]);
    await openTab('scenarios');
    const m = await evaluate(OVERFLOW_JS);
    const file = await screenshot('scenarios-panel-1280x720');
    await page.send('Page.navigate', { url: opts.url });
    await waitFor(`!!document.querySelector('.sgl-welcome .sgl-recent')`, 'Welcome with Recent');
    const m2 = await evaluate(OVERFLOW_JS);
    const file2 = await screenshot('welcome-1280x720');
    await setViewport(VIEWPORTS[1]);
    const problem = overflowProblem(m) ?? overflowProblem(m2);
    return problem ? fail(`page scrolls: ${problem}`, { screenshots: [file, file2] }) : pass('Scenarios panel and Welcome fit 1280×720 without page scroll', { screenshots: [file, file2] });
  });
}

if (opts.features.has('v2') && !wants('export')) record('v2', 'SKIP', 'v2 is checked by the export group, which was not run');

await check('console/no-errors', async () => {
  const all = [...new Set(consoleErrors)];
  const ignored = all.filter(isIgnorableConsoleError);
  const unique = all.filter((e) => !isIgnorableConsoleError(e));
  const note = ignored.length ? ` (ignored: ${ignored.length} favicon.ico 404 — index.html declares no icon)` : '';
  return unique.length
    ? fail(`${unique.length} console error(s): ${unique.slice(0, 5).join(' | ')}${note}`, { errors: unique, ignored })
    : pass(`no uncaught exceptions or console errors${note}`, { ignored });
});

await session.close();

const meta = { url: opts.url, browser: session.version, started, features: [...opts.features], outDir, dialogs };
writeFileSync(join(outDir, 'report.json'), `${JSON.stringify({ ...meta, results }, null, 2)}\n`);
writeFileSync(join(outDir, 'report.md'), formatMarkdown(meta, results));
console.log(`\n${formatTable(results)}\n\nReport: ${join(outDir, 'report.md')}`);
process.exit(summarize(results).FAIL > 0 ? 1 : 0);
