// Pure helpers for the smoke harness (tested with `node --test scripts/smoke`).

export const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

/**
 * Optional checks that need features from other branches. They run only when requested with
 * `--feature <name>` (or `--feature all`); otherwise they are reported as SKIP, never as PASS.
 */
export const FEATURES = {
  help: 'Stage 07 HelpTip buttons ([data-help-topic]) wired into the shell/inspector',
  legend: 'Stage 07 RelationshipLegend ([data-legend-view]) wired into the views',
  'analysis-overlay': 'Stage 07 AnalysisLegend (.sgl-pres-analysis) shown after running an analysis with node values (Routes through it)',
  v2: 'Schema v2 document in the app (export writes schemaVersion 2; unresolved relationships drawn)',
};

export const USAGE = `Spatial Graph Lab browser smoke test (no dependencies; uses an installed Edge/Chromium).

Usage:
  node scripts/smoke/smoke.mjs --url http://localhost:5180/ [options]

The app must already be running (e.g. "npm run dev -- --port 5180 --strictPort" or
"npm run preview -- --port 5180 --strictPort"). This script never starts or stops Node/Vite.

Options:
  --url <url>          App URL (default: $SGL_SMOKE_URL or http://localhost:5180/)
  --out <dir>          Output folder for screenshots and report (default: <temp>/spatial-graph-lab-smoke/<timestamp>)
  --browser <path>     Browser executable (default: first installed Edge/Chrome)
  --feature <name>     Enable an optional post-integration check; repeatable. One of:
                       ${Object.keys(FEATURES).join(', ')}, all
  --only <id,...>      Run only these check groups (see report ids, e.g. viewports,undo-redo)
  --headed             Show the browser window
  --timeout <ms>       Per-wait timeout (default 10000)
  --help               Show this text

Exit code: 0 = no FAIL, 1 = at least one FAIL, 2 = could not run (no browser / server).`;

export function parseArgs(argv, env = {}) {
  const opts = {
    url: env.SGL_SMOKE_URL || 'http://localhost:5180/',
    out: null,
    browser: null,
    features: new Set(),
    only: null,
    headless: true,
    timeout: 10_000,
    help: false,
  };
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
      case '--out':
        opts.out = value();
        break;
      case '--browser':
        opts.browser = value();
        break;
      case '--feature': {
        const v = value();
        if (v === 'all') for (const f of Object.keys(FEATURES)) opts.features.add(f);
        else if (v && Object.hasOwn(FEATURES, v)) opts.features.add(v);
        else if (v) errors.push(`unknown feature "${v}" (known: ${Object.keys(FEATURES).join(', ')}, all)`);
        break;
      }
      case '--only': {
        const v = value();
        if (v) opts.only = new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      }
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
  return { opts, errors };
}

/** Rounded rectangle for reports. */
export const roundRect = (r) => (r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null);

/**
 * Differences between two named rectangle sets larger than `tolerance` px.
 * Returns readable strings such as "sidebar.width 320 → 344 (+24)". Missing rectangles are reported.
 */
export function rectChanges(before, after, tolerance = 1) {
  const out = [];
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[name];
    const b = after[name];
    if (!a || !b) {
      if (a !== b) out.push(`${name} ${a ? 'disappeared' : 'appeared'}`);
      continue;
    }
    for (const k of ['x', 'y', 'width', 'height']) {
      const d = b[k] - a[k];
      if (Math.abs(d) > tolerance) out.push(`${name}.${k} ${Math.round(a[k])} → ${Math.round(b[k])} (${d > 0 ? '+' : ''}${Math.round(d)})`);
    }
  }
  return out;
}

/** Page overflow description, or null when the page does not scroll. */
export function overflowProblem(m) {
  const problems = [];
  if (m.scrollWidth > m.clientWidth + 1) problems.push(`horizontal: content ${m.scrollWidth}px > viewport ${m.clientWidth}px`);
  if (m.scrollHeight > m.clientHeight + 1) problems.push(`vertical: content ${m.scrollHeight}px > viewport ${m.clientHeight}px`);
  return problems.length ? problems.join('; ') : null;
}

/**
 * Console errors that do not indicate an app problem: the browser's automatic /favicon.ico request
 * (index.html declares no icon). Everything else counts.
 */
export const isIgnorableConsoleError = (text) => /404/.test(text) && /\/favicon\.ico\b/.test(text);

export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function summarize(results) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const r of results) counts[r.status]++;
  return counts;
}

/** Plain-text table for the console. */
export function formatTable(results) {
  const width = Math.max(4, ...results.map((r) => r.id.length));
  const lines = results.map((r) => `${r.status.padEnd(4)}  ${r.id.padEnd(width)}  ${r.message}`);
  const c = summarize(results);
  lines.push('', `${c.PASS} passed, ${c.FAIL} failed, ${c.SKIP} skipped`);
  return lines.join('\n');
}

/** Markdown report (written next to the screenshots). */
export function formatMarkdown(meta, results) {
  const c = summarize(results);
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    '# Spatial Graph Lab smoke report',
    '',
    `- URL: ${meta.url}`,
    `- Browser: ${meta.browser}`,
    `- Started: ${meta.started}`,
    `- Features enabled: ${meta.features.length ? meta.features.join(', ') : 'none'}`,
    `- Result: **${c.FAIL === 0 ? 'PASS' : 'FAIL'}** (${c.PASS} passed, ${c.FAIL} failed, ${c.SKIP} skipped)`,
    '',
    '| Status | Check | Message |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.status} | ${esc(r.id)} | ${esc(r.message)} |`),
    '',
    'Screenshots and measured rectangles are in `report.json` and the PNG files in this folder.',
    '',
  ].join('\n');
}
