import { beforeAll, describe, expect, it } from 'vitest';
import type { DesignDocumentV2 } from '@app/document';
import { activateToolkit, discoverToolkits, functionInfos, TOOLKIT_GLOBS, type ActiveToolkit, type UploadRunner } from '@app/extensions';
import { buildGraphContext } from '@app/extensions/context';
import { validateAnalysisResult } from '@app/extensions/run';
import { GRAPH_SHIM_NAMES, handleUploadRequest, SHIM_NAMES } from '@app/extensions/uploadSandbox';
import { runUploadedAnalysis } from '@app/extensions/uploadedAnalyses';
import { buildKit, DESIGN_KIT_FILES, GRAPH_KIT_FILES, projectSheet, TEMPLATES } from '@app/ui/guide/aiKits';
import { projectSheetInput } from '@app/ui/guide/projectKit';
import house from '../document/examples/house.json';
import designApi from '../../docs/ai-kit/design/student-api.d.ts?raw';
import belowTarget from '../../docs/ai-kit/design/examples/below-target-area.ts?raw';
import largestPerLevel from '../../docs/ai-kit/design/examples/largest-room-per-level.ts?raw';
import sameFunction from '../../docs/ai-kit/design/examples/same-function-neighbours.ts?raw';
import exactlyK from '../../docs/ai-kit/graph/examples/exactly-k-steps.ts?raw';
import shortestRoute from '../../docs/ai-kit/graph/examples/shortest-route.ts?raw';
import graphApi from '../../docs/ai-kit/graph/student-api.d.ts?raw';
import designTemplate from '../../docs/templates/design-analysis-template.ts?raw';
import graphTemplate from '../../docs/templates/graph-analysis-template.ts?raw';
import { prepareCached } from './uploads';

/**
 * The AI kits (owner 2026-11-20), built by the app on download (`buildKit`): the graph kit
 * (`docs/ai-kit/graph/`), the design kit (`docs/ai-kit/design/`) and the design kit for a project
 * (plus a generated PROJECT.md). Their zips hold exactly their files, their API declarations list
 * exactly what an upload can use, and every example passes the real upload pipeline.
 */

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
const EMPTY_SCHEMA = { nodes: [], edges: [], functionDefaults: {} };

let houseToolkit: ActiveToolkit;
beforeAll(async () => {
  const source = discoverToolkits(TOOLKIT_GLOBS).toolkits.find((t) => t.id === 'house')!;
  const activation = await activateToolkit(source);
  if (activation.status !== 'active') throw new Error('toolkits/house did not activate');
  houseToolkit = activation.toolkit;
});
const houseSheet = () => projectSheetInput(houseToolkit, houseToolkit.attributeBaseline.schema, true);

async function runGraph(source: string, file: string, doc: { nodes: readonly { id: number }[]; edges: readonly { id: number; source: number; target: number }[] }, inputs: number[]) {
  const status = await prepareCached(source, file, inProcess);
  if (!status.ok) throw new Error(`${file} did not load: ${JSON.stringify(status)}`);
  const reply = handleUploadRequest({ op: 'run', code: status.code, fileName: file, graph: buildGraphContext(doc, inputs).graph, inputs });
  if (!reply.ok || reply.op !== 'run') throw new Error(`${file} did not run: ${JSON.stringify(reply)}`);
  const checked = validateAnalysisResult(reply.result, doc, status.definition.id);
  if (!checked.ok) throw new Error(`${file} returned an invalid result: ${JSON.stringify(checked)}`);
  return { definition: status.definition, result: checked.value };
}

async function runDesign(source: string, file: string, doc: DesignDocumentV2, inputs: number[], project: ActiveToolkit | null) {
  const status = await prepareCached(source, file, inProcess);
  if (!status.ok) throw new Error(`${file} did not load: ${JSON.stringify(status)}`);
  const schema = project ? project.attributeBaseline.schema : EMPTY_SCHEMA;
  return { definition: status.definition, outcome: await runUploadedAnalysis(status, file, doc, inputs, inProcess, { doc, functions: functionInfos(project), schema }) };
}

describe('AI kits: the zips', () => {
  it('the graph kit holds exactly docs/ai-kit/graph/, in a folder named like the zip', async () => {
    const kit = await buildKit('graph');
    expect(kit.fileName).toBe('spatial-graph-lab-graph-kit.zip');
    const expected = await Promise.all(GRAPH_KIT_FILES.map(async (f) => [`spatial-graph-lab-graph-kit/${f.path}`, lf(await f.load())] as const));
    expect([...readStoredZip(kit.bytes)]).toEqual(expected);
    expect(expected.map(([name]) => name)).not.toContain('spatial-graph-lab-graph-kit/YOUR-PROMPT.md');
  });

  it('the design kit holds exactly docs/ai-kit/design/; the kit for a project adds PROJECT.md and nothing of the design', async () => {
    const design = await buildKit('design');
    expect(design.fileName).toBe('spatial-graph-lab-design-kit.zip');
    const files = await Promise.all(DESIGN_KIT_FILES.map(async (f) => [f.path, lf(await f.load())] as const));
    expect([...readStoredZip(design.bytes)]).toEqual(files.map(([p, t]) => [`spatial-graph-lab-design-kit/${p}`, t]));

    const project = await buildKit('project', houseSheet());
    expect(project.fileName).toBe('spatial-graph-lab-design-kit-house.zip');
    const entries = readStoredZip(project.bytes);
    expect([...entries.keys()]).toEqual(['PROMPT.md', 'PROJECT.md', ...files.slice(1).map(([p]) => p)].map((p) => `spatial-graph-lab-design-kit-house/${p}`));
    expect(entries.get('spatial-graph-lab-design-kit-house/PROJECT.md')).toBe(projectSheet(houseSheet()));
    await expect(buildKit('project')).rejects.toThrow('the project kit needs the open project');
  });

  it('the same files always give the same bytes', async () => {
    expect((await buildKit('design')).bytes).toEqual((await buildKit('design')).bytes);
  });
});

describe('AI kits: declarations, templates and examples', () => {
  it('each kit declares exactly the functions an upload of its kind can import', () => {
    const declared = (d: string) => [...d.matchAll(/export function (\w+)/g)].map((m) => m[1]).sort();
    expect(declared(graphApi)).toEqual([...GRAPH_SHIM_NAMES].sort());
    expect([...declared(designApi), 'FACE_DIRECTIONS'].sort()).toEqual([...SHIM_NAMES].sort());
    expect(designApi).toContain('export const FACE_DIRECTIONS');
  });

  it('the templates are the kits’ first examples, word for word', async () => {
    expect(lf(exactlyK)).toBe(lf(graphTemplate));
    expect(lf(largestPerLevel)).toBe(lf(designTemplate));
    expect(lf(await TEMPLATES.design.load())).toBe(lf(designTemplate));
  });

  it('graph kit: shortest route (two rooms) — the route, no route, and the same room', async () => {
    const { definition, result } = await runGraph(shortestRoute, 'shortest-route.ts', house, [1, 5]);
    expect(definition.inputs).toEqual([{ kind: 'node', label: 'From' }, { kind: 'node', label: 'To' }]);
    expect(result).toMatchObject({ value: 3, text: '3 steps: 1 → 2 → 4 → 5', highlightNodes: [1, 2, 4, 5], highlightEdges: [1, 3, 4] });
    const apart = { nodes: [...house.nodes, { id: 9 }], edges: house.edges };
    expect((await runGraph(shortestRoute, 'shortest-route.ts', apart, [1, 9])).result).toMatchObject({ text: 'No route from 1 to 9: they are not connected.' });
    expect((await runGraph(shortestRoute, 'shortest-route.ts', house, [3, 3])).result).toMatchObject({ value: 0 });
  });

  it('graph kit: exactly k steps (a room and a number)', async () => {
    const { definition, result } = await runGraph(exactlyK, 'exactly-k-steps.ts', house, [1, 2]);
    expect(definition.inputs.map((i) => i.kind)).toEqual(['node', 'number']);
    expect(result).toMatchObject({ value: 2, highlightNodes: [1, 3, 4] });
  });

  it('design kit: largest room per level works in a project without a toolkit', async () => {
    const { definition, outcome } = await runDesign(largestPerLevel, 'largest-room-per-level.ts', house as unknown as DesignDocumentV2, [], null);
    expect(definition).toMatchObject({ scope: 'design', inputs: [] });
    expect(definition.uses).toBeUndefined();
    expect(outcome).toEqual({
      ok: true,
      result: { kind: 'analysis', text: 'Level 0: room 1 (9 m²) · Level 1: room 4 (9 m²)', highlightNodes: [1, 4], nodeValues: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 9 } },
    });
  });

  it('design kit: same-Function neighbours (one room) reads Functions as labels only', async () => {
    const doc = { ...house, nodes: house.nodes.map((n) => (n.id === 3 ? { ...n, function: 'living' } : n)) } as unknown as DesignDocumentV2;
    const { definition, outcome } = await runDesign(sameFunction, 'same-function-neighbours.ts', doc, [2], null);
    expect(definition).toMatchObject({ scope: 'design', inputs: [{ kind: 'node', label: 'Room' }] });
    expect(outcome).toMatchObject({ ok: true, result: { value: 1, text: '1 neighbour(s) of room 2 are also a living; 1 of them share a wall or a floor with it.', highlightNodes: [2, 3] } });
    const none = await runDesign(sameFunction, 'same-function-neighbours.ts', house as unknown as DesignDocumentV2, [2], null);
    expect(none.outcome).toMatchObject({ ok: true, result: { value: 0, text: 'No neighbour of room 2 is also a living.' } });
  });

  it('design kit: below target area uses a House field, so it runs with the House toolkit and is refused without it', async () => {
    const design = houseToolkit.designs.find((d) => d.id === 'simple-house')!.result;
    if (!design.ok) throw new Error('simple-house is invalid');
    const { definition, outcome } = await runDesign(belowTarget, 'below-target-area.ts', design.value, [], houseToolkit);
    expect(definition.uses).toEqual({ nodeFields: ['targetArea'] });
    expect(outcome).toMatchObject({ ok: true, result: { value: 3, text: '3 rooms are below their target area.' } });
    const refused = await runDesign(belowTarget, 'below-target-area.ts', design.value, [], null);
    expect(refused.outcome).toEqual({ ok: false, messages: ['Needs the room field “targetArea”, which this project does not have.'] });
  });
});

describe('AI kits: PROJECT.md', () => {
  it('describes the House toolkit’s Functions, fields (with per-Function defaults) and calculated values, and the grid', () => {
    const sheet = projectSheet(houseSheet());
    expect(sheet).toMatch(/^# This project: toolkit House\n/);
    expect(sheet).toContain('| `bedroom` | Bedroom | Toolkit: House |');
    expect(sheet).toMatch(/\| `targetArea` \| Target area \(m²\) \| number ≥ 1 \| — \| [^|]*living 36[^|]* \| Toolkit: House \|/);
    expect(sheet).toContain('This project has no custom relationship fields.');
    expect(sheet).toContain('| `area` | room | number | m² |');
    expect(sheet).toContain('One cell is 3 × 3 m and one level 3 m high.');
    expect(sheet).toContain('## Example (made up, not your design)');
    expect(sheet).toContain(`"function": "${houseSheet().functions[0]!.id}"`);
    expect(sheet).toContain('"targetArea": 1');
  });

  it('tags a project’s own Functions and fields as Yours, and says when there is no toolkit', () => {
    const own = projectSheetInput(
      { ...houseToolkit, functions: [{ id: 'studio', file: 'project functions', definition: { id: 'studio', label: 'Studio' }, status: { ok: true } }] },
      { nodes: [{ id: 'f1', key: 'quiet', label: 'Quiet', kind: 'boolean' }], edges: [], functionDefaults: {} },
      false,
    );
    expect(own.toolkit).toBeNull();
    const sheet = projectSheet(own);
    expect(sheet).toMatch(/^# This project: no toolkit\n/);
    expect(sheet).toContain('This project has no toolkit');
    expect(sheet).toContain('| `studio` | Studio | Yours |');
    expect(sheet).toContain('| `quiet` | Quiet | true / false | — | — | Yours |');
  });
});
