// Run with: node --test scripts/smoke/lib.test.mjs
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { defaultOutDir, parseCliArgs, parseViewport, railId, resolveViewMode, urlWithToolkit, VIEW_MODES } from './app.mjs';
import { browserCandidates } from './cdp.mjs';
import { FEATURES, formatMarkdown, formatTable, isIgnorableConsoleError, overflowProblem, parseArgs, rectChanges, summarize, timestamp } from './lib.mjs';

test('parseArgs: defaults, env URL and options', () => {
  const { opts, errors } = parseArgs([], { SGL_SMOKE_URL: 'http://127.0.0.1:5181/' });
  assert.deepEqual(errors, []);
  assert.equal(opts.url, 'http://127.0.0.1:5181/');
  assert.equal(opts.headless, true);
  assert.equal(opts.features.size, 0);

  const r = parseArgs(['--url', 'http://localhost:4173/', '--feature', 'help', '--feature', 'v2', '--only', 'viewports, export', '--headed', '--timeout', '500'], {});
  assert.deepEqual(r.errors, []);
  assert.deepEqual([...r.opts.features], ['help', 'v2']);
  assert.deepEqual([...r.opts.only], ['viewports', 'export']);
  assert.equal(r.opts.headless, false);
  assert.equal(r.opts.timeout, 500);
  assert.deepEqual([...parseArgs(['--feature', 'all'], {}).opts.features], Object.keys(FEATURES));
});

test('parseArgs: readable errors', () => {
  assert.match(parseArgs(['--feature', 'nope'], {}).errors[0], /unknown feature "nope"/);
  assert.match(parseArgs(['--url'], {}).errors[0], /--url needs a value/);
  assert.match(parseArgs(['--url', 'ftp://x'], {}).errors[0], /http/);
  assert.match(parseArgs(['--url', 'not a url'], {}).errors[0], /not a valid URL/);
  assert.match(parseArgs(['--bogus'], {}).errors[0], /unknown argument/);
  assert.match(parseArgs(['--timeout', '-1'], {}).errors[0], /positive/);
});

test('rectChanges reports measured differences beyond the tolerance', () => {
  const a = { sidebar: { x: 0, y: 0, width: 320, height: 600 }, panel: { x: 0, y: 0, width: 500, height: 600 } };
  assert.deepEqual(rectChanges(a, structuredClone(a)), []);
  const b = { sidebar: { x: 0, y: 0, width: 344, height: 600.5 }, panel: null };
  assert.deepEqual(rectChanges(a, b), ['sidebar.width 320 → 344 (+24)', 'panel disappeared']);
});

test('overflowProblem detects page scroll in either direction', () => {
  assert.equal(overflowProblem({ scrollWidth: 1366, clientWidth: 1366, scrollHeight: 768, clientHeight: 768 }), null);
  assert.match(overflowProblem({ scrollWidth: 1400, clientWidth: 1366, scrollHeight: 900, clientHeight: 768 }), /horizontal.*vertical/);
});

test('reports: summary, table and markdown', () => {
  const results = [
    { id: 'a', status: 'PASS', message: 'ok' },
    { id: 'b|c', status: 'FAIL', message: 'bad\nthing' },
    { id: 'd', status: 'SKIP', message: 'later' },
  ];
  assert.deepEqual(summarize(results), { PASS: 1, FAIL: 1, SKIP: 1 });
  assert.match(formatTable(results), /1 passed, 1 failed, 1 skipped/);
  const md = formatMarkdown({ url: 'u', browser: 'b', started: 's', features: [] }, results);
  assert.match(md, /\*\*FAIL\*\*/);
  assert.match(md, /b\\\|c/);
  assert.doesNotMatch(md, /bad\nthing/);
});

test('only the favicon 404 is ignored among console errors', () => {
  assert.equal(isIgnorableConsoleError('network: Failed to load resource: 404 (Not Found) (http://localhost:5180/favicon.ico)'), true);
  assert.equal(isIgnorableConsoleError('network: Failed to load resource: 404 (http://localhost:5180/app.js)'), false);
  assert.equal(isIgnorableConsoleError('exception: TypeError at favicon.ico handler'), false);
});

test('timestamp and browser candidates', () => {
  assert.equal(timestamp(new Date(2026, 10, 5, 9, 3, 7)), '20261105-090307');
  const win = browserCandidates({ 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF' }, 'win32');
  assert.ok(win[0].endsWith('msedge.exe'));
  assert.ok(browserCandidates({}, 'linux').every((p) => p.startsWith('/')));
});

// ── app.mjs pure helpers (the shared browser-driving module) ──────────────────────────────────

test('app.mjs: viewport, view mode and rail names', () => {
  assert.deepEqual(parseViewport('1366x768'), { width: 1366, height: 768 });
  assert.deepEqual(parseViewport(' 1280×720 '), { width: 1280, height: 720 });
  assert.equal(parseViewport('big'), null);
  assert.equal(resolveViewMode('building'), 'architecture');
  assert.equal(resolveViewMode('Graph 2D'), 'graph2d');
  assert.equal(resolveViewMode('plan'), 'plan');
  assert.throws(() => resolveViewMode('sections'), /unknown view mode/);
  assert.deepEqual(VIEW_MODES, ['graph2d', 'graph3d', 'voxels', 'architecture', 'plan', 'data']);
  assert.equal(railId('Building Designer'), 'designer');
  assert.equal(railId('Designer'), 'designer');
  assert.equal(railId('Analyse'), 'analyse');
  assert.equal(railId('properties'), 'properties');
  assert.throws(() => railId('Algorithms'), /unknown destination/);
});

test('app.mjs: command line, toolkit URL and output folder', () => {
  const d = parseCliArgs([], { name: 'walls', url: 'http://localhost:5306/', viewport: '1280x720' });
  assert.deepEqual(d.errors, []);
  assert.equal(d.opts.url, 'http://localhost:5306/');
  assert.deepEqual(d.opts.viewport, { width: 1280, height: 720 });
  assert.match(d.opts.out, /spatial-graph-lab-walls/);
  const r = parseCliArgs(['--url', 'http://127.0.0.1:5390/', '--viewport', '1366x768', '--headed', '--out', 'x'], {});
  assert.deepEqual(r.errors, []);
  assert.equal(r.opts.headless, false);
  assert.deepEqual(r.opts.viewport, { width: 1366, height: 768 });
  assert.match(parseCliArgs(['--viewport', 'huge'], {}).errors[0], /--viewport/);
  assert.match(parseCliArgs(['--nope'], {}).errors[0], /unknown argument/);
  assert.equal(parseCliArgs([], { env: { SGL_SMOKE_URL: 'http://localhost:4173/' } }).opts.url, 'http://localhost:4173/');
  assert.equal(urlWithToolkit('http://localhost:5390/?a=1', 'house'), 'http://localhost:5390/?a=1&toolkit=house');
  assert.match(defaultOutDir('gate-i1', new Date(2026, 10, 19, 8, 5, 3)), /spatial-graph-lab-gate-i1[\\/]20261119-080503$/);
});
