import { beforeAll, describe, expect, it } from 'vitest';
import { readDesignJson, type DesignDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import {
  activateToolkit,
  buildSpatialContextV2,
  buildTransformRunData,
  discoverToolkits,
  OPERATION_KINDS,
  projectOnlyToolkit,
  runUploadedTransform,
  TOOLKIT_GLOBS,
  type ActiveToolkit,
  type UploadRunner,
} from '@app/extensions';
import { tableMetricReader } from '@app/extensions/designAnalysisContext';
import { uploadedTransformContext } from '@app/extensions/transformContext';
import { handleUploadRequest, TRANSFORM_SHIM_NAMES } from '@app/extensions/uploadSandbox';
import { buildKit, kitFileName, projectSheet, TEMPLATES, TRANSFORM_KIT_FILES } from '@app/ui/guide/aiKits';
import { projectSheetInput } from '@app/ui/guide/projectKit';
import houseGraphOnly from '../document/examples/house.json';

import transformApi from '../../docs/ai-kit/transform/student-api.d.ts?raw';
import connectSource from '../../docs/ai-kit/transform/examples/connect-touching-rooms.ts?raw';
import growSource from '../../docs/ai-kit/transform/examples/grow-in-one-direction.ts?raw';
import prioritySource from '../../docs/ai-kit/transform/examples/priority-from-missing-area.ts?raw';
import templateSource from '../../docs/templates/transform-template.ts?raw';
import { prepareTransformCached } from './transformUploads';

/**
 * The transform AI kits (owner 2026-11-25), built by the app on download (`buildKit`): the
 * transform kit (`docs/ai-kit/transform/`) and the transform kit for a project (plus PROJECT.md,
 * worded for a transform). Their zips hold exactly their files, the declarations list exactly what
 * an uploaded transform can use (in step with the real Student API), and every example and the
 * template pass the real upload pipeline and give a valid preview on a real design.
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

let house: ActiveToolkit;
const design = (id: string): DesignDocumentV2 => {
  const result = house.designs.find((d) => d.id === id)!.result;
  if (!result.ok) throw new Error(`${id} is invalid`);
  return result.value;
};
beforeAll(async () => {
  const source = discoverToolkits(TOOLKIT_GLOBS).toolkits.find((t) => t.id === 'house')!;
  const activation = await activateToolkit(source);
  if (activation.status !== 'active') throw new Error('toolkits/house did not activate');
  house = activation.toolkit;
});
const houseSheet = () => projectSheetInput(house, house.attributeBaseline.schema, true);

/** Load a kit file through the real pipeline (compile, worker, validation) and run it as the panel does. */
async function runKitFile(source: string, fileName: string, doc: DesignDocumentV2, project: ActiveToolkit, params: Record<string, unknown> = {}) {
  const status = await prepareTransformCached(source, fileName, inProcess);
  if (!status.ok) throw new Error(`${fileName} did not load: ${status.problems.join(' | ')}`);
  const outcome = await runUploadedTransform(status, fileName, doc, project, params, {}, inProcess);
  if (!outcome.ok) throw new Error(`${fileName} did not run: ${outcome.issues.map((d) => d.message).join(' | ')}`);
  if (outcome.value.kind !== 'transformation') throw new Error('expected a transformation');
  return { definition: status.definition, preview: outcome.value.preview };
}

describe('transform kits: the zips', () => {
  it('the transform kit holds exactly docs/ai-kit/transform/, in a folder named like the zip', async () => {
    const kit = await buildKit('transform');
    expect(kit.fileName).toBe('spatial-graph-lab-transform-kit.zip');
    expect(kitFileName('transform')).toBe(kit.fileName);
    const expected = await Promise.all(TRANSFORM_KIT_FILES.map(async (f) => [`spatial-graph-lab-transform-kit/${f.path}`, lf(await f.load())] as const));
    expect([...readStoredZip(kit.bytes)]).toEqual(expected);
    expect(expected.map(([name]) => name.split('/').slice(1).join('/'))).toEqual([
      'PROMPT.md',
      'README.md',
      'examples/connect-touching-rooms.ts',
      'examples/grow-in-one-direction.ts',
      'examples/priority-from-missing-area.ts',
      'student-api.d.ts',
    ]);
  });

  it('the kit for a project adds PROJECT.md (worded for a transform) and nothing of the design', async () => {
    const kit = await buildKit('transform-project', houseSheet());
    expect(kit.fileName).toBe('spatial-graph-lab-transform-kit-house.zip');
    expect(kitFileName('transform-project', null)).toBe('spatial-graph-lab-transform-kit-project.zip');
    const entries = readStoredZip(kit.bytes);
    expect([...entries.keys()]).toEqual(
      ['PROMPT.md', 'PROJECT.md', ...TRANSFORM_KIT_FILES.slice(1).map((f) => f.path)].map((p) => `spatial-graph-lab-transform-kit-house/${p}`),
    );
    const sheet = entries.get('spatial-graph-lab-transform-kit-house/PROJECT.md')!;
    expect(sheet).toBe(projectSheet(houseSheet(), 'transform'));
    expect(sheet).toContain('ctx.nodeCustom(nodeId)');
    expect(sheet).toContain('set-node-custom-attribute');
    expect(sheet).not.toContain('uses.nodeFields');
    expect(sheet).toContain('| `targetArea` |');
    await expect(buildKit('transform-project')).rejects.toThrow('the project kit needs the open project');
  });
});

describe('transform kits: declarations, template and examples', () => {
  it('declares exactly the functions an uploaded transform can import', () => {
    const declared = [...transformApi.matchAll(/export function (\w+)/g)].map((m) => m[1]!);
    expect([...declared, 'FACE_DIRECTIONS'].sort()).toEqual([...TRANSFORM_SHIM_NAMES].sort());
    expect(transformApi).toContain('export const FACE_DIRECTIONS');
  });

  it('stays in step with the app: the operations it accepts, the context without customOf', () => {
    const ops = [...new Set([...transformApi.matchAll(/readonly op: '([a-z-]+)'/g)].map((m) => m[1]!))].sort();
    expect(ops).toEqual([...OPERATION_KINDS].sort());
    const body = /export interface SpatialAlgorithmContext<[^{]*\{([\s\S]*?)\n {2}\}/.exec(transformApi)?.[1] ?? '';
    const declared = [...body.matchAll(/^ {4}(?:readonly )?(\w+)(?:<[^>]*>)?[(:?]/gm)].map((m) => m[1]!).sort();
    const doc = design('simple-house');
    const schema = house.attributeBaseline.schema;
    const toolkitContext = Object.keys(buildSpatialContextV2(doc, house, 'x', {}, schema)).sort();
    expect(toolkitContext).toContain('customOf');
    expect(declared).toEqual(toolkitContext.filter((m) => m !== 'customOf'));
    // The worker context has the same members (customOf only refuses).
    const data = buildTransformRunData(doc, schema);
    const fail = (message: string) => new Error(message);
    expect(Object.keys(uploadedTransformContext(data, {}, tableMetricReader(data.metrics, (_c, m) => fail(m)), fail)).sort()).toEqual(toolkitContext);
  });

  it('the template is the kit’s first example, word for word, and is what the Template tab downloads', async () => {
    expect(lf(connectSource)).toBe(lf(templateSource));
    expect(lf(await TEMPLATES.transform.load())).toBe(lf(templateSource));
    expect(TEMPLATES.transform.fileName).toBe('transform-template.ts');
  });

  it('connect touching rooms (the template) works as it is: one new edge on the Simple house', async () => {
    const { definition, preview } = await runKitFile(templateSource, 'transform-template.ts', design('simple-house'), house);
    expect(definition.id).toBe('connect-touching-rooms');
    expect(preview.operations).toEqual([{ op: 'add-edge', source: 1, target: 5, relationship: 'access' }]);
    expect(preview.summary).toBe('1 new access edge(s) between rooms that touch.');
    const open = await runKitFile(connectSource, 'connect-touching-rooms.ts', design('simple-house'), house, { relationship: 'open' });
    expect(open.preview.after.edges.at(-1)).toMatchObject({ source: 1, target: 5, relationship: 'open' });
  });

  it('connect touching rooms works in a project without a toolkit', async () => {
    const doc = expectOk(readDesignJson(JSON.stringify(houseGraphOnly))).doc;
    const { preview } = await runKitFile(connectSource, 'connect-touching-rooms.ts', doc, projectOnlyToolkit('p1'));
    expect(preview.operations.length).toBeGreaterThan(0);
  });

  it('grow in one direction: rooms grow where the cells are free, and the preview is valid', async () => {
    const doc = design('simple-house');
    const { preview } = await runKitFile(growSource, 'grow-in-one-direction.ts', doc, house, { direction: '-y' });
    // Kitchen 3 sits at y = 0 below the living room: the entrance, the living room and the rooms upstairs grow towards -y where free.
    expect(preview.operations.every((o) => o.op === 'set-node-geometry')).toBe(true);
    expect(preview.operations.length).toBeGreaterThan(0);
    expect(preview.summary).toMatch(/^\d+ room\(s\) grown towards -y/);
    const kitchens = await runKitFile(growSource, 'grow-in-one-direction.ts', doc, house, { direction: '+x', onlyFunction: 'kitchen' });
    expect(kitchens.preview.operations).toEqual([{ op: 'set-node-geometry', nodeId: 3, position: [1, 0, 0], size: [2, 1, 1] }]);
    const garden = await runKitFile(growSource, 'grow-in-one-direction.ts', design('garden-house'), house, { direction: '+y' });
    expect(garden.preview.after.nodes.length).toBe(design('garden-house').nodes.length);
  });

  it('priority from missing area uses House fields: new priorities with the House toolkit, a plain message without', async () => {
    const { preview } = await runKitFile(prioritySource, 'priority-from-missing-area.ts', design('simple-house'), house);
    expect(preview.operations).toEqual([
      { op: 'set-node-custom-attribute', nodeId: 2, key: 'priority', value: 1 },
      { op: 'set-node-custom-attribute', nodeId: 3, key: 'priority', value: 2 },
      { op: 'set-node-custom-attribute', nodeId: 4, key: 'priority', value: 3 },
    ]);
    const doc = expectOk(readDesignJson(JSON.stringify(houseGraphOnly))).doc;
    const none = await runKitFile(prioritySource, 'priority-from-missing-area.ts', doc, projectOnlyToolkit('p1'));
    expect(none.preview.operations).toEqual([]);
    expect(none.preview.summary).toBe('This project has no targetArea or priority field (they come with the House toolkit).');
  });
});
