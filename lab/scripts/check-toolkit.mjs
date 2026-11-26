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
//
// It ends with one unmistakable line, `PASSED: …` or `FAILED: …`, and exits with vitest's code:
// vitest's own summary also says "N passed" when a test failed, which students misread.
// On Windows, a lowercase drive letter (`c:\…`, common in Git Bash and coding agents) makes vitest
// crash with "Cannot read properties of undefined (reading 'config')": the repository folder is
// handed to vitest with an uppercase drive letter.
// No dependency: Node's own modules and the vitest the repository already has.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_FILE = 'lab/app/extensions/toolkitCheck.test.ts';
const ID_FLAGS = new Set(['-t', '--toolkit', '--testNamePattern']);

/** `c:\Users\…` → `C:\Users\…` (a Windows drive path); anything else is returned unchanged. */
export function upperDrive(path) {
  return /^[a-z]:[\\/]/.test(path) ? path[0].toUpperCase() + path.slice(1) : path;
}

/** The requested toolkit id, or null for every toolkit; throws a readable message on bad arguments. */
export function requestedId(args) {
  const ids = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (ID_FLAGS.has(arg)) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) throw new Error(`${arg} needs your toolkit name after it, e.g. -t u123-hk-house`);
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
  if (unique.length > 1) throw new Error(`give one toolkit name, not ${unique.length} (${unique.join(', ')})`);
  return unique[0] ?? null;
}

/** The last line the check prints, for one toolkit (an id) or every toolkit (null). */
export function resultLine(id, status) {
  const what = id === null ? 'every toolkit in toolkits/' : `toolkit "${id}"`;
  if (status === 0) return `PASSED: ${what} is ready.`;
  return `FAILED: ${what} has a problem (read the red message above).`;
}

function paint(line, ok) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return line;
  return `\u001b[1;${ok ? 32 : 31}m${line}\u001b[0m`;
}

function main() {
  let id;
  try {
    id = requestedId(process.argv.slice(2));
  } catch (error) {
    console.error(`check:toolkit: ${error.message}`);
    console.log(`\n${paint('FAILED: the command is not right (read the message above).', false)}`);
    return 2;
  }
  const root = upperDrive(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  console.log(id === null ? 'Checking every toolkit in toolkits/' : `Checking the toolkit "${id}" (toolkits/${id}/)`);
  const vitest = upperDrive(join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs'));
  const env = { ...process.env };
  if (id === null) delete env.SGL_CHECK_TOOLKIT;
  else env.SGL_CHECK_TOOLKIT = id;
  for (const key of ['INIT_CWD', 'PWD']) if (env[key]) env[key] = upperDrive(env[key]);
  const run = spawnSync(process.execPath, [vitest, '--run', '--root', root, TEST_FILE], { cwd: root, env, stdio: 'inherit' });
  if (run.error) {
    console.error(`check:toolkit: could not start vitest (${run.error.message}). Run npm ci first.`);
    console.log(`\n${paint(resultLine(id, 1), false)}`);
    return 1;
  }
  const status = run.status ?? 1;
  console.log(`\n${paint(resultLine(id, status), status === 0)}`);
  return status;
}

// Run only when started as a script (`node lab/scripts/check-toolkit.mjs`), not when a test imports it.
const self = fileURLToPath(import.meta.url).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) process.exitCode = main();
