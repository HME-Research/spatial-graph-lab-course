import { beforeAll, describe, expect, it } from 'vitest';
import { buildArchitecture, EXAMPLE_FACADES, exampleFacadeProvider, resolveFaces } from '@app/building';
import { parseDesignJson, serializeDesign, validateDocument, type DesignDocument } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { migrateV1toV2, serializeDesignV2 } from '@app/document/v2';
import { typeColor } from '@core/viewer/appearance';
import builtInText from '../document/examples/two-storey-example.json?raw';
import { activate, resolveStartupDesign, type ActiveToolkit } from './activate';
import { checkConformance, typeAppearance } from './conformance';
import { TOOLKIT_GLOBS } from './toolkitGlobs';
import { runAlgorithm } from './run';
import { expectExtOk } from './test-fixtures';

/**
 * The real example project, loaded through the real Vite globs. Pins that it reproduces the
 * existing gallery/studio/storage behaviour and that its algorithms give the documented results.
 */

let project: ActiveToolkit;
const builtIn = expectOk(parseDesignJson(builtInText));

beforeAll(async () => {
  const { activation, discovery } = await activate(TOOLKIT_GLOBS, {});
  expect(discovery).toEqual([]);
  if (activation.status !== 'active') throw new Error(`example-gallery did not activate: ${JSON.stringify(activation)}`);
  project = activation.toolkit;
});

describe('toolkits/example-gallery', () => {
  it('is selected by default and activates without diagnostics', () => {
    expect(project.id).toBe('example-gallery');
    expect(project.diagnostics).toEqual([]);
    expect(project.nodeTypes.map((t) => [t.id, t.status.ok])).toEqual([
      ['gallery', true],
      ['storage', true],
      ['studio', true],
    ]);
    expect(project.algorithms.map((a) => [a.id, a.definition.scope, a.status.ok])).toEqual([
      ['access-depth', 'graph', true],
      ['connect-storage-to-galleries', 'spatial', true],
      ['daylight-from-exposure', 'spatial', true],
    ]);
  });

  it('teaching copy of the design has not drifted from the built-in example', () => {
    const copy = project.designs.find((d) => d.id === 'two-storey-example')!;
    expect(copy.file).toBe('toolkits/example-gallery/designs/two-storey-example.json');
    expect(copy.sourceVersion).toBe(1);
    expect(copy.result.ok && serializeDesignV2(copy.result.value)).toBe(serializeDesignV2(migrateV1toV2(builtIn)));
  });

  it('starts with its default design (the same content as the built-in example)', () => {
    const start = resolveStartupDesign({ status: 'active', toolkit: project }, { doc: migrateV1toV2(builtIn), source: 'built-in' });
    expect(start.source).toBe('toolkits/example-gallery/designs/two-storey-example.json');
    expect(start.doc && serializeDesignV2(start.doc)).toBe(serializeDesignV2(migrateV1toV2(builtIn)));
  });

  it('reproduces the existing appearance: typeColor and the example façades', () => {
    for (const id of ['gallery', 'studio', 'storage']) {
      expect(typeAppearance(project, id)).toEqual({ status: 'ok', color: typeColor(id), facade: EXAMPLE_FACADES[id] });
    }
    expect(typeAppearance(project, 'lab')).toEqual({ status: 'ok', color: typeColor('lab'), facade: exampleFacadeProvider('lab') });
  });

  it('produces identical architecture with the project façades', () => {
    const facade = (typeId: string) => {
      const a = typeAppearance(project, typeId);
      if (a.status !== 'ok') throw new Error('broken');
      return a.facade;
    };
    expect(buildArchitecture(resolveFaces(builtIn), { facade })).toEqual(buildArchitecture(resolveFaces(builtIn)));
  });

  it('the example design conforms fully: store.daylight is a project-wide node field since phase 02', () => {
    expect(checkConformance(builtIn, project).map((d) => [d.id, d.severity])).toEqual([]);
    expect(project.attributeBaseline.schema.nodes.map((f) => f.key)).toEqual(['daylight', 'public', 'occupancy']);
  });
});

describe('example algorithms on the example design', () => {
  const run = (id: string, doc: DesignDocument = builtIn, params?: unknown) => expectExtOk(runAlgorithm(doc, project, id, params));

  it('access-depth (generic analysis) counts steps from the entrance', () => {
    expect(run('access-depth')).toEqual({
      kind: 'analysis',
      result: {
        kind: 'analysis',
        summary: '0 room(s) cannot be reached from "entry-gallery".',
        nodeValues: { 'entry-gallery': 0, 'studio-ground': 1, 'reading-gallery': 1, store: 2, 'studio-upper': 1, 'gallery-upper': 2 },
      },
    });
    const missing = run('access-depth', builtIn, { start: 'nowhere' });
    expect(missing.kind === 'analysis' && Object.values(missing.result.nodeValues).every((v) => v === null)).toBe(true);
  });

  it('daylight-from-exposure changes only the entry gallery (two exposed walls → medium)', () => {
    const outcome = run('daylight-from-exposure');
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.operations).toEqual([{ op: 'set-node-attribute', nodeId: 'entry-gallery', key: 'daylight', value: 'medium' }]);
    expect(outcome.preview.after.nodes.find((n) => n.id === 'entry-gallery')!.attributes).toEqual({ daylight: 'medium', public: true });
    // Running it again on the result changes nothing.
    const again = run('daylight-from-exposure', outcome.preview.after);
    expect(again.kind === 'transformation' && again.preview.operations).toEqual([]);
  });

  it('connect-storage-to-galleries adds the one missing door (store – reading gallery)', () => {
    const outcome = run('connect-storage-to-galleries');
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.operations).toEqual([{ op: 'add-edge', id: 'door-1', source: 'store', target: 'reading-gallery', kind: 'door' }]);
    const faces = resolveFaces(outcome.preview.after);
    const wall = faces.find((f) => f.edgeId === 'door-1')!;
    expect(wall.condition).toBe('door');
  });

  it('never changes the design it ran on', () => {
    const before = serializeDesign(builtIn);
    for (const a of project.algorithms) runAlgorithm(builtIn, project, a.id);
    expect(serializeDesign(builtIn)).toBe(before);
    expect(validateDocument(builtIn).ok).toBe(true);
  });
});
