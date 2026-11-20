#!/usr/bin/env node
// Spatial Graph Lab — reopen loop: the headless reproduction of two intermittent bugs fixed on 2026-11-20.
// See scripts/smoke/README.md.
//
//   A  Welcome stayed on "Looking for saved projects…" and Create project hung on "Creating the
//      project…": in a FRESH profile, a reload right after the first load froze the first page in
//      the back/forward cache while it was creating the IndexedDB database (app/project/storage.ts).
//   B  Graph 2D drew the nodes but no edges right after a project opened, most often from Recent
//      (app/views/graph2d/handleRepair.ts).
//
// Each iteration uses a NEW private browser profile (bug A needs one): load, reload at once →
// Welcome must list the saved projects (no hang, storage available) → Create project with the House
// toolkit must finish → Try example: Graph 2D draws its 4 edges → Save locally → reload → restore it
// from Recent: Graph 2D draws its 4 edges again. Prints one line per iteration and the counts.
//
// Same safety rules as smoke.mjs: never starts/stops Node or Vite, never writes into the repository
// (output defaults to the OS temp dir), only closes the private browsers it launched.
//
//   node scripts/smoke/reopen.mjs --url http://localhost:5306/ [--iterations 10] [--out DIR]

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { delay, dismissNotices, openRail, openSession, parseCliArgs, SetupError, urlWithToolkit, waitForProject } from './app.mjs';

const USAGE = `Spatial Graph Lab reopen loop (Welcome list / Create project hang, Graph 2D edges after opening).

Usage: node scripts/smoke/reopen.mjs --url http://localhost:5306/ [--iterations 10] [--viewport 1366x768] [--out DIR] [--browser PATH] [--headed]
The app must already be running; this script never starts or stops servers.
Exit code: 0 = no hang and every graph drew its edges, 1 = a failure, 2 = could not run.`;

const WELCOME = '.sgl-welcome';
const argv = process.argv.slice(2);
let iterations = 10;
const at = argv.indexOf('--iterations');
if (at >= 0) {
  iterations = Number(argv[at + 1]);
  argv.splice(at, 2);
}
const { opts, errors } = parseCliArgs(argv, { name: 'reopen', url: 'http://localhost:5306/', viewport: '1366x768', env: process.env });
if (!Number.isInteger(iterations) || iterations < 1) errors.push('--iterations needs a positive whole number');
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}
if (errors.length) {
  console.error(errors.map((e) => `error: ${e}`).join('\n'));
  console.error(`\n${USAGE}`);
  process.exit(2);
}

const counts = { iterations: 0, listHang: 0, storageUnavailable: 0, createHang: 0, edgeChecks: 0, edgeless: 0, errors: 0 };
const rows = [];

/** Welcome after a reload: the list must be answered within 15 s. Returns 'ok' | 'hang' | 'unavailable'. */
async function welcomeList(s, target) {
  await s.goto(target);
  await s.waitFor(`!!document.querySelector('${WELCOME}')`, 20_000, 'the Welcome screen');
  try {
    await s.waitFor(`!/Looking for saved projects/.test(document.querySelector('${WELCOME}')?.innerText ?? '')`, 15_000, 'the saved-project list');
  } catch {
    return 'hang';
  }
  return (await s.evaluate(`/Saved projects cannot be listed/.test(document.querySelector('${WELCOME}')?.innerText ?? '')`)) ? 'unavailable' : 'ok';
}

/** Count Graph 2D edges for up to 5 s; returns the last count. */
async function edgesDrawn(s, expected) {
  const end = Date.now() + 5000;
  let n = 0;
  while (Date.now() < end) {
    n = await s.evaluate('__sgl.edgeIds().length');
    if (n >= expected) break;
    await delay(100);
  }
  return n;
}

for (let i = 1; i <= iterations; i++) {
  counts.iterations++;
  const row = { i };
  let s;
  try {
    s = await openSession({ url: opts.url, viewport: opts.viewport, out: join(opts.out, `run-${i}`), headless: opts.headless, browser: opts.browser });
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : e}`);
    process.exit(e instanceof SetupError ? 2 : 1);
  }
  const shot = (name) => s.screenshot(`${name}.png`).catch(() => null);
  try {
    // A: reload at once (the first page may still be creating the database).
    row.list = await welcomeList(s, urlWithToolkit(opts.url, 'house'));
    if (row.list === 'hang') counts.listHang++, await shot('list-hang');
    if (row.list === 'unavailable') counts.storageUnavailable++, await shot('storage-unavailable');
    await s.evaluate(`(() => { const sel = [...document.querySelectorAll('${WELCOME} select')].find((x) => [...x.options].some((o) => o.value === 'house')); if (sel) __sgl.setValue(sel, 'house'); return true; })()`);
    await s.click('Create project', { within: WELCOME });
    try {
      await waitForProject(s, null, 15_000);
      row.create = 'ok';
    } catch {
      row.create = 'hang';
      counts.createHang++;
      await shot('create-hang');
    }
    // B: Try example, then the same project restored from Recent.
    if ((await welcomeList(s, opts.url)) === 'ok') {
      await s.click('Try example', { within: WELCOME });
      await waitForProject(s, 5);
      await dismissNotices(s);
      counts.edgeChecks++;
      row.exampleEdges = await edgesDrawn(s, 4);
      if (row.exampleEdges < 4) counts.edgeless++, await shot('example-edgeless');
      const name = `Reopen ${i} ${Date.now().toString(36)}`;
      await openRail(s, 'Project');
      await s.evaluate(`(() => { const el = document.querySelector('input[aria-label="Project name"]'); __sgl.setValue(el, ${JSON.stringify(name)}); __sgl.enter(el); el.blur(); return true; })()`);
      await s.click('Save locally', { within: '#sidebar-panel-project' });
      await s.waitFor(`document.querySelector('.sgl-save-status')?.getAttribute('data-save-state') === 'saved'`, 15_000, 'Saved locally');
      if ((await welcomeList(s, opts.url)) === 'ok') {
        const opened = await s.evaluate(`(() => { const b = [...document.querySelectorAll('.sgl-recent-open')].find((e) => e.querySelector('.sgl-recent-name')?.textContent === ${JSON.stringify(name)}); b?.click(); return !!b; })()`);
        if (!opened) throw new Error(`"${name}" is not in Recent`);
        await waitForProject(s, 5);
        await dismissNotices(s);
        counts.edgeChecks++;
        row.restoredEdges = await edgesDrawn(s, 4);
        if (row.restoredEdges < 4) counts.edgeless++, await shot('restored-edgeless');
      }
    }
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e);
    counts.errors++;
    await shot('error');
  }
  row.consoleErrors = s.consoleErrors.length;
  rows.push(row);
  console.log(JSON.stringify(row));
  await s.close();
}

const failed = counts.listHang + counts.storageUnavailable + counts.createHang + counts.edgeless + counts.errors;
writeFileSync(join(opts.out, 'reopen.json'), JSON.stringify({ url: opts.url, counts, rows }, null, 2));
console.log(
  `\nWelcome list hangs ${counts.listHang}/${counts.iterations}, storage unavailable ${counts.storageUnavailable}/${counts.iterations}, ` +
    `Create project hangs ${counts.createHang}/${counts.iterations}, Graph 2D without all edges ${counts.edgeless}/${counts.edgeChecks}, errors ${counts.errors} — ${opts.out}`,
);
process.exit(failed ? 1 : 0);
