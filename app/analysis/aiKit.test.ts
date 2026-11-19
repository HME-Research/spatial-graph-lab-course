import { describe, expect, it } from 'vitest';
import type { UploadRunner } from '@app/extensions';
import { buildGraphContext } from '@app/extensions/context';
import { validateAnalysisResult } from '@app/extensions/run';
import { handleUploadRequest, SHIM_NAMES } from '@app/extensions/uploadSandbox';
import house from '../document/examples/house.json';
import exactlyK from '../../docs/ai-kit/examples/exactly-k-steps.ts?raw';
import shortestRoute from '../../docs/ai-kit/examples/shortest-route.ts?raw';
import prompt from '../../docs/ai-kit/PROMPT.md?raw';
import readme from '../../docs/ai-kit/README.md?raw';
import apiDeclarations from '../../docs/ai-kit/student-api.d.ts?raw';
import yourPrompt from '../../docs/ai-kit/YOUR-PROMPT.md?raw';
import template from '../../docs/templates/graph-analysis-template.ts?raw';
import { prepareCached } from './uploads';

/**
 * The AI kit (docs/ai-kit/, zipped to public/downloads/spatial-graph-lab-ai-kit.zip by
 * `npm run build:ai-kit`): the zip is up to date, its examples pass the real upload pipeline, and
 * its API declaration lists exactly the functions an uploaded analysis can use.
 */

const KIT: Readonly<Record<string, string>> = {
  'PROMPT.md': prompt,
  'README.md': readme,
  'YOUR-PROMPT.md': yourPrompt,
  'examples/exactly-k-steps.ts': exactlyK,
  'examples/shortest-route.ts': shortestRoute,
  'student-api.d.ts': apiDeclarations,
};

const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): { readFileSync(url: URL): Uint8Array } } }).process.getBuiltinModule('node:fs');

/** Entries of a stored (uncompressed) zip, read from its central directory. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, string>();
  const text = new TextDecoder();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    expect(view.getUint16(at + 10, true)).toBe(0); // stored
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = text.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    out.set(name, text.decode(bytes.subarray(dataStart, dataStart + size)));
    at += 46 + nameLength;
  }
  return out;
}

const lf = (s: string) => s.replace(/\r\n/g, '\n');
const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));

async function run(file: string, doc: { nodes: readonly { id: number }[]; edges: readonly { id: number; source: number; target: number }[] }, inputs: number[]) {
  const status = await prepareCached(KIT[file]!, file.split('/').pop()!, inProcess);
  if (!status.ok) throw new Error(`${file} did not load: ${JSON.stringify(status)}`);
  const reply = handleUploadRequest({ op: 'run', code: status.code, fileName: file, graph: buildGraphContext(doc, inputs).graph, inputs });
  if (!reply.ok || reply.op !== 'run') throw new Error(`${file} did not run: ${JSON.stringify(reply)}`);
  const checked = validateAnalysisResult(reply.result, doc, status.definition.id);
  if (!checked.ok) throw new Error(`${file} returned an invalid result: ${JSON.stringify(checked)}`);
  return { definition: status.definition, result: checked.value };
}

describe('AI kit', () => {
  it('the zip in public/downloads matches docs/ai-kit (else run `npm run build:ai-kit`)', () => {
    const zip = readStoredZip(fs.readFileSync(new URL('../../public/downloads/spatial-graph-lab-ai-kit.zip', import.meta.url)));
    const expected = Object.fromEntries(Object.entries(KIT).map(([name, text]) => [`spatial-graph-lab-ai-kit/${name}`, lf(text)]));
    expect(Object.fromEntries(zip)).toEqual(expected);
  });

  it('declares exactly the functions an uploaded analysis can import', () => {
    const declared = [...apiDeclarations.matchAll(/export function (\w+)/g)].map((m) => m[1]).sort();
    expect(declared).toEqual([...SHIM_NAMES].sort());
  });

  it('keeps its k-steps example identical to the template the Guide offers', () => {
    expect(lf(exactlyK)).toBe(lf(template));
  });

  it('shortest route: a Query with two nodes; the route, no route, and the same room', async () => {
    const { definition, result } = await run('examples/shortest-route.ts', house, [1, 5]);
    expect(definition.inputs).toEqual([{ kind: 'node', label: 'From' }, { kind: 'node', label: 'To' }]);
    expect(result).toMatchObject({ value: 3, text: '3 steps: 1 → 2 → 4 → 5', highlightNodes: [1, 2, 4, 5], highlightEdges: [1, 3, 4] });
    const apart = { nodes: [...house.nodes, { id: 9 }], edges: house.edges };
    expect((await run('examples/shortest-route.ts', apart, [1, 9])).result).toMatchObject({ text: 'No route from 1 to 9: they are not connected.' });
    expect((await run('examples/shortest-route.ts', house, [3, 3])).result).toMatchObject({ value: 0 });
  });

  it('exactly k steps: a Query with a node and a number', async () => {
    const { definition, result } = await run('examples/exactly-k-steps.ts', house, [1, 2]);
    expect(definition.inputs.map((i) => i.kind)).toEqual(['node', 'number']);
    expect(result).toMatchObject({ value: 2, highlightNodes: [1, 3, 4] });
  });
});
