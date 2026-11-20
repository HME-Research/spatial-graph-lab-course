#!/usr/bin/env node
// Spatial Graph Lab — Guide screenshots (Programme P4, item H). See scripts/smoke/README.md.
//
// Drives the REAL app (dev server or production preview, which you start yourself: this script never
// starts or stops servers) through the How-to steps and the side panels, and writes for each Guide
// entry one WebP image to public/guide/<entry id>.webp plus the centres of its numbered markers, as
// fractions (0–1) of the image, to app/ui/guide/screenshots.json. The Guide draws the markers over
// the image (app/ui/guide/ExplainerView.tsx); their numbers are the entry's step numbers. The alt
// text is hand-written in app/ui/guide/screenshots.ts. Rerun it whenever the UI changes:
//
//   node scripts/guide-shots.mjs --url http://localhost:5180/ [--only howto-connect,panel-analyse]
//
// Uses the shared browser helpers of the smoke scripts (scripts/smoke/app.mjs, cdp.mjs).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  delay,
  gotoWelcome,
  openRail,
  openWithToolkit,
  runScript,
  selectEdge,
  selectNode,
  setViewMode,
  openBuiltInExample,
} from './smoke/app.mjs';

const USAGE = `Guide screenshots: node scripts/guide-shots.mjs --url http://localhost:5180/ [--only id,id] [--viewport 1366x768]
Writes public/guide/<id>.webp and app/ui/guide/screenshots.json (marker centres). Never starts or stops servers.`;

const IMAGE_DIR = join(REPO_ROOT, 'public', 'guide');
const JSON_FILE = join(REPO_ROOT, 'app', 'ui', 'guide', 'screenshots.json');
/** Whole-app shots are scaled down to keep the files small; panel shots stay at full size. */
const APP_SCALE = 0.75;
const QUALITY = 80;

const onlyArg = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();
// runScript rejects unknown flags: drop --only before it parses the command line.
if (onlyArg) process.argv.splice(process.argv.indexOf('--only'), 2);

/**
 * Page-side finder. A marker target is one of: { sel } (CSS), { node } (a Graph 2D node id),
 * { text } (the deepest visible element whose text is exactly, or else starts with, `text`),
 * { contains } (the deepest visible element whose text contains it), { expr } (a page expression
 * returning an element). Optional: within (scope selector), up (go to the n-th parent), at:
 * 'after' (default for text: just right of the text itself, so the marker does not hide the label),
 * 'center' (default otherwise), 'corner' (default for nodes: top right), gap (px between a label and
 * its 'after' marker), scroll (scroll it into view).
 */
const FIND = `((spec) => {
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const scope = spec.within ? document.querySelector(spec.within) : document;
  if (!scope) return null;
  let el = null;
  const norm = (e) => e.textContent.replace(/\\s+/g, ' ').trim();
  const all = () => [...scope.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('[data-floating]'));
  if (spec.sel) el = [...scope.querySelectorAll(spec.sel)].find(vis) ?? null;
  else if (spec.node !== undefined) el = __sgl.graphPanel()?.querySelector('.react-flow__node[data-id="' + spec.node + '"]') ?? null;
  else if (spec.expr) el = (0, eval)(spec.expr);
  else if (spec.contains !== undefined) el = all().filter((e) => norm(e).includes(spec.contains)).pop() ?? null;
  else if (spec.text !== undefined) {
    const list = all();
    el = list.filter((e) => norm(e) === spec.text).pop() ?? list.filter((e) => norm(e).startsWith(spec.text)).pop() ?? null;
  }
  for (let i = 0; el && i < (spec.up ?? 0); i++) el = el.parentElement;
  if (!el) return null;
  if (spec.scroll) el.scrollIntoView({ block: 'center' });
  const textual = spec.text !== undefined || spec.contains !== undefined;
  const at = spec.at ?? (spec.node !== undefined ? 'corner' : textual && !spec.up ? 'after' : 'center');
  let b = el.getBoundingClientRect();
  if (at === 'after') {
    const r = document.createRange();
    r.selectNodeContents(el);
    const t = r.getBoundingClientRect();
    if (t.width > 0) b = t;
    return { x: b.right + (spec.gap ?? 14), y: b.y + b.height / 2 };
  }
  if (at === 'corner') return { x: b.right + 2, y: b.top - 2 };
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
})`;

const round = (v) => Math.round(v * 1000) / 1000;

await runScript({ name: 'guide-shots', usage: USAGE, url: 'http://localhost:5180/', viewport: '1366x768' }, async (s) => {
  const results = existsSync(JSON_FILE) ? JSON.parse(readFileSync(JSON_FILE, 'utf8')) : {};
  mkdirSync(IMAGE_DIR, { recursive: true });
  const want = (id) => !onlyArg || onlyArg.has(id);
  const done = [];
  const failed = [];
  const VIEW = { x: 0, y: 0, width: s.viewport.width, height: s.viewport.height };

  /** Capture entry `id`: clip (selector, rect or the whole viewport), markers 1…n in order. */
  async function shot(id, { clip = null, scale = clip ? 1 : APP_SCALE, markers }) {
    let box = typeof clip === 'string' ? await s.rect(clip) : (clip ?? VIEW);
    if (!box) throw new Error(`${id}: nothing matches ${clip}`);
    // Keep the clip inside the viewport (a tall panel is cut at the bottom of the window).
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    box = { x, y, width: Math.min(box.x + box.width, VIEW.width) - x, height: Math.min(box.y + box.height, VIEW.height) - y };
    await s.moveTo(VIEW.width - 2, VIEW.height - 2);
    await delay(300);
    const points = [];
    for (const [i, spec] of markers.entries()) {
      // Whole-app shots are shown much smaller in the Guide: leave more room beside a label.
      const c = await s.evaluate(`${FIND}(${JSON.stringify({ gap: clip ? 14 : 34, ...spec })})`);
      if (!c) throw new Error(`${id}: marker ${i + 1} not found (${JSON.stringify(spec)})`);
      const fx = (c.x - box.x) / box.width;
      const fy = (c.y - box.y) / box.height;
      if (fx < -0.05 || fx > 1.05 || fy < -0.05 || fy > 1.05) throw new Error(`${id}: marker ${i + 1} is outside the image (${round(fx)}, ${round(fy)})`);
      // A marker beside a label at the very edge is pulled just inside the image.
      const clamp = (v) => Math.min(0.975, Math.max(0.025, v));
      points.push({ n: i + 1, x: round(clamp(fx)), y: round(clamp(fy)) });
    }
    await s.screenshot(join(IMAGE_DIR, `${id}.webp`), { clip: box, format: 'webp', quality: QUALITY, scale });
    results[id] = { src: `/guide/${id}.webp`, width: Math.round(box.width * scale), height: Math.round(box.height * scale), markers: points };
    done.push(id);
    console.log(`PASS  ${id}  (${points.length} markers)`);
  }

  /** Run one capture; a failure is reported and the others still run. */
  async function step(id, fn) {
    if (!want(id)) return;
    try {
      await fn();
    } catch (e) {
      failed.push(id);
      console.log(`FAIL  ${id}  ${e instanceof Error ? e.message : e}`);
      await s.screenshot(`FAIL-${id}.png`).catch(() => {});
    }
  }

  /** Window height for one capture (the Transform preview is long); restored by tall(null). */
  async function tall(height) {
    const h = height ?? s.viewport.height;
    await s.page.send('Emulation.setDeviceMetricsOverride', { width: s.viewport.width, height: h, deviceScaleFactor: 1, mobile: false });
    VIEW.height = h;
    await delay(500);
  }

  const rail = (label) => ({ text: label, within: '.sgl-sidenav-strip' });
  const clickText = async (text, within) => {
    const ok = await s.evaluate(`${FIND}(${JSON.stringify({ text, within, scroll: true, at: 'center' })})`);
    if (!ok) throw new Error(`no "${text}" to click`);
    await s.clickAt(ok.x, ok.y);
    await delay(400);
  };
  const clickNode = async (id) => {
    const c = await s.evaluate(`${FIND}(${JSON.stringify({ node: id, at: 'center' })})`);
    if (!c) throw new Error(`no node ${id}`);
    await s.clickAt(c.x, c.y);
    await delay(400);
  };

  // ── How to… (without a toolkit: the built-in example) ──────────────────────────────────────────
  await step('howto-start', async () => {
    await gotoWelcome(s);
    await shot('howto-start', {
      markers: [
        { text: 'Create project', within: '.sgl-welcome', at: 'corner' },
        { text: 'Open project', within: '.sgl-welcome', at: 'corner' },
        { text: 'Open example…', within: '.sgl-welcome', at: 'corner' },
        { text: 'Recent', within: '.sgl-welcome' },
      ],
    });
  });

  await step('howto-open-example', async () => {
    await gotoWelcome(s);
    await clickText('Open example…', '.sgl-welcome');
    await s.waitFor(`document.querySelectorAll('.sgl-example').length > 1`, 10_000, 'the examples');
    await delay(300);
    await shot('howto-open-example', {
      markers: [
        // The button is under the dialog: point at the dialog it opened.
        { text: 'Open example', within: '.sgl-open-example' },
        { text: 'House showcase', within: '.sgl-open-example' },
      ],
    });
    await s.key('Escape');
  });

  await step('howto-select-inspect', async () => {
    await openBuiltInExample(s);
    await selectNode(s, 2);
    await shot('howto-select-inspect', {
      markers: [{ node: 2 }, { sel: '.view-panel[data-panel="1"] canvas' }, { text: 'Properties', within: '#sidebar-panel-properties' }],
    });
  });

  await step('howto-add-room', async () => {
    await openWithToolkit(s, 'house');
    await clickText('+ Add node');
    await s.waitFor(`__sgl.nodes().length === 6`, 10_000, 'room 6');
    await selectNode(s, 6);
    // Give it a Function (one command), as step 2 says.
    await s.evaluate(`(() => { const sel = [...document.querySelectorAll('#sidebar-panel-properties select')].find((x) => [...x.options].some((o) => o.value === 'circulation')); if (!sel) return false; __sgl.setValue(sel, 'circulation'); return true; })()`);
    await delay(500);
    await shot('howto-add-room', {
      markers: [{ text: '+ Add node' }, { text: 'Function', within: '#sidebar-panel-properties', up: 1 }, { text: 'Position', within: '#sidebar-panel-properties' }],
    });
  });

  await step('howto-connect', async () => {
    await openBuiltInExample(s);
    await selectNode(s, 1);
    await clickText('Add connection');
    await clickNode(5);
    await s.waitFor(`__sgl.edgeIds().length === 5`, 10_000, 'the new relationship');
    await selectEdge(s, 5);
    await shot('howto-connect', {
      markers: [{ node: 1 }, { text: 'Add connection' }, { node: 5 }, { text: 'Access', within: '#sidebar-panel-properties', at: 'corner' }],
    });
  });

  await step('howto-query', async () => {
    await openBuiltInExample(s);
    await openRail(s, 'Analyse');
    await clickText('Queries', '#sidebar-panel-analyse');
    await clickText('Shortest path', '#sidebar-panel-analyse');
    await clickNode(1);
    await clickNode(5);
    await s.waitFor(`/steps from 1 to 5/.test(document.querySelector('#sidebar-panel-analyse')?.innerText ?? '')`, 10_000, 'the route');
    await shot('howto-query', {
      markers: [
        { text: 'Queries', within: '#sidebar-panel-analyse' },
        { text: 'Shortest path', within: '#sidebar-panel-analyse' },
        { node: 1 },
        { node: 5 },
        { contains: 'steps from 1 to 5', within: '#sidebar-panel-analyse' },
      ],
    });
  });

  await step('howto-read-data-view', async () => {
    await openBuiltInExample(s);
    await setViewMode(s, 1, 'data');
    await clickText('Table', '.view-panel[data-panel="1"]');
    await selectNode(s, 2);
    await shot('howto-read-data-view', {
      markers: [
        { sel: '.view-panel[data-panel="1"] select' },
        { text: 'Table', within: '.view-panel[data-panel="1"]' },
        { text: 'living', within: '.view-panel[data-panel="1"]' },
        { text: 'Identity', within: '.view-panel[data-panel="1"] table' },
      ],
    });
  });

  await step('howto-save', async () => {
    await openBuiltInExample(s);
    await openRail(s, 'Project');
    await shot('howto-save', {
      markers: [rail('Project'), { text: 'Save locally', within: '#sidebar-panel-project' }, { text: 'Export project', within: '#sidebar-panel-project' }, { text: 'Open project', within: '#sidebar-panel-project' }],
    });
  });

  // ── With the House toolkit ─────────────────────────────────────────────────────────────────────
  const withHouse = async () => {
    await openWithToolkit(s, 'house');
  };

  await step('howto-add-attribute', async () => {
    await withHouse();
    await selectNode(s, 2);
    await openRail(s, 'Attributes');
    await clickText('+ Add attribute', '#sidebar-panel-attributes');
    await shot('howto-add-attribute', {
      markers: [rail('Attributes'), { text: '+ Add attribute', within: '#sidebar-panel-attributes' }, { text: 'Custom attribute' }, { text: 'Custom', within: '#sidebar-panel-properties' }],
    });
    await s.key('Escape');
  });

  await step('howto-run-analysis', async () => {
    await withHouse();
    await selectNode(s, 2);
    await openRail(s, 'Analyse');
    await clickText('Degree', '#sidebar-panel-analyse');
    await s.waitFor(`/edges at node 2/.test(document.querySelector('#sidebar-panel-analyse')?.innerText ?? '')`, 10_000, 'the Degree result');
    await shot('howto-run-analysis', {
      markers: [{ node: 2 }, rail('Analyse'), { text: 'Degree', within: '#sidebar-panel-analyse' }, { text: 'edges at node 2', within: '#sidebar-panel-analyse' }, { text: 'Clear', within: '#sidebar-panel-analyse' }],
    });
  });

  await step('howto-transform-undo', async () => {
    await withHouse();
    await tall(1150);
    await openRail(s, 'Transform');
    await clickText('Run', '#sidebar-panel-transform');
    await s.waitFor(`/rooms grown/.test(document.querySelector('#sidebar-panel-transform')?.innerText ?? '')`, 15_000, 'the preview');
    await shot('howto-transform-undo', {
      markers: [
        rail('Transform'),
        { text: 'Grow to target area', within: '#sidebar-panel-transform' },
        { text: 'Run', within: '#sidebar-panel-transform' },
        { contains: 'Living 2:', within: '#sidebar-panel-transform' },
        { text: 'Apply', within: '#sidebar-panel-transform' },
        { expr: '__sgl.undoButton()' },
      ],
    });
    await tall(null);
  });

  await step('howto-upload-analysis', async () => {
    await withHouse();
    await openRail(s, 'Analyse');
    const info = await s.evaluate(`(() => { const up = ${FIND}({ text: 'Upload your own (.ts)', within: '#sidebar-panel-analyse' }); return up; })()`);
    if (!info) throw new Error('no upload button');
    // The ⓘ right of the upload button.
    const btn = await s.evaluate(`(() => { const p = document.querySelector('#sidebar-panel-analyse'); const b = [...p.querySelectorAll('button')].find((x) => /about|ⓘ|info/i.test((x.getAttribute('aria-label') ?? '') + x.textContent) && x.getBoundingClientRect().y < ${info.y + 20}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!btn) throw new Error('no ⓘ beside the upload button');
    await s.clickAt(btn.x, btn.y);
    await delay(400);
    await shot('howto-upload-analysis', {
      clip: '#sidebar-panel-analyse',
      markers: [{ text: 'Upload your own (.ts)', within: '#sidebar-panel-analyse' }, { pt: true, expr: `document.elementFromPoint(${btn.x}, ${btn.y})` }, { text: 'Node', within: '#sidebar-panel-analyse' }],
    });
  });

  // ── Panels (House toolkit, Living room selected) ───────────────────────────────────────────────
  if (['panel-properties', 'panel-attributes', 'panel-designer', 'panel-analyse', 'panel-transform', 'panel-camera', 'panel-display', 'panel-project', 'panel-scenarios'].some(want)) {
    await withHouse();
    await selectNode(s, 2);
  }
  const P = (id) => `#sidebar-panel-${id}`;

  await step('panel-properties', async () => {
    await openRail(s, 'Properties');
    await shot('panel-properties', {
      clip: P('properties'),
      markers: [{ sel: `${P('properties')} .sgl-title` }, { text: 'Required by the app', within: P('properties') }, { text: 'Geometry', within: P('properties') }, { text: 'Custom', within: P('properties') }],
    });
  });
  await step('panel-attributes', async () => {
    await openRail(s, 'Attributes');
    await shot('panel-attributes', {
      clip: P('attributes'),
      markers: [{ text: 'Node', within: P('attributes') }, { text: 'Identity', within: P('attributes') }, { text: '+ Add attribute', within: P('attributes') }],
    });
  });
  await step('panel-designer', async () => {
    await openRail(s, 'Building Designer');
    await shot('panel-designer', {
      clip: P('designer'),
      markers: [{ text: 'Style rooms by', within: P('designer') }, { text: 'Default', within: P('designer') }, { text: '+ Style another function', within: P('designer') }, { text: 'Corridors', within: P('designer') }],
    });
  });
  await step('panel-analyse', async () => {
    // The Edge section lists four analyses at the start (2026-11-20): a taller window keeps Network and Queries in view.
    await tall(960);
    await openRail(s, 'Analyse');
    await shot('panel-analyse', {
      clip: P('analyse'),
      markers: [
        { text: 'Upload your own (.ts)', within: P('analyse') },
        { text: 'Show:', within: P('analyse') },
        { text: 'Node', within: P('analyse') },
        { text: 'Edge', within: P('analyse') },
        { text: 'Network', within: P('analyse') },
        { text: 'Queries', within: P('analyse') },
      ],
    });
    await tall(null);
  });
  await step('panel-transform', async () => {
    await tall(1150);
    await openRail(s, 'Transform');
    await clickText('Run', P('transform'));
    await s.waitFor(`/rooms grown/.test(document.querySelector('${P('transform')}')?.innerText ?? '')`, 15_000, 'the preview');
    await shot('panel-transform', {
      clip: P('transform'),
      markers: [
        { text: 'Grow to target area', within: P('transform') },
        { text: 'Houses', within: P('transform') },
        { text: 'Run', within: P('transform') },
        { contains: 'Living 2:', within: P('transform') },
        { text: 'Apply', within: P('transform') },
      ],
    });
    await clickText('Discard', P('transform')).catch(() => {});
    await tall(null);
  });
  await step('panel-camera', async () => {
    await openRail(s, 'Camera');
    await shot('panel-camera', {
      clip: P('camera'),
      markers: [{ text: 'Target viewport', within: P('camera') }, { text: 'Save current view', within: P('camera') }, { text: 'Saved cameras', within: P('camera') }],
    });
  });
  await step('panel-display', async () => {
    await openRail(s, 'Display');
    await shot('panel-display', {
      clip: P('display'),
      markers: [{ text: 'Graph 2D', within: P('display') }, { text: 'Labels', within: P('display') }, { text: 'Colours', within: P('display') }],
    });
  });
  await step('panel-project', async () => {
    await openRail(s, 'Project');
    await shot('panel-project', {
      clip: P('project'),
      markers: [
        { text: 'Save locally', within: P('project') },
        { text: 'Export project', within: P('project') },
        { text: 'Open project', within: P('project') },
        { text: 'New project', within: P('project') },
        { text: 'Open example…', within: P('project') },
      ],
    });
  });
  await step('panel-scenarios', async () => {
    await openRail(s, 'Scenarios');
    await clickText('+ New scenario', P('scenarios'));
    await s.evaluate(`(() => { const i = document.querySelector('dialog[open] input[type="text"], dialog[open] input:not([type])'); if (i) __sgl.setValue(i, 'Grown'); return !!i; })()`);
    await clickText('Create scenario');
    await delay(600);
    await shot('panel-scenarios', {
      clip: P('scenarios'),
      markers: [{ text: 'Scenario 1', within: P('scenarios') }, { text: 'Grown', within: P('scenarios') }, { text: '+ New scenario', within: P('scenarios') }],
    });
  });

  // Keep the stored order stable (entry ids sorted).
  const sorted = Object.fromEntries(Object.keys(results).sort().map((k) => [k, results[k]]));
  writeFileSync(JSON_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\n${done.length} captured, ${failed.length} failed${failed.length ? `: ${failed.join(', ')}` : ''}. Images: public/guide/; markers: app/ui/guide/screenshots.json`);
  if (s.consoleErrors.length) console.log(`console errors:\n  ${s.consoleErrors.join('\n  ')}`);
  await s.close();
  return failed.length ? 1 : 0;
});
