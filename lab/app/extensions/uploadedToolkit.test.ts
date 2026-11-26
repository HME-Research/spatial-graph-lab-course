import { beforeAll, describe, expect, it } from 'vitest';
import { REFERENCE_TOOLKIT_FILES } from './toolkitGlobs';
import { buildGraphContext } from './context';
import { functionInfos } from './context';
import { resolveToolkitImport } from './toolkitModules';
import type { UploadRunner } from './uploadedAnalyses';
import { loadUploadedToolkit, runUploadedToolkitAnalysis, runUploadedToolkitTransform, toolkitImportProblems } from './uploadedToolkit';
import { findToolkitFolder, toolkitFromZip, type StoredToolkit } from './uploadedToolkitFiles';
import { handleUploadRequest } from './uploadSandbox';
import { readZip } from './zipReader';

/**
 * Uploaded toolkits (owner 2026-11-26): a zip → the toolkit's files → the same activation and
 * validation as a repository toolkit, with the code evaluated by the upload worker's own code
 * (run in-process here) → analyses and transforms that run like the repository toolkit's.
 */

const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));

/** CRC-32 for the test zips. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip as an archiver makes it: deflated (method 8) or stored (method 0) entries. */
async function makeZip(files: Readonly<Record<string, string | Uint8Array>>, deflate = true): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = enc.encode(path);
    const raw = typeof content === 'string' ? enc.encode(content) : content;
    const data = deflate ? await deflateRaw(raw) : raw;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(14, crc32(raw), true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(10, deflate ? 8 : 0, true);
    head.setUint32(16, crc32(raw), true);
    head.setUint32(20, data.length, true);
    head.setUint32(24, raw.length, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length / 2, true);
  end.setUint16(10, central.length / 2, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...parts, ...central, new Uint8Array(end.buffer)] as Uint8Array<ArrayBuffer>[]).arrayBuffer());
}

/** The House toolkit's text files (as the kit has them), keyed by path inside `toolkits/house/`. */
let houseFiles: Record<string, string>;
beforeAll(async () => {
  houseFiles = {};
  for (const [path, load] of Object.entries(REFERENCE_TOOLKIT_FILES)) houseFiles[path.replace('/toolkits/house/', '')] = await load();
});

const zipOf = (folder: string, files: Readonly<Record<string, string>>, extra: Readonly<Record<string, string>> = {}, deflate = true) =>
  makeZip({ ...Object.fromEntries(Object.entries(files).map(([p, t]) => [`${folder}${p}`, t])), ...extra }, deflate);

async function storedFrom(zip: Uint8Array, name = 'u000-he-house.zip'): Promise<StoredToolkit> {
  const read = await toolkitFromZip(zip, name, () => '2026-11-26T12:00:00.000Z');
  if (!read.ok) throw new Error(read.problems.join('\n'));
  return read.toolkit;
}

async function problemsOf(files: Readonly<Record<string, string>>): Promise<readonly string[]> {
  const stored = await storedFrom(await zipOf('u000-x/', files), 'u000-x.zip');
  const load = await loadUploadedToolkit(stored, inProcess);
  if (load.ok) throw new Error('expected problems');
  return load.problems;
}

const MINIMAL = {
  'toolkit.ts': "import { defineToolkit } from '@student-api';\nexport default defineToolkit({ name: 'Mini' });\n",
  'functions/room.ts': "import { defineFunction } from '@student-api';\nexport default defineFunction({ id: 'room', label: 'Room' });\n",
};

describe('the zip reader', () => {
  it('reads deflated and stored entries, and refuses what is not a zip', async () => {
    for (const deflate of [true, false]) {
      const read = await readZip(await makeZip({ 'a/b.txt': 'hello hello hello', 'c.bin': new Uint8Array([0, 1, 2, 255]) }, deflate), { maxEntries: 10, maxFileBytes: 100, maxTotalBytes: 1000 });
      expect(read.ok && read.files.map((f) => [f.path, [...f.bytes]])).toEqual([
        ['a/b.txt', [...new TextEncoder().encode('hello hello hello')]],
        ['c.bin', [0, 1, 2, 255]],
      ]);
    }
    const bad = await readZip(new TextEncoder().encode('not a zip at all'), { maxEntries: 10, maxFileBytes: 100, maxTotalBytes: 1000 });
    expect(bad).toEqual({ ok: false, message: expect.stringMatching(/not a zip file/) });
    const big = await readZip(await makeZip({ 'x.txt': 'x'.repeat(200) }), { maxEntries: 10, maxFileBytes: 100, maxTotalBytes: 1000 });
    expect(big).toEqual({ ok: false, message: expect.stringMatching(/x\.txt is .* unpacked/) });
  });
});

describe('finding the toolkit folder in the zip', () => {
  it('at the root (name from the zip), in one folder, in one extra wrapping folder', () => {
    expect(findToolkitFolder(['toolkit.ts', 'functions/a.ts'], 'u1-ab-x.zip')).toEqual({ ok: true, root: '', name: 'u1-ab-x' });
    expect(findToolkitFolder(['u1-ab-x (2).zip'.slice(0, 0) + 'toolkit.ts'], 'u1-ab-x (2).zip')).toEqual({ ok: true, root: '', name: 'u1-ab-x' });
    expect(findToolkitFolder(['u123-hk-house/toolkit.ts'], 'whatever.zip')).toEqual({ ok: true, root: 'u123-hk-house/', name: 'u123-hk-house' });
    expect(findToolkitFolder(['download/u123-hk-house/toolkit.ts'], 'whatever.zip')).toEqual({ ok: true, root: 'download/u123-hk-house/', name: 'u123-hk-house' });
  });
  it('explains a missing, misnamed, too deep or doubled toolkit.ts', () => {
    const missing = findToolkitFolder(['x/functions/a.ts'], 'x.zip');
    expect(!missing.ok && missing.problem).toMatch(/toolkit\.ts must be directly inside the folder/);
    const txt = findToolkitFolder(['x/toolkit.ts.txt'], 'x.zip');
    expect(!txt.ok && txt.problem).toMatch(/There is "x\/toolkit\.ts\.txt"/);
    const deep = findToolkitFolder(['a/b/c/toolkit.ts'], 'x.zip');
    expect(!deep.ok && deep.problem).toMatch(/3 folders deep/);
    const two = findToolkitFolder(['a/toolkit.ts', 'b/toolkit.ts'], 'x.zip');
    expect(!two.ok && two.problem).toMatch(/more than one toolkit/);
    const name = findToolkitFolder(['My Toolkit/toolkit.ts'], 'x.zip');
    expect(!name.ok && name.problem).toMatch(/"My Toolkit", which is not a valid toolkit name/);
  });
  it('ignores __MACOSX and .DS_Store, keeps toolkit files only and lists what it left out', async () => {
    const zip = await zipOf('u000-x/', { ...MINIMAL, 'notes.txt': 'x', 'functions/room.test.ts': 'x' }, { '__MACOSX/u000-x/._toolkit.ts': 'junk', 'u000-x/.DS_Store': 'junk', 'other/readme.md': 'x' });
    const read = await toolkitFromZip(zip, 'u000-x.zip');
    expect(read.ok && read.toolkit.files.map((f) => f.path)).toEqual(['functions/room.ts', 'toolkit.ts']);
    expect(read.ok && read.ignored).toEqual(['u000-x/notes.txt', 'u000-x/functions/room.test.ts', 'other/readme.md']);
  });
  it('refuses a file that is not a zip, or one over 5 MB', async () => {
    expect(await toolkitFromZip(new Uint8Array(3), 'house.rar')).toEqual({ ok: false, problems: [expect.stringMatching(/is not a \.zip file/)] });
    expect(await toolkitFromZip(new Uint8Array(6 * 1024 * 1024), 'big.zip')).toEqual({ ok: false, problems: [expect.stringMatching(/at most 5 MB/)] });
  });
});

describe('relative imports between toolkit files', () => {
  const has = (p: string) => ['t/functions/kitchen.ts', 't/lib/index.ts', 't/lib/geo.ts'].includes(p);
  it('resolve inside the folder only', () => {
    expect(resolveToolkitImport('t/algorithms/a.ts', '../functions/kitchen', has)).toBe('t/functions/kitchen.ts');
    expect(resolveToolkitImport('t/algorithms/a.ts', '../functions/kitchen.js', has)).toBe('t/functions/kitchen.ts');
    expect(resolveToolkitImport('t/algorithms/a.ts', '../lib', has)).toBe('t/lib/index.ts');
    expect(resolveToolkitImport('t/algorithms/a.ts', '../../t/lib/geo', has)).toBeNull();
    expect(resolveToolkitImport('t/algorithms/a.ts', 'lodash', has)).toBeNull();
  });
  it('anything else is named with its file and line', () => {
    expect(toolkitImportProblems('t/a.ts', "import x from '@student-api';\n\nimport _ from 'lodash';\nimport y from './nope';\n", has)).toEqual([
      expect.stringMatching(/^t\/a\.ts, line 3: imports "lodash"\. Toolkit files may import only "@student-api"/),
      expect.stringMatching(/^t\/a\.ts, line 4: imports "\.\/nope", but the toolkit has no such file/),
    ]);
  });
});

describe('loading an uploaded toolkit', () => {
  it('the House toolkit, zipped as a chat would (deflated, in its folder), activates exactly like the repository one', async () => {
    const stored = await storedFrom(await zipOf('u000-he-house/', houseFiles), 'u000-he-house.zip');
    expect(stored.name).toBe('u000-he-house');
    const load = await loadUploadedToolkit(stored, inProcess);
    if (!load.ok) throw new Error(load.problems.join('\n'));
    const t = load.toolkit;
    expect(t.id).toBe('u000-he-house');
    expect(t.definition.name).toBe('House');
    expect(t.functions.map((f) => f.id)).toContain('kitchen');
    expect(t.functions.every((f) => f.status.ok)).toBe(true);
    expect(t.algorithms.map((a) => [a.id, a.definition.scope, a.status.ok])).toEqual([
      ['below-target-area', 'design', true],
      ['grow-residence-circulation', 'spatial', true],
      ['grow-to-target-area', 'spatial', true],
    ]);
    expect(t.designs.map((d) => [d.id, d.result.ok])).toEqual([
      ['garden-house', true],
      ['simple-house', true],
    ]);
    expect(t.attributeBaseline.schema.nodes.map((f) => f.key)).toEqual(['targetArea', 'priority']);
    expect(t.uploaded?.modules['u000-he-house/toolkit.ts']).toContain('defineToolkit');
  });

  it('runs its analysis and its transforms (customOf included) in the worker code', async () => {
    const stored = await storedFrom(await zipOf('download/u000-he-house/', houseFiles), 'download.zip');
    const load = await loadUploadedToolkit(stored, inProcess);
    if (!load.ok) throw new Error(load.problems.join('\n'));
    const t = load.toolkit;
    const doc = t.designs.find((d) => d.id === 'simple-house')!.result;
    if (!doc.ok) throw new Error('invalid');
    const schema = t.attributeBaseline.schema;
    const analysis = await runUploadedToolkitAnalysis(t, 'below-target-area', doc.value, [], { doc: doc.value, functions: functionInfos(t), schema }, inProcess);
    expect(analysis.ok).toBe(true);
    const grow = await runUploadedToolkitTransform(doc.value, t, 'grow-to-target-area', {}, { attributes: schema }, inProcess);
    if (!grow.ok) throw new Error(grow.issues.map((d) => d.message).join('\n'));
    expect(grow.value.kind).toBe('transformation');
    expect(buildGraphContext(doc.value, []).graph.nodes.length).toBe(doc.value.nodes.length);
  });

  it('lists a bad import, a syntax error and a missing toolkit.ts in plain words', async () => {
    expect(await problemsOf({ ...MINIMAL, 'algorithms/a.ts': "import fs from 'node:fs';\nexport default fs;\n" })).toEqual([
      expect.stringMatching(/^u000-x\/algorithms\/a\.ts, line 1: imports "node:fs"/),
    ]);
    expect(await problemsOf({ ...MINIMAL, 'functions/bad.ts': "import { defineFunction } from '@student-api';\nexport default defineFunction({ id: 'bad', label: 'Bad' ;\n" })).toEqual([
      expect.stringMatching(/^u000-x\/functions\/bad\.ts: Syntax error on line 2/),
    ]);
    const missing = await toolkitFromZip(await makeZip({ 'u000-x/functions/room.ts': MINIMAL['functions/room.ts'] }), 'u000-x.zip');
    expect(missing).toEqual({ ok: false, problems: [expect.stringMatching(/toolkit\.ts was not found/)] });
  });

  it('lists an invalid Function, a failing file and an invalid toolkit definition', async () => {
    const fn = await problemsOf({ ...MINIMAL, 'functions/odd.ts': "import { defineFunction } from '@student-api';\nexport default defineFunction({ id: 'odd', label: 'Odd', colour: 'red' });\n" });
    expect(fn).toEqual([expect.stringMatching(/invalid node type "odd" in u000-x\/functions\/odd\.ts: .*colour must be a hex colour/)]);
    const thrown = await problemsOf({ ...MINIMAL, 'functions/boom.ts': "import { defineFunction } from '@student-api';\n\nthrow new Error('boom');\n" });
    expect(thrown).toEqual([expect.stringMatching(/u000-x\/functions\/boom\.ts could not be loaded: The file failed while loading \(u000-x\/functions\/boom\.ts, line 3\): Error: boom/)]);
    const toolkit = await problemsOf({ 'toolkit.ts': "import { defineToolkit } from '@student-api';\nexport default defineToolkit({ name: '' });\n" });
    expect(toolkit).toEqual([expect.stringMatching(/invalid toolkit definition in u000-x\/toolkit\.ts/)]);
  });

  it('a toolkit with an empty designs/ folder (only a README) loads', async () => {
    const stored = await storedFrom(await zipOf('u000-x/', { ...MINIMAL, 'designs/README.md': '# Designs\n' }), 'u000-x.zip');
    const load = await loadUploadedToolkit(stored, inProcess);
    expect(load.ok && load.toolkit.designs).toEqual([]);
  });
});
