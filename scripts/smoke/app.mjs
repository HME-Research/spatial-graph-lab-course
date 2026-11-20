// Shared browser-driving helpers for the Spatial Graph Lab smoke scripts (workflow.mjs, walls.mjs,
// gate-i1.mjs) and other tools that drive the real app (for example guide screenshots).
// See scripts/smoke/README.md, section "Shared helper module (app.mjs)".
//
// Safety (same rules as smoke.mjs): it never starts or stops Node/Vite (the app must already run at
// `url`), it launches ONE private headless browser with a throw-away profile and only ever closes
// that process, and it never writes into the repository: output defaults to the OS temp dir.
// Imports read repository files (the example designs) but never change them.
//
// Only Node >= 22 built-ins; no dependencies.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser, launch } from './cdp.mjs';
import { isIgnorableConsoleError, timestamp } from './lib.mjs';

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Repository root (read-only use: design files to import). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The built-in example (Welcome → Open example… → House – graph only): 5 rooms, 4 relationships, no toolkit. */
export const EXAMPLE_DESIGN_FILE = join(REPO_ROOT, 'app', 'document', 'examples', 'house.json');
/** The house toolkit's design (the same house), opened with `?toolkit=house`. */
export const HOUSE_DESIGN_FILE = join(REPO_ROOT, 'toolkits', 'house', 'designs', 'house.json');

// ── pure helpers (unit-tested in lib.test.mjs) ───────────────────────────────────────────────────

/** View mode ids of a viewport panel, in menu order. `building` is accepted as an alias of `architecture`. */
export const VIEW_MODES = ['graph2d', 'graph3d', 'voxels', 'architecture', 'plan', 'data'];
const VIEW_MODE_ALIASES = { building: 'architecture', 'graph 2d': 'graph2d', 'graph 3d': 'graph3d' };

/** The real view-mode id for `mode` (id, alias or visible label); throws for an unknown one. */
export function resolveViewMode(mode) {
  const m = String(mode).trim().toLowerCase();
  const id = VIEW_MODE_ALIASES[m] ?? m;
  if (!VIEW_MODES.includes(id)) throw new Error(`unknown view mode "${mode}" (known: ${VIEW_MODES.join(', ')}, building)`);
  return id;
}

/**
 * Left-rail destinations (id → visible label) plus the right-hand Properties pane.
 * Labels are the app's own (`app/ui/labels.ts`).
 */
export const RAIL = {
  project: 'Project',
  attributes: 'Attributes',
  designer: 'Building Designer',
  analyse: 'Analyse',
  transform: 'Transform',
  scenarios: 'Scenarios',
  camera: 'Camera',
  display: 'Display',
  properties: 'Properties',
};

/** The rail id for a label or id ("Designer", "Building Designer", "designer", "Properties"…); throws when unknown. */
export function railId(label) {
  const l = String(label).trim().toLowerCase();
  if (l === 'designer' || l === 'building designer') return 'designer';
  if (l === 'analyze') return 'analyse';
  const hit = Object.entries(RAIL).find(([id, text]) => id === l || text.toLowerCase() === l);
  if (!hit) throw new Error(`unknown destination "${label}" (known: ${Object.values(RAIL).join(', ')})`);
  return hit[0];
}

/** "1366x768" → { width: 1366, height: 768 }, or null. */
export function parseViewport(text) {
  const m = /^\s*(\d{3,5})\s*[x×]\s*(\d{3,5})\s*$/i.exec(String(text ?? ''));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** Default output folder: `<temp>/spatial-graph-lab-<name>/<timestamp>` (never inside the repository). */
export const defaultOutDir = (name, date = new Date()) => join(tmpdir(), `spatial-graph-lab-${name}`, timestamp(date));

/**
 * Command line of a smoke script: `--url`, `--viewport WxH`, `--out DIR`, `--browser PATH`,
 * `--headed`, `--timeout MS`, `--help`. Returns `{ opts, errors }`; never exits.
 */
export function parseCliArgs(argv, { name = 'smoke', url = 'http://localhost:5180/', viewport = '1366x768', env = {} } = {}) {
  const opts = { url: env.SGL_SMOKE_URL || url, viewport: parseViewport(viewport), out: null, browser: null, headless: true, timeout: 10_000, help: false };
  const errors = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) {
        errors.push(`${a} needs a value`);
        return null;
      }
      return v;
    };
    switch (a) {
      case '--url': {
        const v = value();
        if (v) opts.url = v;
        break;
      }
      case '--viewport': {
        const v = value();
        const vp = v && parseViewport(v);
        if (vp) opts.viewport = vp;
        else if (v) errors.push(`--viewport must look like 1366x768: ${v}`);
        break;
      }
      case '--out':
        opts.out = value();
        break;
      case '--browser':
        opts.browser = value();
        break;
      case '--headed':
        opts.headless = false;
        break;
      case '--timeout': {
        const v = Number(value());
        if (Number.isFinite(v) && v > 0) opts.timeout = v;
        else errors.push('--timeout needs a positive number of milliseconds');
        break;
      }
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        errors.push(`unknown argument "${a}"`);
    }
  }
  try {
    const u = new URL(opts.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') errors.push(`--url must be http(s): ${opts.url}`);
  } catch {
    errors.push(`--url is not a valid URL: ${opts.url}`);
  }
  opts.out = resolve(opts.out ?? defaultOutDir(name));
  return { opts, errors };
}

/** `url` with `?toolkit=<id>` set (other parameters kept). */
export function urlWithToolkit(url, toolkitId) {
  const u = new URL(url);
  u.searchParams.set('toolkit', toolkitId);
  return u.toString();
}

// ── page-side helpers (installed on every document as window.__sgl) ─────────────────────────────

const PAGE_HELPERS = `
window.__sgl = {
  visible(el) { if (!el) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; },
  setValue(el, v) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    if (!(el instanceof HTMLSelectElement)) el.dispatchEvent(new Event('change', { bubbles: true }));
  },
  enter(el) {
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
  },
  /** First visible clickable element whose text starts with (or aria-label equals) \`text\`. */
  byText(text, scope = document) {
    const all = [...scope.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"], a, summary, label')].filter((b) => this.visible(b));
    const t = (b) => b.textContent.replace(/\\s+/g, ' ').trim();
    return all.find((b) => t(b) === text) ?? all.find((b) => t(b).startsWith(text)) ?? all.find((b) => b.getAttribute('aria-label') === text) ?? null;
  },
  /** CSS selector first (when it is valid and matches), then text. */
  find(target, scope = document) {
    try { const el = scope.querySelector(target); if (el) return el; } catch {}
    return this.byText(target, scope);
  },
  click(text, scope = document) {
    const b = this.byText(text, scope);
    if (!b) return 'missing';
    if (b.disabled) return 'disabled';
    b.click();
    return 'clicked';
  },
  panel(i) { return document.querySelector('.view-panel[data-panel="' + i + '"]'); },
  /** The first panel that shows Graph 2D (the diagram), or null. */
  graphPanel() { return document.querySelector('.view-panel[data-view="graph2d"]:not([hidden])') ?? document.querySelector('.view-panel[data-view="graph2d"]'); },
  nodes() { return [...(this.graphPanel()?.querySelectorAll('.react-flow__node') ?? [])].map((n) => n.getAttribute('data-id')); },
  edgeIds() { return [...(this.graphPanel()?.querySelectorAll('.react-flow__edge') ?? [])].map((e) => e.getAttribute('data-id')).filter(Boolean).sort(); },
  undoButton() { return document.querySelectorAll('.history-actions button')[0] ?? null; },
  redoButton() { return document.querySelectorAll('.history-actions button')[1] ?? null; },
  undoTitle() { return this.undoButton()?.getAttribute('aria-label') ?? ''; },
  redoTitle() { return this.redoButton()?.getAttribute('aria-label') ?? ''; },
  canUndo() { const b = this.undoButton(); return !!b && !b.disabled; },
  canRedo() { const b = this.redoButton(); return !!b && !b.disabled; },
  props() { return document.querySelector('#sidebar-panel-properties')?.innerText ?? ''; },
  railPanel(id) { return document.querySelector('#sidebar-panel-' + id); },
  railText(id) { return this.railPanel(id)?.innerText ?? ''; },
  // Geometry in Properties: ONE Position row and ONE Size row, each with three value fields x | y | z.
  GEO: { position: ['position.x', 'position.y', 'position.z'], size: ['size.x', 'size.y', 'size.z'] },
  geo(id) { return (document.querySelector('#sidebar-panel-properties') ?? document).querySelector('.sgl-axis-value[data-axis="' + id + '"] input'); },
  triple(part) { return this.GEO[part].map((id) => Number(this.geo(id)?.value)); },
  /** One edit per changed axis (each is its own command and undo step). Returns the number of edits sent. */
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
  modeSelect(i) { return document.querySelector('select[aria-label="View shown in panel ' + (i + 1) + '"]'); },
  panelMode(i, mode) { const s = this.modeSelect(i); if (!s) return null; if (mode && s.value !== mode) this.setValue(s, mode); return s.value; },
  legendCount(i, id) {
    const el = this.panel(i)?.querySelector('[data-legend-item="' + id + '"] .sgl-pres-count');
    return el ? Number(el.textContent.replace(/[^0-9]/g, '')) : 0;
  },
  planOpenings(i) {
    const p = this.panel(i)?.querySelector('svg[data-view-surface="plan"]');
    return p ? [...p.querySelectorAll('.sgl-plan-openings [data-edge-id]')].map((e) => ({ edge: e.dataset.edgeId, face: e.dataset.faceId, cls: e.getAttribute('class') })) : null;
  },
  wallPanel(i) {
    const el = this.panel(i)?.querySelector('.sgl-wall-panel');
    return el ? { face: el.dataset.wallFace, state: el.dataset.wallState, edge: el.dataset.wallEdge ?? null, opening: el.dataset.wallOpening ?? null, text: el.innerText } : null;
  },
  canvas(i) { return this.panel(i)?.querySelector('canvas[data-camera-pose]') ?? null; },
  pose(i) { return this.canvas(i)?.dataset.cameraPose ?? null; },
  wallHover(i) { return this.panel(i)?.querySelector('[data-wall-hover]')?.dataset.wallHover ?? null; },
  rect(el) { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; },
  overflow() { const d = document.documentElement, b = document.body; return { scrollWidth: Math.max(d.scrollWidth, b.scrollWidth), clientWidth: d.clientWidth, scrollHeight: Math.max(d.scrollHeight, b.scrollHeight), clientHeight: d.clientHeight }; },
  busy() { return !!document.querySelector('.project-bar[aria-busy="true"]'); },
};
true`;

// ── session ──────────────────────────────────────────────────────────────────────────────────────

/** Error that means "could not run" (no browser, no server): scripts exit with code 2. */
export class SetupError extends Error {}

/**
 * Launch a private headless browser at `viewport` and open `url`.
 * Returns a session object (see README). Throws SetupError when no browser or server is found.
 */
export async function openSession({ url, viewport = { width: 1366, height: 768 }, out = null, headless = true, browser: browserPath = null, navigate = true, log = () => {} } = {}) {
  const executable = findBrowser(browserPath);
  if (!executable) throw new SetupError('no Edge/Chromium found (use --browser <path>)');
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new SetupError(`cannot reach ${url}: ${e instanceof Error ? e.message : e} (start the app first; this script never starts servers)`);
  }
  const outDir = resolve(out ?? defaultOutDir('session'));
  const downloadDir = join(outDir, 'downloads');
  mkdirSync(downloadDir, { recursive: true });

  const { page, browser, close: closeBrowser, version } = await launch({ executable, headless, log });
  const consoleErrors = [];
  const ignoredConsole = [];
  const dialogs = [];
  /** Observations that are not check results (e.g. a worked-around app issue); printed by the runner. */
  const notes = [];
  const pushError = (text) => (isIgnorableConsoleError(text) ? ignoredConsole : consoleErrors).push(text);
  page.on('Runtime.exceptionThrown', (p) => pushError(`exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`));
  page.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') pushError(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
  });
  page.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') pushError(`${p.entry.source}: ${p.entry.text} (${p.entry.url ?? ''})`);
  });
  page.on('Page.javascriptDialogOpening', (p) => {
    dialogs.push(`${p.type}: ${p.message}`);
    void page.send('Page.handleJavaScriptDialog', { accept: true });
  });
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('DOM.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });

  async function evaluate(expression) {
    const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  /** Poll `predicateExpr` (a page expression) until truthy; returns its value. */
  async function waitFor(predicateExpr, timeoutMs = 10_000, what = predicateExpr.slice(0, 120)) {
    const end = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < end) {
      try {
        const v = await evaluate(predicateExpr);
        if (v) return v;
      } catch (e) {
        last = e;
      }
      await delay(100);
    }
    throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}${last ? ` (${last.message})` : ''}`);
  }
  const mouse = (type, x, y, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
  async function moveTo(x, y) {
    await mouse('mouseMoved', x, y, { button: 'none' });
  }
  async function clickAt(x, y, { button = 'left', settle = 200 } = {}) {
    const buttons = button === 'right' ? 2 : 1;
    await moveTo(x, y);
    await mouse('mousePressed', x, y, { button, buttons });
    await mouse('mouseReleased', x, y, { button, buttons: 0 });
    await delay(settle);
  }
  async function drag(x, y, dx, dy, { steps = 14, settle = 350 } = {}) {
    await moveTo(x, y);
    await mouse('mousePressed', x, y, { buttons: 1 });
    for (let i = 1; i <= steps; i++) {
      await mouse('mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps, { buttons: 1 });
      await delay(16);
    }
    await mouse('mouseReleased', x + dx, y + dy, { buttons: 0 });
    await delay(settle);
  }
  /** Bounding rect (CSS px) of the first match of `selector`, or null. */
  const rect = (selector) => evaluate(`__sgl.rect(document.querySelector(${JSON.stringify(selector)}))`);
  /**
   * Real pointer click on the element found by `target`: a CSS selector, else the visible
   * button/tab/label whose text starts with it (or whose aria-label equals it).
   * Options: `within` (CSS selector of a scope), `timeout`.
   */
  async function click(target, { within = null, timeout = 10_000, button = 'left' } = {}) {
    const scope = within ? `document.querySelector(${JSON.stringify(within)})` : 'document';
    const c = await waitFor(
      `(() => { const s = ${scope}; if (!s) return null; const el = __sgl.find(${JSON.stringify(target)}, s); if (!el || el.disabled) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`,
      timeout,
      `a clickable "${target}"${within ? ` in ${within}` : ''}`,
    );
    await clickAt(c.x, c.y, { button });
    return c;
  }
  /** Real pointer click on the element a page expression returns. */
  async function clickElement(finderExpr, what = finderExpr.slice(0, 80), timeout = 10_000) {
    const c = await waitFor(
      `(() => { const el = (${finderExpr}); if (!el || el.disabled) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`,
      timeout,
      what,
    );
    await clickAt(c.x, c.y);
    return c;
  }
  async function key(keyName, { modifiers = 0, code = keyName } = {}) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, modifiers });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, modifiers });
  }
  /**
   * Screenshot to `filePath` (relative paths go into the output folder). Options: `clip` ({x,y,width,height}
   * in CSS px, or a CSS selector), `format` ('png' | 'webp' | 'jpeg'), `quality` (webp/jpeg), `scale`
   * (e.g. 0.75 for a smaller image; without a clip the whole viewport is scaled).
   * Returns { file, data } (data = base64).
   */
  async function screenshot(filePath, { clip = null, format = null, quality, scale = 1 } = {}) {
    const file = isAbsolute(filePath) ? filePath : join(outDir, filePath);
    const fmt = format ?? (/\.webp$/i.test(file) ? 'webp' : /\.jpe?g$/i.test(file) ? 'jpeg' : 'png');
    const box = (typeof clip === 'string' ? await rect(clip) : clip) ?? (scale !== 1 ? { x: 0, y: 0, width: viewport.width, height: viewport.height } : null);
    if (typeof clip === 'string' && !box) throw new Error(`screenshot clip: nothing matches ${clip}`);
    const { data } = await page.send('Page.captureScreenshot', {
      format: fmt,
      ...(quality !== undefined && fmt !== 'png' && { quality }),
      ...(box && { clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale } }),
    });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(data, 'base64'));
    return { file, data };
  }
  /** Put `paths` into the file input matching `selector` (an import / Open project). */
  async function setFiles(selector, paths) {
    const { root } = await page.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`no element matches ${selector}`);
    await page.send('DOM.setFileInputFiles', { nodeId, files: [paths].flat() });
  }
  /** Load `target` (default: the session URL) and wait until the document is complete. */
  async function goto(target = url) {
    await page.send('Page.navigate', { url: target });
    await waitFor(`document.readyState === 'complete' && !!window.__sgl`, 20_000, `${target} to load`);
  }
  let downloads = 0;
  /** Run `trigger()` and wait for one new file in the download folder; returns its path (renamed uniquely). */
  async function download(trigger, { timeout = 10_000, ext = '.json' } = {}) {
    const before = new Set(readdirSync(downloadDir));
    await trigger();
    for (const end = Date.now() + timeout; Date.now() < end; ) {
      const name = readdirSync(downloadDir).find((x) => !before.has(x) && x.endsWith(ext));
      if (name) {
        await delay(250);
        const file = join(downloadDir, `${String(++downloads).padStart(2, '0')}-${name}`);
        renameSync(join(downloadDir, name), file);
        return file;
      }
      await delay(150);
    }
    throw new Error('no download arrived');
  }
  /** Write a scratch file into the output folder (never the repository); returns its path. */
  function writeTemp(name, text) {
    const file = join(outDir, 'tmp', name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  }

  const session = {
    page,
    browser,
    url,
    viewport,
    out: outDir,
    downloadDir,
    version,
    consoleErrors,
    notes,
    ignoredConsole,
    dialogs,
    evaluate,
    waitFor,
    click,
    clickElement,
    clickAt,
    moveTo,
    drag,
    key,
    rect,
    screenshot,
    setFiles,
    goto,
    download,
    writeTemp,
    readJson: (file) => JSON.parse(readFileSync(file, 'utf8')),
    close: closeBrowser,
  };
  if (navigate) await goto(url);
  return session;
}

// ── app-level helpers ────────────────────────────────────────────────────────────────────────────

const WELCOME = '.sgl-welcome';

/**
 * Reload the app (session URL, or `target`) and wait for the Welcome screen, including its list of
 * saved projects. Fixed 2026-11-20: that list used to stay on "Looking for saved projects…" in a fresh
 * headless profile (IndexedDB held by a page frozen in the back/forward cache; see
 * `app/project/storage.ts`). It is now always answered, at worst with "Saved projects cannot be
 * listed" after a 5 s timeout; that message is recorded in `s.notes` (saving will not work then).
 */
export async function gotoWelcome(s, target = s.url) {
  await s.goto(target);
  await s.waitFor(`!!document.querySelector('${WELCOME}[open]') || !!document.querySelector('${WELCOME}')`, 20_000, 'the Welcome screen');
  await s.waitFor(`!document.querySelector('${WELCOME} .sgl-welcome-busy')`, 20_000, 'Welcome to be ready');
  await s.waitFor(`!/Looking for saved projects/.test(document.querySelector('${WELCOME}')?.innerText ?? '')`, 15_000, 'Welcome to list the saved projects');
  const unavailable = await s.evaluate(`document.querySelector('${WELCOME} .sgl-welcome-recent')?.innerText.match(/Saved projects cannot be listed.*/)?.[0] ?? null`);
  if (unavailable) s.notes.push(`Welcome: ${unavailable}`);
}

/** Wait until a project is shown: Welcome gone, `nodes` nodes in Graph 2D (or any number when null), toolkit activated. */
export async function waitForProject(s, nodes = null, timeout = 20_000) {
  await s.waitFor(
    `!document.querySelector('${WELCOME}') && document.querySelectorAll('.view-panel').length > 0 && ${nodes === null ? 'true' : `__sgl.nodes().length === ${nodes}`}`,
    timeout,
    `the project${nodes === null ? '' : ` with ${nodes} rooms`} in Graph 2D`,
  );
  await s.waitFor(`!__sgl.busy()`, timeout, 'the project to finish activating');
}

/** Welcome → Open example… → the built-in House row (the dialog lives outside Welcome). */
export async function pickBuiltInExample(s) {
  await s.click('Open example…', { within: WELCOME });
  await s.click('[data-example="built-in"]');
}

/** Welcome → Open example… → "House – graph only" (reloads first when no Welcome is shown); waits for the 5 rooms in Graph 2D. */
export async function openBuiltInExample(s) {
  if (!(await s.evaluate(`!!document.querySelector('${WELCOME}')`))) await gotoWelcome(s);
  await pickBuiltInExample(s);
  await waitForProject(s, 5);
  // A first-visit notice may cover the views: dismiss it when present.
  await dismissNotices(s);
  await ensureGraphEdges(s, 4);
}

/**
 * Wait until Graph 2D draws at least `expected` relationship edges; throws when it does not. Returns
 * true. Fixed 2026-11-20 (this helper used to remount the view as a workaround): right after a project
 * opened, Graph 2D sometimes drew its nodes but no edges (see `app/views/graph2d/handleRepair.ts`).
 */
export async function ensureGraphEdges(s, expected, timeout = 5000) {
  try {
    await s.waitFor(`__sgl.edgeIds().length >= ${expected}`, timeout, `${expected} edges in Graph 2D`);
  } catch (e) {
    throw new Error(`Graph 2D drew ${await s.evaluate('__sgl.edgeIds().length')} of ${expected} edges: ${e instanceof Error ? e.message : e}`);
  }
  return true;
}

/**
 * The house example WITH the house toolkit: loads `?toolkit=house` (any toolkit id works) and opens
 * the toolkit's design file through Welcome → Open project (a design file becomes a new project
 * that uses the requested toolkit). Waits for its 5 rooms.
 */
export async function openWithToolkit(s, toolkitId = 'house', designFile = join(REPO_ROOT, 'toolkits', toolkitId, 'designs', `${toolkitId}.json`)) {
  if (!existsSync(designFile)) throw new Error(`no design file ${designFile}`);
  await gotoWelcome(s, urlWithToolkit(s.url, toolkitId));
  await s.setFiles(`${WELCOME} input[type="file"]`, designFile);
  await waitForProject(s, null);
  await dismissNotices(s);
  await ensureGraphEdges(s, JSON.parse(readFileSync(designFile, 'utf8')).edges?.length ?? 0);
}

/**
 * Welcome → Create project (empty graph), optionally with a toolkit (the Welcome toolkit picker, or
 * `?toolkit=` when the picker is absent). Waits for the empty project.
 */
export async function createProject(s, { toolkit = null } = {}) {
  await gotoWelcome(s, toolkit ? urlWithToolkit(s.url, toolkit) : s.url);
  if (toolkit) {
    await s.evaluate(`(() => { const sel = [...document.querySelectorAll('${WELCOME} select')].find((x) => [...x.options].some((o) => o.value === ${JSON.stringify(toolkit)})); if (sel) __sgl.setValue(sel, ${JSON.stringify(toolkit)}); return true; })()`);
  }
  await s.click('Create project', { within: WELCOME });
  await waitForProject(s, null);
  await dismissNotices(s);
}

/** Close transient notices (import/first-visit) that may cover the workspace. */
export async function dismissNotices(s) {
  await s.evaluate(`document.querySelectorAll('.sgl-notice button[aria-label="Dismiss"], .sgl-notice button').forEach((b) => /dismiss|close|×/i.test(b.getAttribute('aria-label') ?? b.textContent) && b.click()); true`);
}

/**
 * Open a left-rail destination by label or id (Project, Attributes, Building Designer / Designer,
 * Analyse, Transform, Scenarios, Camera, Display) or the Properties pane. Returns the panel selector.
 */
export async function openRail(s, label) {
  const id = railId(label);
  const tab = `#sidebar-tab-${id}`;
  const panel = `#sidebar-panel-${id}`;
  // Expand a collapsed left pane first.
  if (id !== 'properties') {
    await s.evaluate(`(() => { const t = document.querySelector('${tab}'); if (!t || t.getBoundingClientRect().width === 0) document.querySelector('.left-pane-chevron[aria-label="Show project tools"]')?.click(); return true; })()`);
  }
  await s.waitFor(`!!document.querySelector('${tab}') || !!document.querySelector('${panel}')`, 10_000, `the ${label} destination`);
  const shown = await s.evaluate(`(() => { const p = document.querySelector('${panel}'); return !!p && !p.hidden && p.getBoundingClientRect().width > 0; })()`);
  if (!shown) {
    await s.evaluate(`document.querySelector('${tab}')?.click(); true`);
    await s.waitFor(`(() => { const p = document.querySelector('${panel}'); return !!p && !p.hidden && p.getBoundingClientRect().width > 0; })()`, 10_000, `the ${label} panel`);
  }
  return panel;
}

/** Show view `mode` (graph2d | graph3d | voxels | architecture (= building) | plan | data) in viewport `panelIndex` (0-based = data-panel). */
export async function setViewMode(s, panelIndex, mode) {
  const id = resolveViewMode(mode);
  const got = await s.evaluate(`__sgl.panelMode(${panelIndex}, '${id}')`);
  if (got !== id) throw new Error(`panel ${panelIndex} shows ${got} instead of ${id}`);
  if (id === 'plan') await s.waitFor(`Array.isArray(__sgl.planOpenings(${panelIndex}))`, 15_000, 'the Plan');
  else if (id === 'graph2d') await s.waitFor(`!!__sgl.panel(${panelIndex})?.querySelector('.react-flow')`, 15_000, 'Graph 2D');
  else if (id !== 'data') await s.waitFor(`!!__sgl.pose(${panelIndex}) && (__sgl.rect(__sgl.canvas(${panelIndex}))?.width ?? 0) > 50`, 20_000, `a 3D canvas in panel ${panelIndex}`);
  await delay(500);
}

/** Viewport layout 1, 2 or 4 (the header's "Viewport layout" group). */
export async function setLayout(s, n) {
  const ok = await s.evaluate(`(() => { const g = [...document.querySelectorAll('[role="group"][aria-label="Viewport layout"]')].find((x) => x.offsetParent !== null); const b = g && [...g.querySelectorAll('button')].find((x) => x.textContent.trim() === '${n}'); if (!b) return false; b.click(); return true; })()`);
  if (!ok) throw new Error(`no layout ${n} button`);
  await s.waitFor(`[...document.querySelectorAll('.view-panel')].filter((p) => !p.hidden).length === ${n}`, 10_000, `layout ${n}`);
  await delay(600);
}

/** Centre of node `id` in the Graph 2D panel, or null. */
export const nodeCenter = (s, id) =>
  s.evaluate(`(() => { const n = __sgl.graphPanel()?.querySelector('.react-flow__node[data-id="${id}"]'); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);

/**
 * Select room `id` with a real click on its Graph 2D node (a Graph 2D panel must be shown), then
 * show Properties and wait until it shows the room's Position fields.
 */
export async function selectNode(s, id) {
  const c = await s.waitFor(`(() => { const n = __sgl.graphPanel()?.querySelector('.react-flow__node[data-id="${id}"]'); if (!n) return null; const b = n.getBoundingClientRect(); return b.width > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`, 10_000, `node ${id} in Graph 2D`);
  await s.clickAt(c.x, c.y);
  await s.evaluate(`__sgl.graphPanel()?.querySelector('.sgl-popover button[aria-label="Close details"]')?.click(); true`);
  await openRail(s, 'properties');
  await s.waitFor(`!!__sgl.geo('position.x') && __sgl.graphPanel()?.querySelector('.react-flow__node.selected[data-id="${id}"]') !== null`, 10_000, `Properties of room ${id}`);
}

/** Select relationship `id` by clicking its Graph 2D edge (real click on the path's midpoint); waits for its Properties. */
export async function selectEdge(s, id) {
  const c = await s.waitFor(
    `(() => { const e = __sgl.graphPanel()?.querySelector('.react-flow__edge[data-id="${id}"]'); const p = e?.querySelector('path.react-flow__edge-interaction') ?? e?.querySelector('path'); if (!p) return null; const L = p.getTotalLength(); const pt = p.getPointAtLength(L / 2); const m = p.getScreenCTM(); return { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f }; })()`,
    10_000,
    `edge ${id} in Graph 2D`,
  );
  await s.clickAt(c.x, c.y);
  await openRail(s, 'properties');
  await s.waitFor(`!!__sgl.graphPanel()?.querySelector('.react-flow__edge.selected[data-id="${id}"]')`, 10_000, `edge ${id} selected`);
}

/** Click Undo / Redo in the header (real clicks). */
export const undo = (s) => s.clickElement(`__sgl.undoButton()`, 'the Undo button');
export const redo = (s) => s.clickElement(`__sgl.redoButton()`, 'the Redo button');

/** Select room `id` and set its Position (one command per changed axis); waits for the move to be recorded. */
export async function moveRoom(s, id, grid) {
  await selectNode(s, id);
  await s.evaluate(`__sgl.setTriple('position', ${JSON.stringify(grid)}); true`);
  await s.waitFor(`__sgl.triple('position').join(',') === ${JSON.stringify(grid.join(','))} && /Move room/.test(__sgl.undoTitle())`, 10_000, `room ${id} at [${grid}]`);
}

/**
 * Open the collapsible sections (`.sgl-csection-toggle`, e.g. Properties → "Relationships",
 * "In the building") inside `scope` whose title matches `title` (a string or RegExp source).
 */
export async function expandSection(s, scope, title) {
  const re = title instanceof RegExp ? title : new RegExp(String(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const n = await s.evaluate(
    `(() => { let n = 0; document.querySelectorAll(${JSON.stringify(`${scope} .sgl-csection-toggle`)}).forEach((b) => { if (new RegExp(${JSON.stringify(re.source)}, ${JSON.stringify(re.flags)}).test(b.textContent) && b.getAttribute('aria-expanded') !== 'true') { b.click(); n++; } }); return n; })()`,
  );
  if (n) await delay(250);
  return n;
}

/** Page overflow measurements (document vs viewport). */
export const pageOverflow = (s) => s.evaluate(`__sgl.overflow()`);

// ── step runner ──────────────────────────────────────────────────────────────────────────────────

export const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/**
 * PASS/FAIL step recorder for a session. `step(id, fn, { item })` runs `fn` (its return value is the
 * PASS message; a throw is a FAIL with a FAIL-<id>.png screenshot). `finish(extra)` writes
 * `<name>.json` into the output folder, closes the browser and returns the exit code (0 / 1).
 */
export function createRunner(s, name) {
  const results = [];
  async function step(id, fn, { item = null } = {}) {
    const tag = item === null ? '' : `[${item}] `;
    try {
      const message = await fn();
      results.push({ item, id, status: 'PASS', message: String(message ?? '') });
      console.log(`PASS  ${tag}${id}  ${message ?? ''}`);
      return true;
    } catch (e) {
      const shot = await s.screenshot(`FAIL-${id.replace(/[^a-z0-9-]+/gi, '_')}.png`).catch(() => null);
      const message = `${e instanceof Error ? e.message : String(e)}${shot ? ` (screenshot ${shot.file})` : ''}`;
      results.push({ item, id, status: 'FAIL', message });
      console.log(`FAIL  ${tag}${id}  ${message}`);
      return false;
    }
  }
  async function finish(extra = {}) {
    const failed = results.filter((r) => r.status === 'FAIL').length;
    writeFileSync(
      join(s.out, `${name}.json`),
      JSON.stringify({ url: s.url, viewport: `${s.viewport.width}x${s.viewport.height}`, browser: s.version, results, consoleErrors: s.consoleErrors, ignoredConsole: s.ignoredConsole, dialogs: s.dialogs, notes: s.notes, ...extra }, null, 2),
    );
    for (const n of s.notes) console.log(`NOTE  ${n}`);
    console.log(`\n${results.length - failed} passed, ${failed} failed — ${s.out}`);
    await s.close();
    return failed ? 1 : 0;
  }
  return { results, step, finish };
}

/**
 * Standard entry point of a smoke script: parse the command line, open a session, run `body(session)`
 * and exit 0 (no FAIL), 1 (a FAIL) or 2 (could not run).
 */
export async function runScript({ name, usage, url, viewport }, body) {
  const { opts, errors } = parseCliArgs(process.argv.slice(2), { name, url, viewport, env: process.env });
  if (opts.help) {
    console.log(usage);
    process.exit(0);
  }
  if (errors.length) {
    console.error(errors.map((e) => `error: ${e}`).join('\n'));
    console.error(`\n${usage}`);
    process.exit(2);
  }
  let s;
  try {
    s = await openSession({ url: opts.url, viewport: opts.viewport, out: opts.out, headless: opts.headless, browser: opts.browser });
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : e}`);
    process.exit(e instanceof SetupError ? 2 : 1);
  }
  console.log(`      ${s.version}; viewport ${opts.viewport.width}x${opts.viewport.height}; output ${s.out}\n`);
  try {
    const code = await body(s, opts);
    process.exit(code ?? 0);
  } catch (e) {
    console.error(`error: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
    await s.close().catch(() => {});
    process.exit(1);
  }
}
