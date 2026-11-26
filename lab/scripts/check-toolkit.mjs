#!/usr/bin/env node
// Spatial Graph Lab — the toolkit check behind `npm run check:toolkit` (owner 2026-11-26).
//
//   npm run check:toolkit                      every toolkit under toolkits/
//   npm run check:toolkit -- -t <toolkit-id>   one toolkit: it must exist, or the check fails
//
// It runs lab/app/extensions/toolkitCheck.test.ts with vitest and passes the toolkit id in the
// environment variable SGL_CHECK_TOOLKIT, never as vitest's own `-t` name filter: a name filter that
// matches nothing skips every test and "passes", so a missing or misplaced toolkit went unnoticed.
// The id is read from `-t <id>`, `-t=<id>`, `--toolkit <id>` or a bare `<id>`. A bare id matters on
// Windows PowerShell 5.1, which drops the `--` so npm swallows `-t` and passes only the id on.
// No dependency: Node's own modules and the vitest the repository already has.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST_FILE = 'lab/app/extensions/toolkitCheck.test.ts';
const ID_FLAGS = new Set(['-t', '--toolkit', '--testNamePattern']);

/** The requested toolkit id, or null for every toolkit; throws a readable message on bad arguments. */
function requestedId(args) {
  const ids = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (ID_FLAGS.has(arg)) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) throw new Error(`${arg} needs a toolkit id after it, e.g. -t hk-small-library`);
      ids.push(next);
      i++;
    } else if (/^(-t|--toolkit|--testNamePattern)=/.test(arg)) {
      ids.push(arg.slice(arg.indexOf('=') + 1));
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option ${arg}. Use: npm run check:toolkit -- -t <toolkit-id>`);
    } else {
      ids.push(arg);
    }
  }
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id !== ''))];
  if (unique.length > 1) throw new Error(`give one toolkit id, not ${unique.length} (${unique.join(', ')})`);
  return unique[0] ?? null;
}

function main() {
  let id;
  try {
    id = requestedId(process.argv.slice(2));
  } catch (error) {
    console.error(`check:toolkit: ${error.message}`);
    return 2;
  }
  console.log(id === null ? 'Checking every toolkit in toolkits/' : `Checking the toolkit "${id}" (toolkits/${id}/)`);
  const vitest = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
  const env = { ...process.env };
  if (id === null) delete env.SGL_CHECK_TOOLKIT;
  else env.SGL_CHECK_TOOLKIT = id;
  const run = spawnSync(process.execPath, [vitest, '--run', TEST_FILE], { cwd: ROOT, env, stdio: 'inherit' });
  if (run.error) {
    console.error(`check:toolkit: could not start vitest (${run.error.message}). Run npm install first.`);
    return 1;
  }
  return run.status ?? 1;
}

process.exitCode = main();
